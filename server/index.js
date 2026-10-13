'use strict';
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const { HttpError } = require('./util');

const ROOT = path.join(__dirname, '..');

function vendorDir(pkgFile) {
  return path.dirname(path.join(ROOT, 'node_modules', pkgFile));
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

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
  // express.json solo procesa application/json; la restauración de respaldos (binario) no se ve afectada.
  api.use(express.json({ limit: '20mb' }));
  api.use(authRoutes.publicRouter);
  api.use(auth.requireAuth);
  api.use(authRoutes.router);
  api.use(require('./routes/admin'));
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

function openBrowser(url) {
  const { spawn } = require('node:child_process');
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* sin navegador disponible */ }
}

function start(port = Number(process.env.PORT) || 3000) {
  db.open();
  auth.ensureAdmin();
  const app = createApp();
  const server = app.listen(port, () => {
    console.log('');
    console.log('  ==============================================');
    console.log('   Sistema de Punto de Venta e Inventario');
    console.log('  ==============================================');
    console.log(`   Abre en este equipo:   http://localhost:${port}`);
    for (const ip of localAddresses()) console.log(`   Desde otro dispositivo: http://${ip}:${port}`);
    console.log(`   Base de datos: ${db.DB_FILE}`);
    console.log('   Para detener el sistema presiona Ctrl + C');
    console.log('');
    if (process.env.ABRIR_NAVEGADOR === '1') openBrowser(`http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  El puerto ${port} ya está en uso. ¿El sistema ya está abierto en otra ventana?`);
      console.error(`  Abre http://localhost:${port} en tu navegador, o inicia con otro puerto: PORT=3001\n`);
      if (process.env.ABRIR_NAVEGADOR === '1') openBrowser(`http://localhost:${port}`);
      process.exit(1);
    }
    throw err;
  });
  const shutdown = () => {
    server.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) start();

module.exports = { createApp, start };
