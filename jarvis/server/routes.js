'use strict';
/* API de JARVIS. */
const express = require('express');
const db = require('./db');
const D = require('./dates');
const agenda = require('./agenda');
const projects = require('./projects');
const summary = require('./summary');
const auth = require('./auth');
const brain = require('./brain');
const claude = require('./brain/claude');
const { bad, str, int, HttpError } = require('./util');

const VERSION = require('../package.json').version;

// ---------------------------------------------------------------------------
// Sin sesión: estado, inicio y cierre de sesión
// ---------------------------------------------------------------------------
const publicRouter = express.Router();

const failures = new Map(); // ip -> { count, until }
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;

publicRouter.get('/status', (req, res) => {
  const st = auth.status(req);
  const out = { app: 'JARVIS', version: VERSION, auth: st, assistant_name: db.getSetting('assistant_name') || 'JARVIS' };
  if (st.authenticated) out.ai = { enabled: claude.enabled(), model: claude.model() };
  res.json(out);
});

publicRouter.post('/login', express.json({ limit: '10kb' }), (req, res) => {
  const ip = req.ip;
  const f = failures.get(ip);
  if (f && f.until > Date.now()) throw new HttpError(429, `Demasiados intentos. Espere ${LOCK_MINUTES} minutos.`);
  if (!auth.passwordRequired()) throw bad('No hay contraseña configurada.');
  if (!auth.checkPassword(String(req.body?.password ?? ''))) {
    const count = (f && !f.until ? f.count : 0) + 1; // tras un bloqueo vencido se empieza de cero
    failures.set(ip, { count, until: count >= MAX_FAILURES ? Date.now() + LOCK_MINUTES * 60000 : 0 });
    throw new HttpError(401, 'Contraseña incorrecta.');
  }
  failures.delete(ip);
  auth.createSession(res, req.secure);
  res.json({ ok: true });
});

publicRouter.post('/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Con sesión
// ---------------------------------------------------------------------------
const router = express.Router();

// Ajustes
const SETTING_KEYS = ['user_name', 'user_title', 'assistant_name', 'voice_enabled', 'voice_name', 'voice_rate', 'speech_lang', 'work_start', 'work_end', 'default_duration', 'default_reminder'];

function publicSettings() {
  const s = db.allSettings();
  const key = (s.anthropic_api_key || '').trim();
  const out = {};
  for (const k of [...SETTING_KEYS, 'model']) out[k] = s[k];
  out.api_key_set = !!key;
  out.api_key_hint = key ? `…${key.slice(-4)}` : '';
  out.api_key_from_env = !key && !!process.env.ANTHROPIC_API_KEY;
  out.ai_enabled = claude.enabled();
  out.password_set = auth.passwordRequired();
  out.password_from_env = !!process.env.JARVIS_CLAVE;
  out.models = Object.entries(claude.MODELS).map(([id, label]) => ({ id, label }));
  return out;
}

router.get('/settings', (req, res) => res.json(publicSettings()));

router.put('/settings', (req, res) => {
  const b = req.body || {};
  const set = {};
  for (const k of ['user_name', 'user_title', 'assistant_name', 'voice_name', 'speech_lang']) if (k in b) set[k] = str(b[k], 60) || '';
  if ('assistant_name' in set && !set.assistant_name) set.assistant_name = 'JARVIS';
  if ('voice_enabled' in b) set.voice_enabled = b.voice_enabled ? '1' : '0';
  if ('voice_rate' in b) {
    const r = Number(b.voice_rate);
    if (!(r >= 0.5 && r <= 2)) throw bad('La velocidad de la voz debe estar entre 0.5 y 2.');
    set.voice_rate = String(r);
  }
  for (const k of ['work_start', 'work_end']) {
    if (k in b) {
      const t = D.normTime(String(b[k] ?? ''));
      if (!t) throw bad('El horario laboral debe tener el formato HH:MM.');
      set[k] = t;
    }
  }
  if ((set.work_start || db.getSetting('work_start')) >= (set.work_end || db.getSetting('work_end'))) throw bad('El horario laboral debe terminar después de empezar.');
  if ('default_duration' in b) {
    const n = int(b.default_duration);
    if (!(n >= 5 && n <= 1440)) throw bad('La duración predeterminada debe ser de 5 a 1440 minutos.');
    set.default_duration = String(n);
  }
  if ('default_reminder' in b) {
    if (b.default_reminder === '' || b.default_reminder === null) set.default_reminder = '';
    else {
      const n = int(b.default_reminder);
      if (!(n >= 0 && n <= 10080)) throw bad('El aviso predeterminado debe ser de 0 a 10080 minutos.');
      set.default_reminder = String(n);
    }
  }
  if ('model' in b) {
    if (!claude.MODELS[b.model]) throw bad('Modelo no válido.');
    set.model = b.model;
  }
  if ('api_key' in b) {
    const key = String(b.api_key ?? '').trim();
    if (key && !/^sk-ant-[\w-]{10,}$/.test(key)) throw bad('La clave no parece válida: debe empezar con «sk-ant-».');
    set.anthropic_api_key = key;
  }
  if ('new_password' in b) {
    if (process.env.JARVIS_CLAVE) throw bad('La contraseña está definida con la variable JARVIS_CLAVE; cámbiela ahí.');
    const current = db.getSetting('password_hash');
    if (current && !auth.verifyPassword(String(b.current_password ?? ''), current)) throw bad('La contraseña actual no es correcta.');
    const pwd = String(b.new_password ?? '');
    if (pwd && pwd.length < 6) throw bad('La contraseña debe tener al menos 6 caracteres.');
    if (!pwd && !auth.isLocalRequest(req)) throw bad('Solo se puede quitar la contraseña desde el mismo equipo donde corre JARVIS.');
    set.password_hash = pwd ? auth.hashPassword(pwd) : '';
  }
  db.transaction(() => {
    for (const [k, v] of Object.entries(set)) db.setSetting(k, v);
    if (set.password_hash) db.run('DELETE FROM sessions');
  });
  // Al poner contraseña se inicia sesión en este navegador para no quedar fuera.
  if (set.password_hash) auth.createSession(res, req.secure);
  res.json(publicSettings());
});

router.post('/settings/test-ai', async (req, res) => {
  if (!claude.enabled()) throw bad('Primero guarde su clave de Claude.');
  try {
    const client = new claude.Anthropic({ apiKey: (db.getSetting('anthropic_api_key') || '').trim() || process.env.ANTHROPIC_API_KEY });
    const m = await client.models.retrieve(claude.model());
    res.json({ ok: true, model: m.id, name: m.display_name });
  } catch (e) {
    const msg = brain.describe(e);
    if (!msg) throw e;
    throw bad(msg.replace(/;? ?(?:mientras tanto )?respondo en modo básico(?: por ahora)?\.?/, '.'));
  }
});

// Resumen y búsqueda
router.get('/briefing', (req, res) => {
  const b = summary.briefing(req.query.date);
  res.json({ ...b, text: summary.briefingText(b, { greet: req.query.greet !== '0' }) });
});

router.get('/search', (req, res) => res.json(summary.search(String(req.query.q || ''), 20)));

// Agenda
router.get('/events', (req, res) => res.json(agenda.listEvents(req.query.from, req.query.to)));
router.post('/events', (req, res) => res.status(201).json(agenda.createEvent(req.body || {})));
// Alta rápida en lenguaje natural: "Dentista mañana a las 5", "Junta cada lunes a las 9".
router.post('/events/quick', (req, res) => {
  const day = D.normDate(String(req.body?.date ?? ''));
  const p = D.parseSpanish(str(req.body?.text, 300) || '', new Date(), { defaultDate: day });
  const title = D.cleanText(p.rest);
  if (!title || !p.date) throw bad('Escriba qué y cuándo, por ejemplo: «Dentista mañana a las 5».');
  res.status(201).json(agenda.createEvent(agenda.fromParsed(title, p)));
});
router.get('/events/:id', (req, res) => res.json(agenda.getEvent(req.params.id)));
router.put('/events/:id', (req, res) => res.json(agenda.updateEvent(req.params.id, req.body || {})));
router.delete('/events/:id', (req, res) => {
  const r = agenda.deleteEvent(req.params.id, req.query.date || null);
  res.json({ ok: true, deleted: r.deleted });
});
router.get('/free-slots', (req, res) => res.json(agenda.freeSlots(req.query.date, req.query.duration, req.query.from, req.query.to)));
router.get('/reminders', (req, res) => res.json(agenda.reminders(req.query.from, req.query.to)));

// Proyectos
router.get('/projects', (req, res) => res.json(projects.listProjects({ status: req.query.status || null, q: req.query.q || null })));
router.post('/projects', (req, res) => res.status(201).json(projects.createProject(req.body || {})));
router.get('/projects/:id', (req, res) => res.json(projects.getProject(req.params.id)));
router.put('/projects/:id', (req, res) => res.json(projects.updateProject(req.params.id, req.body || {})));
router.delete('/projects/:id', (req, res) => {
  projects.deleteProject(req.params.id);
  res.json({ ok: true });
});
router.post('/projects/:id/notes', (req, res) => res.status(201).json(projects.addNote(req.params.id, req.body?.text)));
router.delete('/notes/:id', (req, res) => {
  projects.deleteNote(req.params.id);
  res.json({ ok: true });
});

// Tareas
router.get('/tasks', (req, res) => {
  const q = req.query;
  res.json(projects.listTasks({ project_id: q.project_id ?? null, status: q.status || null, when: q.when || null, q: q.q || null, limit: q.limit }));
});
router.post('/tasks', (req, res) => res.status(201).json(projects.createTask(req.body || {})));
// Alta rápida: "Pagar la luz el viernes" → tarea con fecha límite.
router.post('/tasks/quick', (req, res) => {
  const text = str(req.body?.text, 300) || '';
  const p = D.parseSpanish(text);
  const title = D.cleanText(p.rest) || D.cleanText(text);
  if (!title) throw bad('Escriba la tarea.');
  res.status(201).json(projects.createTask({
    title: title.charAt(0).toUpperCase() + title.slice(1),
    project_id: req.body?.project_id ?? null,
    status: req.body?.status || null,
    due_date: p.found ? p.date : null,
    due_time: p.found ? p.time : null,
  }));
});
router.post('/tasks/reorder', (req, res) => {
  projects.reorderTasks(req.body?.ids, req.body?.status);
  res.json({ ok: true });
});
router.put('/tasks/:id', (req, res) => res.json(projects.updateTask(req.params.id, req.body || {})));
router.delete('/tasks/:id', (req, res) => {
  projects.deleteTask(req.params.id);
  res.json({ ok: true });
});

// Conversación
router.get('/chat', (req, res) => res.json(brain.historyForUI()));
router.post('/chat', async (req, res) => res.json(await brain.chat(req.body?.message)));
router.delete('/chat', (req, res) => {
  brain.newConversation();
  res.json({ ok: true });
});

// Respaldo (JSON con proyectos, tareas, notas, eventos y preferencias; sin claves ni contraseñas)
const BACKUP_TABLES = {
  projects: ['id', 'name', 'description', 'color', 'status', 'priority', 'start_date', 'due_date', 'created_at', 'updated_at'],
  tasks: ['id', 'title', 'notes', 'project_id', 'status', 'priority', 'due_date', 'due_time', 'sort_order', 'completed_at', 'created_at', 'updated_at'],
  project_notes: ['id', 'project_id', 'text', 'created_at'],
  events: ['id', 'title', 'start', 'end', 'all_day', 'location', 'notes', 'category', 'reminder_min', 'repeat', 'repeat_until', 'exceptions', 'project_id', 'created_at', 'updated_at'],
};
const BACKUP_SETTINGS = ['user_name', 'user_title', 'assistant_name', 'model', 'voice_enabled', 'voice_name', 'voice_rate', 'speech_lang', 'work_start', 'work_end', 'default_duration', 'default_reminder'];

router.get('/backup', (req, res) => {
  const data = { app: 'JARVIS', version: VERSION, exported_at: D.nowWall(), settings: {} };
  for (const [t, cols] of Object.entries(BACKUP_TABLES)) data[t] = db.all(`SELECT ${cols.join(', ')} FROM ${t} ORDER BY id`);
  for (const k of BACKUP_SETTINGS) data.settings[k] = db.getSetting(k);
  res.setHeader('Content-Disposition', `attachment; filename="jarvis-respaldo-${D.today()}.json"`);
  res.json(data);
});

router.post('/backup', (req, res) => {
  const data = req.body || {};
  if (data.app !== 'JARVIS' || !Array.isArray(data.projects) || !Array.isArray(data.events)) throw bad('El archivo no es un respaldo de JARVIS.');
  db.transaction(() => {
    for (const t of ['project_notes', 'tasks', 'events', 'projects']) db.run(`DELETE FROM ${t}`);
    for (const t of ['projects', 'tasks', 'project_notes', 'events']) {
      for (const row of Array.isArray(data[t]) ? data[t] : []) {
        // Solo las columnas con valor: las demás toman su valor predeterminado.
        const cols = BACKUP_TABLES[t].filter((c) => row[c] !== undefined && row[c] !== null);
        if (!cols.length) continue;
        db.run(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((c) => row[c]));
      }
    }
    for (const k of BACKUP_SETTINGS) if (data.settings && typeof data.settings[k] === 'string') db.setSetting(k, data.settings[k]);
  });
  res.json({ ok: true, projects: data.projects.length, events: data.events.length, tasks: (data.tasks || []).length });
});

module.exports = { publicRouter, router };
