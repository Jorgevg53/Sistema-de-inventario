'use strict';
/** Carga datos de demostración: npm run demo */
const db = require('./db');
const auth = require('./auth');
const demo = require('./demo');

db.open();
auth.ensureAdmin();
try {
  demo.seedDemo({ withSales: !process.argv.includes('--sin-ventas') });
  console.log('Datos de demostración cargados correctamente.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  db.close();
}
