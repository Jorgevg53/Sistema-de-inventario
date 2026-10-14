'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const backups = require('./backups');
const { HttpError } = require('./util');

const ROOT = path.join(__dirname, '..');

function vendorDir(pkgFile) {
  return path.dirname(path.join(ROOT, 'node_modules', pkgFile));
}

/**
 * Valor de TRUST_PROXY para app.set('trust proxy'). Por defecto 'loopback' (proxy en el mismo equipo).
 * Acepta true/false, un número de saltos (1, 2…) o una lista: 'loopback, uniquelocal', IPs o subredes.
 */
function trustProxySetting(value = process.env.TRUST_PROXY) {
  const v = String(value ?? '').trim();
  if (!v) return 'loopback';
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxySetting());

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Librerías de terceros servidas localmente (el sistema funciona sin internet).
  app.use('/vendor/vue', express.static(vendorDir('vue/dist/vue.global.prod.js'), { maxAge: '7d' }));
  app.use('/vendor/chart', express.static(vendorDir('chart.js/dist/chart.umd.min.js'), { maxAge: '7d' }));
  app.use('/vendor/jsbarcode', express.static(vendorDir('jsbarcode/dist/JsBarcode.all.min.js'), { maxAge: '7d' }));
  app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));

  const authRoutes = require('./routes/auth');
  const api = express.Router();
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(authRoutes.publicRouter);
  api.use(auth.requireAuth);
  // El JSON grande (imágenes de productos, CSV) solo se lee con sesión válida: sin sesión nadie puede
  // mandar cuerpos de varios MB. Solo procesa application/json; la restauración (binario) no se ve afectada.
  api.use(express.json({ limit: '20mb' }));
  api.use(authRoutes.router);
  api.use(require('./routes/admin'));
  api.use(require('./routes/backups'));
  api.use(require('./routes/catalog'));
  api.use(require('./routes/products'));
  api.use(require('./routes/inventory'));
  api.use(require('./routes/customers'));
  api.use(require('./routes/cash'));
  api.use(require('./routes/sales'));
  api.use(require('./routes/reports'));
  api.use((req, res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
  app.use('/api', api);

  // Errores
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Error interno';
    if (err.code === 'ERR_SQLITE_ERROR' && /UNIQUE/.test(message)) {
      status = 400;
      message = 'Ya existe un registro con esos datos (valor duplicado).';
    } else if (err.type === 'entity.too.large') {
      status = 413;
      message = 'El archivo o la información enviada es demasiado grande.';
    } else if (status >= 500) {
      console.error(err);
      message = 'Ocurrió un error inesperado en el servidor.';
    }
    if (req.path.startsWith('/api')) return res.status(status).json({ error: message });
    res.status(status).send(message);
  });

  return app;
}

function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

const isLoopback = (host) => /^(127\.|::1$|localhost$)/i.test(host);
const inContainer = () => fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');

/** Líneas del aviso de inicio con las direcciones para abrir el sistema. */
function addressLines(port, host) {
  const anyHost = !host || host === '0.0.0.0' || host === '::';
  if (!anyHost && !isLoopback(host)) return [`   Abre: http://${host}:${port}`];
  // Dentro de Docker ni localhost ni las IP del contenedor son las del servidor.
  if (anyHost && inContainer()) {
    return ['   Abre: http://IP-DEL-SERVIDOR:PUERTO (PUERTO = el que publica Docker; 3000 por defecto)'];
  }
  const lines = [`   Abre en este equipo:   http://localhost:${port}`];
  if (!anyHost) lines.push(`   Solo acepta conexiones de este mismo equipo (HOST=${host}).`);
  else for (const ip of localAddresses()) lines.push(`   Desde otro dispositivo: http://${ip}:${port}`);
  return lines;
}

function openBrowser(url) {
  const { spawn } = require('node:child_process');
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* sin navegador disponible */ }
}

// HOST (opcional) limita las interfaces en las que escucha, p. ej. 127.0.0.1 detrás de Caddy (Opción D).
function start(port = Number(process.env.PORT) || 3000, host = process.env.HOST || '') {
  db.open();
  auth.ensureAdmin();
  const app = createApp();
  // Solo aquí (no en createApp) para que las pruebas no generen respaldos.
  const autoBackups = backups.schedule();
  const onListen = (err) => {
    if (err) return; // Express 5 también llama aquí con el error; se atiende en server.on('error').
    console.log('');
    console.log('  ==============================================');
    console.log('   Sistema de Punto de Venta e Inventario');
    console.log('  ==============================================');
    for (const line of addressLines(port, host)) console.log(line);
    console.log(`   Base de datos: ${db.DB_FILE}`);
    if (autoBackups) console.log(`   Respaldos automáticos: ${backups.backupDir()} (diarios, se conservan ${backups.keepCount()})`);
    else console.log('   Respaldos automáticos: desactivados (AUTO_RESPALDO=0)');
    console.log('   Para detener el sistema presiona Ctrl + C');
    console.log('');
    if (process.env.ABRIR_NAVEGADOR === '1') openBrowser(`http://localhost:${port}`);
  };
  const server = host ? app.listen(port, host, onListen) : app.listen(port, onListen);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Lo normal es que el sistema ya esté abierto: NO hay que abrir una segunda copia sobre la misma base.
      const cambiar = process.platform === 'win32' ? 'setx PORT 3001 (y vuelve a abrir el sistema)' : 'PORT=3001 ./iniciar.sh';
      console.error(`\n  El puerto ${port} ya está en uso. Lo más probable es que el sistema YA esté abierto`);
      console.error('  (en otra ventana, minimizado o por el inicio automático): usa esa ventana o abre');
      console.error(`  http://localhost:${port} en tu navegador. No abras una segunda copia del sistema.`);
      console.error(`  Solo si OTRO programa ocupa el puerto, cambia el del sistema con: ${cambiar}`);
      console.error('  (ver DESPLIEGUE.md, sección 8.1).\n');
      if (process.env.ABRIR_NAVEGADOR === '1') openBrowser(`http://localhost:${port}`);
      process.exit(1);
    }
    throw err;
  });
  const shutdown = () => {
    if (autoBackups) autoBackups.stop();
    server.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown); // cierre de la ventana de consola en Windows
  return server;
}

if (require.main === module) start();

module.exports = { createApp, start, trustProxySetting };
