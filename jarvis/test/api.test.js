'use strict';
/* Pruebas de la API HTTP: acceso, ajustes, agenda, proyectos, tareas, chat y respaldos. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-api-'));
process.env.DATA_DIR = tmp;
process.env.DB_FILE = path.join(tmp, 'test.db');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.JARVIS_CLAVE;

const db = require('../server/db');
const D = require('../server/dates');
const { createApp } = require('../server/index');

let server;
let base;
let port;

function client(extraHeaders = {}) {
  let cookie = '';
  async function call(method, url, body, headers = {}) {
    const res = await fetch(base + '/api' + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
  }
  return {
    get: (u, h) => call('GET', u, undefined, h),
    post: (u, b = {}, h) => call('POST', u, b, h),
    put: (u, b = {}) => call('PUT', u, b),
    del: (u) => call('DELETE', u),
  };
}

const api = client();

before(async () => {
  db.open();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('sin contraseña solo se permite el acceso local', async () => {
  const st = await api.get('/status');
  assert.equal(st.status, 200);
  assert.equal(st.data.auth.authenticated, true);
  assert.equal(st.data.ai.enabled, false);
  // Un nombre de host ajeno (p. ej. un ataque de DNS rebinding) no cuenta como local.
  // (fetch no permite cambiar el encabezado Host, por eso se usa node:http.)
  const status = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/api/projects', headers: { Host: `evil.example:${port}` } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(status, 403);
  // Peticiones desde otra página web.
  assert.equal((await api.post('/projects', { name: 'X' }, { Origin: 'http://evil.example' })).status, 403);
  // Detrás de un proxy local (Tailscale, Caddy…) que cambia el Host, vale el X-Forwarded-Host que envía.
  // Lo que llega por un proxy nunca cuenta como "este equipo": sin contraseña pide definirla.
  const viaProxy = (forwardedHost) => new Promise((resolve, reject) => {
    const headers = { Host: `127.0.0.1:${port}`, Origin: 'https://mi-pc.red.ts.net' };
    if (forwardedHost) headers['X-Forwarded-Host'] = forwardedHost;
    http.get({ host: '127.0.0.1', port, path: '/api/projects', headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, error: JSON.parse(body).error }));
    }).on('error', reject);
  });
  let r = await viaProxy('mi-pc.red.ts.net');
  assert.equal(r.status, 403);
  assert.match(r.error, /define una contraseña/);
  r = await viaProxy(null);
  assert.match(r.error, /otro sitio/);
  // Formularios que no son JSON.
  const res = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hola' });
  assert.equal(res.status, 415);
});

test('ajustes: validación y la clave nunca se devuelve', async () => {
  let r = await api.put('/settings', { user_name: 'Jorge', user_title: 'señor', work_start: '08:00', work_end: '18:00' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user_name, 'Jorge');
  assert.equal((await api.put('/settings', { work_start: '19:00' })).status, 400);
  assert.equal((await api.put('/settings', { api_key: 'abc' })).status, 400);
  assert.equal((await api.put('/settings', { model: 'gpt-4' })).status, 400);
  r = await api.put('/settings', { api_key: 'sk-ant-api03-PRUEBA1234567890' });
  assert.equal(r.data.api_key_set, true);
  assert.equal(r.data.api_key_hint, '…7890');
  assert.equal(JSON.stringify(r.data).includes('PRUEBA'), false);
  assert.equal(r.data.ai_enabled, true);
  r = await api.put('/settings', { api_key: '' });
  assert.equal(r.data.ai_enabled, false);
});

test('agenda: crear, consultar, alta rápida y borrar una ocasión', async () => {
  let r = await api.post('/events', { title: 'Junta', start: '2040-01-02T09:00', repeat: 'weekly', reminder_min: 10 });
  assert.equal(r.status, 201);
  const id = r.data.id;
  r = await api.get('/events?from=2040-01-01&to=2040-01-31');
  assert.equal(r.data.filter((e) => e.id === id).length, 5);
  assert.equal((await api.del(`/events/${id}?date=2040-01-09`)).status, 200);
  r = await api.get('/events?from=2040-01-01&to=2040-01-31');
  assert.equal(r.data.filter((e) => e.id === id).length, 4);

  r = await api.post('/events/quick', { text: 'Dentista a las 9 de la mañana con aviso de 30 minutos antes', date: '2040-02-14' });
  assert.equal(r.status, 201);
  assert.deepEqual([r.data.title, r.data.start, r.data.reminder_min], ['Dentista', '2040-02-14T09:00', 30]);
  assert.equal((await api.post('/events/quick', { text: 'algo' })).status, 400);

  r = await api.get('/free-slots?date=2040-02-14&duration=60&from=08:00&to=12:00');
  assert.deepEqual(r.data.slots.map((s) => s.start), ['2040-02-14T08:00', '2040-02-14T10:00']);
  assert.equal((await api.get('/events/99999')).status, 404);
});

test('proyectos y tareas', async () => {
  let r = await api.post('/projects', { name: 'Mudanza', due_date: '2040-12-15' });
  assert.equal(r.status, 201);
  const pid = r.data.id;
  r = await api.post('/tasks/quick', { text: 'Cotizar mudanzas el 3 de diciembre de 2040', project_id: pid });
  assert.deepEqual([r.data.title, r.data.due_date, r.data.project_id], ['Cotizar mudanzas', '2040-12-03', pid]);
  const t1 = r.data.id;
  r = await api.post('/tasks', { title: 'Empacar libros', project_id: pid });
  const t2 = r.data.id;
  assert.equal((await api.post('/tasks/reorder', { ids: [t2, t1], status: 'en_progreso' })).status, 200);
  r = await api.get(`/projects/${pid}`);
  assert.deepEqual(r.data.tasks.map((t) => [t.id, t.status]), [[t2, 'en_progreso'], [t1, 'en_progreso']]);
  await api.put(`/tasks/${t2}`, { status: 'hecha' });
  r = await api.get('/projects?status=activo');
  const p = r.data.find((x) => x.id === pid);
  assert.equal(p.progress, 50);
  assert.equal((await api.post(`/projects/${pid}/notes`, { text: 'Camión reservado' })).status, 201);
  assert.equal((await api.put(`/tasks/${t1}`, { status: 'volando' })).status, 400);
  r = await api.get('/search?q=camion');
  assert.equal(r.data.notes.length, 1, 'la búsqueda no distingue acentos');
  r = await api.get('/search?q=mudanza');
  assert.equal(r.data.projects.length, 1);
});

test('resumen del día y chat en modo básico', async () => {
  const today = D.today();
  await api.post('/events', { title: 'Llamada importante', start: `${today}T23:58`, duration_min: 1 });
  let r = await api.get('/briefing');
  assert.equal(r.status, 200);
  assert.ok(r.data.events.some((e) => e.title === 'Llamada importante'));
  assert.ok(r.data.text.startsWith('Buen'), r.data.text);
  r = await api.post('/chat', { message: 'agenda dentista mañana a las 5' });
  assert.equal(r.data.mode, 'basico');
  assert.equal(r.data.actions[0].type, 'event_created');
  assert.ok(r.data.reply.includes('Dentista'));
  r = await api.get('/chat');
  assert.equal(r.data.length, 2);
  await api.del('/chat');
  assert.equal((await api.get('/chat')).data.length, 0);
  assert.equal((await api.post('/chat', { message: '   ' })).status, 400);
});

test('respaldo y restauración', async () => {
  const backup = await api.get('/backup');
  assert.equal(backup.data.app, 'JARVIS');
  assert.equal(JSON.stringify(backup.data).includes('password_hash'), false);
  const projects = backup.data.projects.length;
  await api.post('/projects', { name: 'Proyecto temporal' });
  assert.equal((await api.get('/projects')).data.length, projects + 1);
  const r = await api.post('/backup', backup.data);
  assert.equal(r.status, 200);
  assert.equal((await api.get('/projects')).data.length, projects);
  assert.equal((await api.post('/backup', { foo: 1 })).status, 400);
});

test('con contraseña se pide iniciar sesión', async () => {
  let r = await api.put('/settings', { new_password: 'secreta123' });
  assert.equal(r.status, 200);
  assert.equal(r.data.password_set, true);
  // El navegador que la definió queda con sesión.
  assert.equal((await api.get('/projects')).status, 200);
  const other = client();
  assert.equal((await other.get('/projects')).status, 401);
  assert.equal((await other.get('/status')).data.auth.authenticated, false);
  assert.equal((await other.post('/login', { password: 'mala' })).status, 401);
  assert.equal((await other.post('/login', { password: 'secreta123' })).status, 200);
  assert.equal((await other.get('/projects')).status, 200);
  // Cambiarla exige la actual.
  assert.equal((await other.put('/settings', { current_password: 'x', new_password: 'otra123456' })).status, 400);
  await other.post('/logout');
  assert.equal((await other.get('/projects')).status, 401);
  // Quitarla (desde este equipo) vuelve al modo solo local.
  r = await api.put('/settings', { current_password: 'secreta123', new_password: '' });
  assert.equal(r.data.password_set, false);
});
