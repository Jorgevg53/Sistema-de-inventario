'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const claude = require('./brain/claude');
const { HttpError } = require('./util');

const ROOT = path.join(__dirname, '..');

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
    // El micrófono se usa para hablar con JARVIS.
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
    next();
  });

  // Vue servido localmente: la interfaz funciona sin internet.
  app.use('/vendor/vue', express.static(path.join(ROOT, 'node_modules', 'vue', 'dist'), { maxAge: '7d', index: false }));
  app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));

  const routes = require('./routes');
  const api = express.Router();
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(routes.publicRouter);
  api.use(auth.requireAuth);
  api.use(express.json({ limit: '5mb' }));
  api.use(routes.router);
  api.use((req, res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
  app.use('/api', api);

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Error interno';
    if (err.type === 'entity.too.large') {
      status = 413;
      message = 'La información enviada es demasiado grande.';
    } else if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'El JSON enviado no es válido.';
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

// PORT: 3100 por defecto (el punto de venta usa el 3000). HOST limita las interfaces, p. ej. 127.0.0.1.
function start(port = Number(process.env.PORT) || 3100, host = process.env.HOST || '') {
  db.open();
  const app = createApp();
  const onListen = (err) => {
    if (err) return;
    const anyHost = !host || host === '0.0.0.0' || host === '::';
    console.log('');
    console.log('  ==============================================');
    console.log('   J.A.R.V.I.S. · Asistente personal');
    console.log('  ==============================================');
    console.log(`   Abre en este equipo:  http://localhost:${port}`);
    if (anyHost && fs.existsSync('/.dockerenv')) console.log('   (Docker: usa la IP del servidor y el puerto publicado)');
    else if (anyHost) {
      for (const ip of localAddresses()) console.log(`   Desde el celular:     http://${ip}:${port}${auth.passwordRequired() ? '' : '  (primero define una contraseña en Ajustes)'}`);
    }
    console.log(`   Inteligencia: ${claude.enabled() ? `Claude (${claude.model()})` : 'modo básico (agrega tu clave de Claude en Ajustes)'}`);
    console.log(`   Datos: ${db.DB_FILE}`);
    console.log('   Para detener JARVIS presiona Ctrl + C');
    console.log('');
    if (process.env.ABRIR_NAVEGADOR === '1') openBrowser(`http://localhost:${port}`);
  };
  const server = host ? app.listen(port, host, onListen) : app.listen(port, onListen);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  El puerto ${port} ya está en uso: lo más probable es que JARVIS ya esté abierto.`);
      console.error(`  Abre http://localhost:${port} en tu navegador. Si otro programa usa ese puerto, inicia con PORT=3101.\n`);
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
  process.on('SIGHUP', shutdown);
  return server;
}

if (require.main === module) start();

module.exports = { createApp, start };
