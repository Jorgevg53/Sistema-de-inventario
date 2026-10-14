'use strict';
/* Respaldos automáticos diarios de la base en DATA_DIR/respaldos. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const db = require('./db');
const { dateOnly, nowLocal } = require('./util');

// Solo estos nombres se listan y se pueden descargar (evita path traversal).
const NAME_RE = /^(auto-\d{4}-\d{2}-\d{2}|antes-de-restaurar-[0-9-]+)\.db$/;
const AUTO_RE = /^auto-\d{4}-\d{2}-\d{2}\.db$/;
const DEFAULT_KEEP = 30;

function backupDir() {
  return path.join(db.DATA_DIR, 'respaldos');
}

function isValidName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

/**
 * Copia completa y consistente de la base abierta en `file` (VACUUM INTO), SIN las sesiones:
 * un respaldo (que puede terminar en una USB o en la nube) no debe servir para entrar al sistema.
 * La usan el respaldo manual, los automáticos y la copia previa a una restauración.
 */
function writeSnapshot(file) {
  const conn = db.raw();
  if (!conn) throw new Error('La base de datos no está abierta.');
  conn.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  try {
    const copy = new DatabaseSync(file);
    try {
      // secure_delete sobrescribe con ceros lo borrado: los tokens no quedan en páginas libres del archivo.
      copy.exec('PRAGMA secure_delete = ON; DELETE FROM sessions;');
    } finally {
      copy.close();
    }
  } catch (err) {
    fs.rmSync(file, { force: true }); // nunca dejar una copia con sesiones
    throw err;
  }
}

/** Cantidad de respaldos automáticos a conservar (RESPALDOS_DIAS, 30 por defecto). */
function keepCount() {
  const n = Number.parseInt(process.env.RESPALDOS_DIAS, 10);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_KEEP;
}

/** Borra los auto-*.db más viejos y deja solo los `keep` más recientes. Nunca toca otros archivos. */
function prune(keep = keepCount()) {
  const dir = backupDir();
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  // La fecha va en el nombre (YYYY-MM-DD), así que el orden alfabético es cronológico.
  const autos = names.filter((n) => AUTO_RE.test(n)).sort().reverse();
  const removed = [];
  for (const name of autos.slice(Math.max(1, keep))) {
    fs.rmSync(path.join(dir, name), { force: true });
    removed.push(name);
  }
  return removed;
}

/**
 * Crea auto-YYYY-MM-DD.db (fecha local) si aún no existe el de hoy y aplica la retención.
 * Devuelve { created: nombre | null, removed: [nombres borrados] }.
 */
function runAutoBackup({ now = new Date(), keep = keepCount() } = {}) {
  if (!db.raw()) throw new Error('La base de datos no está abierta.');
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `auto-${dateOnly(now)}.db`;
  const file = path.join(dir, name);
  let created = null;
  if (!fs.existsSync(file)) {
    // Se escribe a un temporal y luego se renombra, para no dejar un respaldo a medias con el nombre final.
    const tmp = `${file}.tmp`;
    fs.rmSync(tmp, { force: true });
    try {
      writeSnapshot(tmp);
      fs.renameSync(tmp, file);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
    created = name;
  }
  return { created, removed: prune(keep) };
}

/** Lista los respaldos descargables (más recientes primero). */
function list() {
  const dir = backupDir();
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const name of names) {
    if (!isValidName(name)) continue;
    try {
      const st = fs.statSync(path.join(dir, name));
      if (!st.isFile()) continue;
      out.push({ name, type: name.startsWith('auto-') ? 'auto' : 'restauracion', size: st.size, modified_at: nowLocal(st.mtime) });
    } catch { /* se borró mientras se listaba */ }
  }
  return out.sort((a, b) => b.modified_at.localeCompare(a.modified_at) || b.name.localeCompare(a.name));
}

/**
 * Programa el respaldo automático: unos segundos después de iniciar y luego cada hora
 * revisa si ya existe el de hoy. AUTO_RESPALDO=0 lo desactiva. Los errores nunca tumban el servidor.
 */
function schedule({ delayMs = 5000, intervalMs = 3600 * 1000 } = {}) {
  if (process.env.AUTO_RESPALDO === '0') return null;
  const tick = () => {
    try {
      const r = runAutoBackup();
      if (r.created) console.log(`  [${nowLocal()}] Respaldo automático guardado: ${path.join(backupDir(), r.created)}`);
      if (r.removed.length) console.log(`  [${nowLocal()}] Respaldos automáticos antiguos eliminados: ${r.removed.join(', ')}`);
    } catch (err) {
      console.error(`  [${nowLocal()}] No se pudo crear el respaldo automático:`, err.message);
    }
  };
  const first = setTimeout(tick, delayMs);
  const timer = setInterval(tick, intervalMs);
  first.unref();
  timer.unref();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}

module.exports = { NAME_RE, backupDir, isValidName, keepCount, prune, writeSnapshot, runAutoBackup, list, schedule };
