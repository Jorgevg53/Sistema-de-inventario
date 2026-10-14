'use strict';
/* Pruebas de operación en producción: health, respaldos automáticos, proxy y cookie Secure. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-ops-'));
process.env.DATA_DIR = tmp;
process.env.DB_FILE = path.join(tmp, 'test.db');
// Un proxy (p. ej. nginx o Caddy) delante del servidor: se confía en 1 salto.
process.env.TRUST_PROXY = '1';
delete process.env.RESPALDOS_DIAS;
delete process.env.AUTO_RESPALDO;

const db = require('../server/db');
const auth = require('../server/auth');
const backups = require('../server/backups');
const { createApp, trustProxySetting } = require('../server/index');
const { dateOnly } = require('../server/util');
const { version } = require('../package.json');

const RESPALDOS = path.join(tmp, 'respaldos');
const servers = [];
let base;

async function listen(app) {
  const server = app.listen(0);
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  return `http://127.0.0.1:${server.address().port}`;
}

async function login(url, username, password, headers = {}) {
  const res = await fetch(url + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username, password }),
  });
  return { res, setCookie: res.headers.get('set-cookie') || '', cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

let adminCookie;
let cashierCookie;

before(async () => {
  db.open();
  auth.ensureAdmin();
  base = await listen(createApp());
  adminCookie = (await login(base, 'admin', 'admin123')).cookie;
  assert.match(adminCookie, /^sid=[0-9a-f]{64}$/);
  const r = await fetch(base + '/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ name: 'Cajera', username: 'cajera', password: 'secreto1', role: 'cajero' }),
  });
  assert.equal(r.status, 201);
  cashierCookie = (await login(base, 'cajera', 'secreto1')).cookie;
});

after(() => {
  for (const s of servers) s.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

test('GET /api/health responde sin sesión con versión y hora local', async () => {
  const res = await fetch(base + '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.version, version);
  assert.match(data.time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('GET /api/health responde 503 si la base no está disponible', async () => {
  db.close();
  try {
    const res = await fetch(base + '/api/health');
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false });
  } finally {
    db.open();
  }
  assert.equal((await fetch(base + '/api/health')).status, 200);
});

test('TRUST_PROXY: conversión de valores', () => {
  assert.equal(trustProxySetting(null), 'loopback');
  assert.equal(trustProxySetting(''), 'loopback');
  assert.equal(trustProxySetting('true'), true);
  assert.equal(trustProxySetting('FALSE'), false);
  assert.equal(trustProxySetting('1'), 1);
  assert.equal(trustProxySetting('2'), 2);
  assert.equal(trustProxySetting('loopback, uniquelocal'), 'loopback, uniquelocal');
  assert.equal(trustProxySetting(' 10.0.0.0/8 '), '10.0.0.0/8');
});

test('respaldo automático: crea el de hoy y la retención solo borra auto-*.db viejos', () => {
  fs.mkdirSync(RESPALDOS, { recursive: true });
  const viejos = ['auto-2020-01-01.db', 'auto-2020-01-02.db', 'auto-2020-01-03.db', 'auto-2020-01-04.db', 'auto-2020-01-05.db'];
  const ajenos = ['antes-de-restaurar-2020-01-01-10-00-00.db', 'notas.txt', 'auto-copia-manual.db'];
  for (const f of [...viejos, ...ajenos]) fs.writeFileSync(path.join(RESPALDOS, f), 'x');

  const hoy = `auto-${dateOnly()}.db`;
  const r = backups.runAutoBackup({ keep: 3 });
  assert.equal(r.created, hoy);
  assert.deepEqual(r.removed.sort(), ['auto-2020-01-01.db', 'auto-2020-01-02.db', 'auto-2020-01-03.db']);

  const quedan = fs.readdirSync(RESPALDOS).sort();
  assert.deepEqual(quedan, [...ajenos, 'auto-2020-01-04.db', 'auto-2020-01-05.db', hoy].sort());

  // El respaldo es una base SQLite válida con las tablas del sistema.
  const file = path.join(RESPALDOS, hoy);
  assert.equal(fs.readFileSync(file).subarray(0, 15).toString(), 'SQLite format 3');
  const copy = new DatabaseSync(file, { readOnly: true });
  const { n } = copy.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'admin'").get();
  copy.close();
  assert.equal(n, 1);

  // Si ya existe el de hoy no se vuelve a crear ni se borra nada más.
  const mtime = fs.statSync(file).mtimeMs;
  assert.deepEqual(backups.runAutoBackup({ keep: 3 }), { created: null, removed: [] });
  assert.equal(fs.statSync(file).mtimeMs, mtime);
});

test('respaldo automático: RESPALDOS_DIAS controla cuántos se conservan', () => {
  process.env.RESPALDOS_DIAS = '2';
  try {
    assert.equal(backups.keepCount(), 2);
    const r = backups.runAutoBackup();
    assert.equal(r.created, null);
    assert.deepEqual(r.removed, ['auto-2020-01-04.db']);
  } finally {
    delete process.env.RESPALDOS_DIAS;
  }
  assert.equal(backups.keepCount(), 30);
  process.env.RESPALDOS_DIAS = 'abc';
  assert.equal(backups.keepCount(), 30);
  delete process.env.RESPALDOS_DIAS;
  assert.ok(fs.existsSync(path.join(RESPALDOS, 'antes-de-restaurar-2020-01-01-10-00-00.db')));
});

test('respaldo automático programado: se ejecuta solo y AUTO_RESPALDO=0 lo desactiva', async () => {
  const hoy = path.join(RESPALDOS, `auto-${dateOnly()}.db`);
  fs.rmSync(hoy);

  process.env.AUTO_RESPALDO = '0';
  try {
    assert.equal(backups.schedule({ delayMs: 1 }), null);
  } finally {
    delete process.env.AUTO_RESPALDO;
  }

  const job = backups.schedule({ delayMs: 10, intervalMs: 60 * 1000 });
  try {
    for (let i = 0; i < 100 && !fs.existsSync(hoy); i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(fs.existsSync(hoy), 'debe crearse el respaldo de hoy');
  } finally {
    job.stop();
  }
});

test('respaldo automático: un error no lanza excepción en el temporizador', async () => {
  const hoy = path.join(RESPALDOS, `auto-${dateOnly()}.db`);
  fs.rmSync(hoy);
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  db.close();
  const job = backups.schedule({ delayMs: 5, intervalMs: 60 * 1000 });
  try {
    for (let i = 0; i < 100 && !errors.length; i++) await new Promise((r) => setTimeout(r, 20));
  } finally {
    job.stop();
    console.error = original;
    db.open();
  }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /No se pudo crear el respaldo automático/);
  assert.ok(!fs.existsSync(hoy));
  assert.ok(!fs.existsSync(hoy + '.tmp'));
  backups.runAutoBackup();
  assert.ok(fs.existsSync(hoy));
});

test('GET /api/backups exige sesión y permiso de configuración', async () => {
  assert.equal((await fetch(base + '/api/backups')).status, 401);
  assert.equal((await fetch(base + '/api/backups', { headers: { Cookie: cashierCookie } })).status, 403);
  const res = await fetch(base + '/api/backups', { headers: { Cookie: adminCookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.keep, 30);
  assert.equal(data.dir, RESPALDOS);
  const names = data.files.map((f) => f.name);
  assert.ok(names.includes(`auto-${dateOnly()}.db`));
  assert.ok(names.includes('antes-de-restaurar-2020-01-01-10-00-00.db'));
  assert.ok(!names.includes('notas.txt'));
  assert.ok(!names.includes('auto-copia-manual.db'));
  const hoy = data.files.find((f) => f.name === `auto-${dateOnly()}.db`);
  assert.equal(hoy.type, 'auto');
  assert.ok(hoy.size > 1000);
  assert.match(hoy.modified_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(data.files.find((f) => f.name.startsWith('antes-')).type, 'restauracion');
});

test('GET /api/backups/:name descarga solo nombres válidos', async () => {
  const name = `auto-${dateOnly()}.db`;
  const headers = { Cookie: adminCookie };
  assert.equal((await fetch(base + '/api/backups/' + name)).status, 401);
  assert.equal((await fetch(base + '/api/backups/' + name, { headers: { Cookie: cashierCookie } })).status, 403);

  const ok = await fetch(base + '/api/backups/' + name, { headers });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-disposition') || '', new RegExp(`^attachment; filename="?${name.replace(/\./g, '\\.')}"?$`));
  const buf = Buffer.from(await ok.arrayBuffer());
  assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');

  // Nombres fuera del patrón (incluye intentos de salir de la carpeta) → 400.
  for (const bad of ['notas.txt', 'auto-copia-manual.db', '..%2Ftest.db', '..%2F..%2Fpackage.json', '%2E%2E%2Ftest.db',
    'auto-2020-01-05.db%2F..%2F..%2Ftest.db', '..%5Ctest.db', 'test.db', 'auto-2020-01-05.db.tmp']) {
    const r = await fetch(base + '/api/backups/' + bad, { headers });
    assert.equal(r.status, 400, bad);
  }
  // Nombre válido pero inexistente → 404.
  assert.equal((await fetch(base + '/api/backups/auto-1999-01-01.db', { headers })).status, 404);
  // Rutas con segmentos ".." que el cliente normaliza fuera de /api/backups → no llegan al archivo.
  const r = await fetch(base + '/api/backups/../../test.db', { headers });
  assert.equal(r.status, 404);
});

test('cookie de sesión: Secure con HTTPS detrás de proxy de confianza, sin Secure en http simple', async () => {
  const plain = await login(base, 'admin', 'admin123');
  assert.equal(plain.res.status, 200);
  assert.match(plain.setCookie, /HttpOnly; SameSite=Lax; Path=\//);
  assert.doesNotMatch(plain.setCookie, /Secure/i);

  const https = await login(base, 'admin', 'admin123', { 'X-Forwarded-Proto': 'https' });
  assert.equal(https.res.status, 200);
  assert.match(https.setCookie, /; Secure/);
  assert.match(https.setCookie, /HttpOnly/);

  // Cerrar sesión también borra la cookie con el atributo Secure.
  const out = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: https.cookie, 'X-Forwarded-Proto': 'https' } });
  assert.equal(out.status, 200);
  const cleared = out.headers.get('set-cookie') || '';
  assert.match(cleared, /^sid=;/);
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /; Secure/);

  const outPlain = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: plain.cookie } });
  assert.equal(outPlain.status, 200);
  assert.doesNotMatch(outPlain.headers.get('set-cookie') || '', /Secure/i);
});

test('TRUST_PROXY=false ignora X-Forwarded-Proto (no marca Secure)', async () => {
  process.env.TRUST_PROXY = 'false';
  let url;
  try {
    url = await listen(createApp());
  } finally {
    process.env.TRUST_PROXY = '1';
  }
  const r = await login(url, 'admin', 'admin123', { 'X-Forwarded-Proto': 'https' });
  assert.equal(r.res.status, 200);
  assert.doesNotMatch(r.setCookie, /Secure/i);
});

// ---------------------------------------------------------------------------
// Respaldos sin sesiones, límite de intentos, cuerpos grandes, usuario inicial y recuperación de admin.

test('respaldos sin sesiones (manual, automático y antes de restaurar); restaurar cierra todas las sesiones', async () => {
  const token = Buffer.from(adminCookie.slice('sid='.length));
  const sesiones = (file) => {
    const c = new DatabaseSync(file, { readOnly: true });
    try { return c.prepare('SELECT COUNT(*) AS n FROM sessions').get().n; } finally { c.close(); }
  };

  // Manual: el archivo no trae sesiones ni el token (ni en páginas libres), pero la sesión sigue viva.
  const res = await fetch(base + '/api/backup', { headers: { Cookie: adminCookie } });
  assert.equal(res.status, 200);
  const manual = Buffer.from(await res.arrayBuffer());
  const manualFile = path.join(tmp, 'manual.db');
  fs.writeFileSync(manualFile, manual);
  assert.equal(sesiones(manualFile), 0);
  assert.ok(!manual.includes(token), 'el token no debe quedar en el respaldo');
  assert.ok(db.get('SELECT COUNT(*) AS n FROM sessions').n > 0);
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: adminCookie } })).status, 200);

  // Automático.
  const hoy = path.join(RESPALDOS, `auto-${dateOnly()}.db`);
  fs.rmSync(hoy, { force: true });
  assert.equal(backups.runAutoBackup().created, path.basename(hoy));
  assert.equal(sesiones(hoy), 0);
  assert.ok(!fs.readFileSync(hoy).includes(token));

  // Restaurar: la copia previa tampoco trae sesiones y nadie conserva la suya.
  const previos = new Set(fs.readdirSync(RESPALDOS));
  const r = await fetch(base + '/api/backup/restore', {
    method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/octet-stream' }, body: manual,
  });
  assert.equal(r.status, 200);
  const safety = fs.readdirSync(RESPALDOS).find((n) => !previos.has(n) && n.startsWith('antes-de-restaurar-'));
  assert.ok(safety, 'debe crearse la copia antes-de-restaurar');
  assert.equal(sesiones(path.join(RESPALDOS, safety)), 0);
  assert.ok(!fs.readFileSync(path.join(RESPALDOS, safety)).includes(token));
  assert.equal(db.get('SELECT COUNT(*) AS n FROM sessions').n, 0);
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: adminCookie } })).status, 401);
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: cashierCookie } })).status, 401);

  adminCookie = (await login(base, 'admin', 'admin123')).cookie;
  cashierCookie = (await login(base, 'cajera', 'secreto1')).cookie;
  assert.match(adminCookie, /^sid=[0-9a-f]{64}$/);
  assert.match(cashierCookie, /^sid=[0-9a-f]{64}$/);
});

test('límite de intentos: llenar la tabla con usuarios inventados no quita un bloqueo; tope de 30 fallos por IP', async () => {
  // TRUST_PROXY=1 en estas pruebas: X-Forwarded-For simula dispositivos distintos.
  const intento = (username, ip, password = 'equivocada') => fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ username, password }),
  }).then((r) => r.status);

  for (let i = 0; i < 8; i++) assert.equal(await intento('admin', '198.51.100.7'), 401);
  assert.equal(await intento('admin', '198.51.100.7', 'admin123'), 429);

  // Antes, más de 1000 entradas vaciaban la tabla y el bloqueo desaparecía.
  for (let i = 0; i < 1100; i++) assert.equal(await intento(`nadie${i}`, `10.1.${i >> 8}.${i & 255}`), 401);
  assert.equal(await intento('admin', '198.51.100.7', 'admin123'), 429);
  // Otro dispositivo no queda bloqueado.
  assert.equal(await intento('admin', '198.51.100.8', 'admin123'), 200);

  // Desde una misma IP: 30 fallos con cualquier usuario bloquean esa IP para todos los usuarios.
  for (let i = 0; i < 30; i++) assert.equal(await intento(`otro${i}`, '203.0.113.9'), 401);
  assert.equal(await intento('otro-mas', '203.0.113.9'), 429);
  assert.equal(await intento('admin', '203.0.113.9', 'admin123'), 429);
});

test('sin sesión no se leen cuerpos JSON grandes; con sesión sí', async () => {
  const login413 = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'x'.repeat(50 * 1024) }),
  });
  assert.equal(login413.status, 413);

  const grande = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) });
  const headers = { 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/products/999999/image', { method: 'PUT', headers, body: grande })).status, 401);
  // Con sesión el JSON de 2 MB se lee y responde la ruta (404: no existe el producto), no 413.
  const conSesion = await fetch(base + '/api/products/999999/image', { method: 'PUT', headers: { ...headers, Cookie: adminCookie }, body: grande });
  assert.equal(conSesion.status, 404);

  // Un inicio de sesión que no es JSON responde 400 con mensaje, no un error 500.
  const noJson = await fetch(base + '/api/auth/login', { method: 'POST', body: 'username=admin' });
  assert.equal(noJson.status, 400);
});

test('usuario inicial: admin123 en la PC; aleatoria con NODE_ENV=production; ADMIN_PASSWORD_INICIAL', () => {
  const file = path.join(tmp, 'inicial.db');
  const vars = ['NODE_ENV', 'ADMIN_PASSWORD_INICIAL'];
  const saved = Object.fromEntries(vars.map((k) => [k, process.env[k]]));
  const crear = (env) => {
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
    for (const k of vars) if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
    const logs = [];
    const { log, warn } = console;
    console.log = (...a) => logs.push(a.join(' '));
    console.warn = (...a) => logs.push(a.join(' '));
    db.close();
    db.open(file);
    try {
      const password = auth.ensureAdmin();
      const user = db.get("SELECT * FROM users WHERE username = 'admin'");
      return { password, user, again: auth.ensureAdmin(), logs: logs.join('\n') };
    } finally {
      console.log = log;
      console.warn = warn;
      db.close();
      db.open();
      for (const k of vars) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  };

  const pc = crear({});
  assert.equal(pc.password, 'admin123');
  assert.equal(pc.user.must_change_password, 1);
  assert.equal(pc.again, null, 'si ya hay usuarios no crea nada');

  const prod = crear({ NODE_ENV: 'production' });
  assert.match(prod.password, /^[A-Za-z0-9]{12}$/);
  assert.notEqual(prod.password, 'admin123');
  assert.ok(auth.verifyPassword(prod.password, prod.user.password_hash));
  assert.ok(!auth.verifyPassword('admin123', prod.user.password_hash));
  assert.equal(prod.user.must_change_password, 1);
  assert.match(prod.logs, new RegExp(`contraseña: ${prod.password}`), 'se muestra en los mensajes para poder entrar');
  assert.notEqual(crear({ NODE_ENV: 'production' }).password, prod.password);

  const fija = crear({ NODE_ENV: 'production', ADMIN_PASSWORD_INICIAL: 'Inicial-2026' });
  assert.equal(fija.password, 'Inicial-2026');
  assert.ok(auth.verifyPassword('Inicial-2026', fija.user.password_hash));
  assert.ok(!fija.logs.includes('Inicial-2026'), 'no se escribe en los mensajes');

  const corta = crear({ ADMIN_PASSWORD_INICIAL: 'abc' });
  assert.equal(corta.password, 'admin123');
  assert.match(corta.logs, /menos de 6 caracteres/);
});

test('scripts/restablecer-admin.js: contraseña temporal, reactiva, cierra solo sus sesiones y obliga a cambiarla', async () => {
  const { spawnSync } = require('node:child_process');
  const script = path.join(__dirname, '..', 'scripts', 'restablecer-admin.js');
  const correr = (args, env = {}) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', script, ...args], {
    env: { ...process.env, DATA_DIR: tmp, DB_FILE: path.join(tmp, 'test.db'), ...env }, encoding: 'utf8',
  });

  // Otro administrador con sesión abierta; admin queda desactivado pero con su sesión guardada.
  const r = await fetch(base + '/api/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ name: 'Jefa', username: 'jefa', password: 'secreto2', role: 'admin' }),
  });
  assert.equal(r.status, 201);
  const jefaCookie = (await login(base, 'jefa', 'secreto2')).cookie;
  db.run("UPDATE users SET active = 0 WHERE username = 'admin'");
  assert.equal((await login(base, 'admin', 'admin123')).res.status, 401);

  // Funciona con el sistema abierto (WAL) y el usuario no distingue mayúsculas.
  const ok = correr(['ADMIN']);
  assert.equal(ok.status, 0, ok.stderr);
  const temporal = (/^ {6}(\S+)$/m.exec(ok.stdout) || [])[1];
  assert.match(temporal || '', /^[A-Za-z0-9]{12}$/);

  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: adminCookie } })).status, 401, 'su sesión vieja se cerró');
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: jefaCookie } })).status, 200, 'las de otros siguen');
  assert.equal((await login(base, 'admin', 'admin123')).res.status, 401);
  const nueva = await login(base, 'admin', temporal);
  assert.equal(nueva.res.status, 200);
  const data = await nueva.res.json();
  assert.equal(data.user.active, 1);
  assert.equal(data.user.role, 'admin');
  assert.equal(data.user.must_change_password, 1);
  adminCookie = nueva.cookie;

  const cajera = correr(['cajera']);
  assert.equal(cajera.status, 1);
  assert.match(cajera.stderr, /no es administrador/);
  assert.match(cajera.stderr, /admin, jefa/);
  const nadie = correr(['nadie']);
  assert.equal(nadie.status, 1);
  assert.match(nadie.stderr, /No existe el usuario "nadie"/);

  // Sin base de datos no crea una vacía.
  const vacia = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-sin-base-'));
  try {
    const sinBase = correr([], { DATA_DIR: vacia, DB_FILE: '' });
    assert.equal(sinBase.status, 1);
    assert.match(sinBase.stderr, /No se encontró la base de datos/);
    assert.deepEqual(fs.readdirSync(vacia), []);
  } finally {
    fs.rmSync(vacia, { recursive: true, force: true });
  }
});
