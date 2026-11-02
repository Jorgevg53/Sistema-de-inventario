'use strict';
/* Pruebas del cerebro: modo básico y Claude (contra un servidor falso de la API, sin costo). */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-brain-'));
process.env.DATA_DIR = tmp;
process.env.DB_FILE = path.join(tmp, 'test.db');
delete process.env.ANTHROPIC_API_KEY;

const db = require('../server/db');
const D = require('../server/dates');
const projects = require('../server/projects');
const agenda = require('../server/agenda');
const local = require('../server/brain/local');
const claude = require('../server/brain/claude');
const brain = require('../server/brain');

// Servidor falso de la API de Claude: responde en orden lo que haya en `script`.
let script = [];
let calls = [];
let fake;
let fakeUrl;

function message(content, stop = 'end_turn', extra = {}) {
  return { status: 200, json: { id: `msg_${calls.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, content, usage: { input_tokens: 10, output_tokens: 5 }, ...extra } };
}

before(async () => {
  db.open();
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls.push({ headers: req.headers, body: JSON.parse(body || '{}') });
      const next = script.shift() || (() => message([{ type: 'text', text: 'Sin guion.' }]));
      const r = typeof next === 'function' ? next(calls[calls.length - 1].body) : next;
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  fakeUrl = `http://127.0.0.1:${fake.address().port}`;
  claude.setClientFactory((key) => new claude.Anthropic({ apiKey: key, baseURL: fakeUrl, maxRetries: 0 }));
});

after(() => {
  fake.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  script = [];
  calls = [];
  brain.newConversation();
});

const tomorrow = () => D.addDays(D.today(), 1);

// ---------------------------------------------------------------------------
// Modo básico
// ---------------------------------------------------------------------------
test('modo básico: agenda, tareas y proyectos', () => {
  db.setSetting('anthropic_api_key', '');
  let r = local.respond('Jarvis, agenda dentista mañana a las 5');
  assert.equal(r.actions[0].type, 'event_created');
  const ev = agenda.getEvent(r.actions[0].ref.id);
  assert.deepEqual([ev.title, ev.start, ev.reminder_min], ['Dentista', `${tomorrow()}T17:00`, 15]);

  r = local.respond('crea el proyecto Tienda en línea');
  const pid = r.actions[0].ref.id;
  r = local.respond('agrega las tareas comprar dominio, elegir plantilla y subir productos al proyecto tienda');
  assert.equal(r.actions.length, 3);
  assert.equal(projects.getProject(pid).tasks_total, 3);

  r = local.respond('tengo que comprar pan y leche mañana');
  assert.equal(r.actions.length, 1, 'una sola tarea: «y» es parte del título');
  assert.equal(projects.getTask(r.actions[0].ref.id).title, 'Comprar pan y leche');
  assert.equal(projects.getTask(r.actions[0].ref.id).due_date, tomorrow());

  r = local.respond('terminé la tarea elegir plantilla');
  assert.match(r.reply, /33\s%/);
  r = local.respond('¿cómo va el proyecto tienda?');
  assert.match(r.reply, /Tienda en línea va al 33\s%/);

  r = local.respond('recuérdame llamar a Juan en 2 horas');
  assert.equal(agenda.getEvent(r.actions[0].ref.id).reminder_min, 0);

  r = local.respond('agenda cena con Laura');
  assert.match(r.reply, /¿Para cuándo/);
  r = local.respond('mañana a las 9 de la noche');
  assert.equal(agenda.getEvent(r.actions[0].ref.id).start, `${tomorrow()}T21:00`);

  r = local.respond('cancela la cena con Laura');
  assert.equal(r.actions[0].type, 'event_deleted');
  assert.match(local.respond('ayuda').reply, /modo básico/);
  assert.match(local.respond('cuéntame un chiste').reply, /no entendí/);
});

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------
test('Claude: usa herramientas, guarda el historial y envía los parámetros correctos', async () => {
  db.setSetting('anthropic_api_key', 'sk-ant-test-000000000000');
  db.setSetting('model', 'claude-opus-5-5');
  script = [
    message([
      { type: 'thinking', thinking: '', signature: 'firma' },
      { type: 'tool_use', id: 'tu_1', name: 'create_event', input: { title: 'Revisión', start: `${tomorrow()}T10:00` } },
    ], 'tool_use'),
    message([{ type: 'text', text: 'Listo, señor: agendé «Revisión» para mañana a las 10:00 a. m.' }]),
  ];
  const r = await brain.chat('agenda una revisión mañana a las 10');
  assert.equal(r.mode, 'ia');
  assert.match(r.reply, /Revisión/);
  assert.equal(r.actions.length, 1);
  assert.equal(agenda.getEvent(r.actions[0].ref.id).reminder_min, 15, 'sin aviso explícito usa el predeterminado');

  const first = calls[0];
  assert.equal(first.body.model, 'claude-opus-5-5');
  assert.deepEqual(first.body.thinking, { type: 'adaptive' });
  assert.equal(first.body.output_config.effort, 'medium');
  assert.equal(first.body.fallbacks, 'default');
  assert.match(first.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(first.body.max_iterations, undefined, 'max_iterations es del SDK, no se envía a la API');
  assert.ok(first.body.tools.some((t) => t.name === 'create_event'));
  assert.match(first.body.messages[0].content[0].text, /^<contexto>Ahora: /);
  // El resultado de la herramienta vuelve a Claude.
  const toolResult = calls[1].body.messages.at(-1).content[0];
  assert.equal(toolResult.type, 'tool_result');
  assert.equal(toolResult.tool_use_id, 'tu_1');

  // El siguiente turno lleva el historial (solo texto) tal como se envió.
  script = [message([{ type: 'text', text: 'A su servicio.' }])];
  await brain.chat('gracias');
  const msgs = calls[2].body.messages;
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.deepEqual(msgs[0], first.body.messages[0]);
  assert.equal(msgs[1].content[0].text, r.reply);
});

test('Claude: los errores de una herramienta se devuelven como error y Haiku no usa fallbacks', async () => {
  db.setSetting('anthropic_api_key', 'sk-ant-test-000000000000');
  db.setSetting('model', 'claude-haiku-5-5');
  script = [
    message([{ type: 'tool_use', id: 'tu_x', name: 'create_event', input: { title: 'Sin fecha', start: 'el jueves' } }], 'tool_use'),
    message([{ type: 'text', text: '¿Para qué fecha?' }]),
  ];
  const r = await brain.chat('agenda algo');
  assert.equal(r.reply, '¿Para qué fecha?');
  assert.equal(r.actions.length, 0);
  const result = calls[1].body.messages.at(-1).content[0];
  assert.equal(result.is_error, true);
  assert.match(JSON.stringify(result.content), /inicio no es válida/);
  assert.equal(calls[0].body.fallbacks, undefined);
  assert.doesNotMatch(calls[0].headers['anthropic-beta'] || '', /server-side-fallback/);
  db.setSetting('model', 'claude-opus-5-5');
});

test('Claude: una negativa se responde con cortesía', async () => {
  db.setSetting('anthropic_api_key', 'sk-ant-test-000000000000');
  script = [message([], 'refusal', { stop_details: { type: 'refusal', category: null, explanation: null } })];
  const r = await brain.chat('algo que no debería');
  assert.match(r.reply, /^Lo siento/);
});

test('Claude: sin conexión o con clave inválida responde en modo básico', async () => {
  db.setSetting('anthropic_api_key', 'sk-ant-test-000000000000');
  script = [{ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }];
  let r = await brain.chat('¿qué tengo mañana?');
  assert.equal(r.mode, 'basico');
  assert.match(r.notice, /clave de Claude no es válida/);
  assert.match(r.reply, /Mañana/);

  claude.setClientFactory((key) => new claude.Anthropic({ apiKey: key, baseURL: 'http://127.0.0.1:9', maxRetries: 0 }));
  r = await brain.chat('agenda yoga mañana a las 7 de la mañana');
  assert.equal(r.mode, 'basico');
  assert.match(r.notice, /conexión/);
  assert.equal(r.actions[0].type, 'event_created');
  claude.setClientFactory((key) => new claude.Anthropic({ apiKey: key, baseURL: fakeUrl, maxRetries: 0 }));
});

test('Claude: si falla después de actuar no repite la orden', async () => {
  db.setSetting('anthropic_api_key', 'sk-ant-test-000000000000');
  const before = projects.listTasks({ limit: 1000 }).length;
  script = [
    message([{ type: 'tool_use', id: 'tu_t', name: 'create_tasks', input: { tasks: [{ title: 'Llamar al contador' }] } }], 'tool_use'),
    { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'boom' } } },
  ];
  const r = await brain.chat('tengo que llamar al contador');
  assert.match(r.reply, /se interrumpió/);
  assert.equal(r.actions.length, 1);
  assert.equal(projects.listTasks({ limit: 1000 }).length, before + 1, 'la tarea no se duplicó');
});
