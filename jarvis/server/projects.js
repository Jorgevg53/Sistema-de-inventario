'use strict';
/* Proyectos, tareas y bitácora de notas. */
const db = require('./db');
const D = require('./dates');
const { bad, notFound, str, int, fold, bestMatch } = require('./util');

const PROJECT_STATUSES = ['activo', 'en_pausa', 'completado', 'cancelado'];
const TASK_STATUSES = ['pendiente', 'en_progreso', 'hecha'];
const PRIORITIES = ['alta', 'media', 'baja'];
const COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#fb923c', '#4ade80'];

const ALIASES = {
  project: { pausa: 'en_pausa', pausado: 'en_pausa', 'en pausa': 'en_pausa', terminado: 'completado', completo: 'completado', activa: 'activo', cancelada: 'cancelado' },
  task: {
    'en progreso': 'en_progreso', 'en curso': 'en_progreso', haciendo: 'en_progreso', progreso: 'en_progreso', iniciada: 'en_progreso',
    hecho: 'hecha', completada: 'hecha', completa: 'hecha', terminada: 'hecha', lista: 'hecha', done: 'hecha', pendientes: 'pendiente', 'por hacer': 'pendiente',
  },
  priority: { urgente: 'alta', importante: 'alta', normal: 'media', baja: 'baja' },
};

function pick(v, allowed, aliases, def, label) {
  if (v === null || v === undefined || v === '') return def;
  const s = fold(v).trim().replace(/_/g, ' ');
  const val = aliases[s] || s.replace(/ /g, '_');
  if (!allowed.includes(val)) throw bad(`${label} no válido: "${v}". Opciones: ${allowed.join(', ')}.`);
  return val;
}

function optDate(v, label) {
  if (v === null || v === undefined || v === '') return null;
  const d = D.normDate(String(v));
  if (!d) throw bad(`${label} no es una fecha válida (usa AAAA-MM-DD).`);
  return d;
}

function optProject(v) {
  if (v === null || v === undefined || v === '') return null;
  const id = int(v);
  if (!id || !db.get('SELECT id FROM projects WHERE id = ?', id)) throw bad('Ese proyecto no existe.');
  return id;
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------
function validateProject(input, existing = null) {
  const src = { ...(existing || {}), ...input };
  const name = str(src.name, 120);
  if (!name) throw bad('El proyecto necesita un nombre.');
  const startDate = optDate(src.start_date, 'La fecha de inicio');
  const dueDate = optDate(src.due_date, 'La fecha límite');
  if (startDate && dueDate && dueDate < startDate) throw bad('La fecha límite no puede ser antes del inicio.');
  let color = str(src.color, 9);
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) {
    const n = db.get('SELECT COUNT(*) AS n FROM projects').n;
    color = existing?.color || COLORS[n % COLORS.length];
  }
  return {
    name,
    description: str(src.description, 4000),
    color,
    status: pick(src.status, PROJECT_STATUSES, ALIASES.project, 'activo', 'Estado'),
    priority: pick(src.priority, PRIORITIES, ALIASES.priority, 'media', 'Prioridad'),
    start_date: startDate,
    due_date: dueDate,
  };
}

function stats() {
  const today = D.today();
  const map = new Map();
  const rows = db.all(
    `SELECT project_id, COUNT(*) AS total, SUM(status = 'hecha') AS done, SUM(status = 'en_progreso') AS doing,
            SUM(status <> 'hecha' AND due_date < ?) AS overdue, MIN(CASE WHEN status <> 'hecha' THEN due_date END) AS next_due
       FROM tasks WHERE project_id IS NOT NULL GROUP BY project_id`,
    today,
  );
  for (const r of rows) map.set(r.project_id, r);
  return map;
}

function withStats(p, s) {
  const st = s || { total: 0, done: 0, doing: 0, overdue: 0, next_due: null };
  const progress = st.total ? Math.round((st.done / st.total) * 100) : p.status === 'completado' ? 100 : 0;
  return {
    ...p,
    tasks_total: st.total,
    tasks_done: st.done,
    tasks_doing: st.doing,
    tasks_overdue: st.overdue,
    next_task_due: st.next_due,
    progress,
    days_left: p.due_date ? D.daysBetween(D.today(), p.due_date) : null,
  };
}

const PROJECT_ORDER = `CASE status WHEN 'activo' THEN 0 WHEN 'en_pausa' THEN 1 WHEN 'completado' THEN 2 ELSE 3 END,
  CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, due_date IS NULL, due_date, name`;

function listProjects({ status = null, q = null } = {}) {
  const where = [];
  const params = [];
  if (status === 'abiertos') where.push("status IN ('activo','en_pausa')");
  else if (status) {
    where.push('status = ?');
    params.push(pick(status, PROJECT_STATUSES, ALIASES.project, null, 'Estado'));
  }
  const rows = db.all(`SELECT * FROM projects ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${PROJECT_ORDER}`, ...params);
  const s = stats();
  let list = rows.map((p) => withStats(p, s.get(p.id)));
  if (q) list = list.filter((p) => fold(p.name + ' ' + (p.description || '')).includes(fold(q).trim()));
  return list;
}

function getProject(id) {
  const p = db.get('SELECT * FROM projects WHERE id = ?', int(id));
  if (!p) throw notFound('No encontré ese proyecto.');
  const project = withStats(p, stats().get(p.id));
  project.tasks = db.all(`SELECT * FROM tasks WHERE project_id = ? ORDER BY ${TASK_ORDER}`, p.id);
  project.notes = db.all('SELECT * FROM project_notes WHERE project_id = ? ORDER BY created_at DESC, id DESC', p.id);
  const today = D.today();
  project.events = db.all(
    "SELECT id, title, start, end, all_day, repeat FROM events WHERE project_id = ? AND (end >= ? OR repeat <> 'none') ORDER BY start LIMIT 20",
    p.id, `${today}T00:00`,
  );
  return project;
}

function createProject(input) {
  const f = validateProject(input);
  const r = db.run(
    'INSERT INTO projects (name, description, color, status, priority, start_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    f.name, f.description, f.color, f.status, f.priority, f.start_date || D.today(), f.due_date,
  );
  return getProject(r.lastInsertRowid);
}

function updateProject(id, input) {
  const existing = db.get('SELECT * FROM projects WHERE id = ?', int(id));
  if (!existing) throw notFound('No encontré ese proyecto.');
  const f = validateProject(input, existing);
  db.run(
    `UPDATE projects SET name = ?, description = ?, color = ?, status = ?, priority = ?, start_date = ?, due_date = ?,
       updated_at = datetime('now','localtime') WHERE id = ?`,
    f.name, f.description, f.color, f.status, f.priority, f.start_date, f.due_date, existing.id,
  );
  return getProject(existing.id);
}

function deleteProject(id) {
  const p = db.get('SELECT * FROM projects WHERE id = ?', int(id));
  if (!p) throw notFound('No encontré ese proyecto.');
  db.run('DELETE FROM projects WHERE id = ?', p.id);
  return p;
}

function addNote(projectId, text) {
  const id = optProject(projectId);
  if (!id) throw bad('Indica el proyecto de la nota.');
  const t = str(text, 4000);
  if (!t) throw bad('La nota está vacía.');
  const r = db.run('INSERT INTO project_notes (project_id, text) VALUES (?, ?)', id, t);
  db.run("UPDATE projects SET updated_at = datetime('now','localtime') WHERE id = ?", id);
  return db.get('SELECT * FROM project_notes WHERE id = ?', r.lastInsertRowid);
}

function deleteNote(id) {
  const r = db.run('DELETE FROM project_notes WHERE id = ?', int(id));
  if (!r.changes) throw notFound('No encontré esa nota.');
}

/** Busca un proyecto por id o por nombre aproximado ("la tienda" → "Tienda en línea"). */
function findProject(ref) {
  if (ref === null || ref === undefined || ref === '') return null;
  if (/^\d+$/.test(String(ref).trim())) return db.get('SELECT * FROM projects WHERE id = ?', int(ref)) || null;
  const list = db.all("SELECT * FROM projects ORDER BY status = 'cancelado', status = 'completado', updated_at DESC");
  return bestMatch(String(ref), list, (p) => p.name, 0.5);
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------
const TASK_ORDER = `CASE status WHEN 'en_progreso' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END, sort_order,
  CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, due_date IS NULL, due_date, due_time, id`;

function validateTask(input, existing = null) {
  const src = { ...(existing || {}), ...input };
  const title = str(src.title, 300);
  if (!title) throw bad('La tarea necesita un título.');
  let dueDate = optDate(src.due_date, 'La fecha límite');
  let dueTime = null;
  if (src.due_time) {
    dueTime = D.normTime(String(src.due_time));
    if (!dueTime) throw bad('La hora límite no es válida (usa HH:MM).');
    if (!dueDate) dueDate = D.today();
  }
  return {
    title,
    notes: str(src.notes, 4000),
    project_id: optProject(src.project_id),
    status: pick(src.status, TASK_STATUSES, ALIASES.task, 'pendiente', 'Estado'),
    priority: pick(src.priority, PRIORITIES, ALIASES.priority, 'media', 'Prioridad'),
    due_date: dueDate,
    due_time: dueTime,
  };
}

const TASK_SELECT = 'SELECT t.*, p.name AS project_name, p.color AS project_color FROM tasks t LEFT JOIN projects p ON p.id = t.project_id';

function getTask(id) {
  const t = db.get(`${TASK_SELECT} WHERE t.id = ?`, int(id));
  if (!t) throw notFound('No encontré esa tarea.');
  return t;
}

/**
 * Lista tareas. status: pendiente | en_progreso | hecha | abiertas (todo lo no hecho).
 * when: today | overdue | week | upcoming | nodate | AAAA-MM-DD (vencen ese día).
 */
function listTasks({ project_id = null, status = null, when = null, q = null, limit = 200 } = {}) {
  const where = [];
  const params = [];
  const today = D.today();
  if (project_id !== null && project_id !== undefined && project_id !== '') {
    if (project_id === 'none') where.push('t.project_id IS NULL');
    else {
      where.push('t.project_id = ?');
      params.push(int(project_id));
    }
  }
  if (status === 'abiertas' || (!status && when && when !== 'done')) where.push("t.status <> 'hecha'");
  else if (status) {
    where.push('t.status = ?');
    params.push(pick(status, TASK_STATUSES, ALIASES.task, null, 'Estado'));
  }
  if (when === 'today') {
    where.push('t.due_date = ?');
    params.push(today);
  } else if (when === 'overdue') {
    where.push("(t.due_date < ? OR (t.due_date = ? AND t.due_time IS NOT NULL AND t.due_time < ?))");
    params.push(today, today, D.nowWall().slice(11));
  } else if (when === 'week') {
    where.push('t.due_date BETWEEN ? AND ?');
    params.push(today, D.addDays(today, 7));
  } else if (when === 'upcoming') {
    where.push('t.due_date >= ?');
    params.push(today);
  } else if (when === 'nodate') where.push('t.due_date IS NULL');
  else if (D.isDate(when)) {
    where.push('t.due_date = ?');
    params.push(when);
  }
  let rows = db.all(
    `${TASK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${TASK_ORDER.replace(/\b(status|sort_order|priority|due_date|due_time|id)\b/g, 't.$1')} LIMIT ?`,
    ...params, Math.min(Math.max(int(limit, 200), 1), 1000),
  );
  if (q) {
    const needle = fold(q).trim();
    rows = rows.filter((t) => fold(`${t.title} ${t.notes || ''} ${t.project_name || ''}`).includes(needle));
  }
  return rows;
}

function createTask(input) {
  const f = validateTask(input);
  const next = db.get(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM tasks WHERE status = ? AND project_id IS ?', f.status, f.project_id,
  ).n;
  const r = db.run(
    `INSERT INTO tasks (title, notes, project_id, status, priority, due_date, due_time, sort_order, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'hecha' THEN datetime('now','localtime') END)`,
    f.title, f.notes, f.project_id, f.status, f.priority, f.due_date, f.due_time, next, f.status,
  );
  touchProject(f.project_id);
  return getTask(r.lastInsertRowid);
}

function updateTask(id, input) {
  const existing = getTask(id);
  const f = validateTask(input, existing);
  const sort = input.sort_order !== undefined ? int(input.sort_order, existing.sort_order) : existing.sort_order;
  db.run(
    `UPDATE tasks SET title = ?, notes = ?, project_id = ?, status = ?, priority = ?, due_date = ?, due_time = ?, sort_order = ?,
       completed_at = CASE WHEN ? = 'hecha' THEN COALESCE(completed_at, datetime('now','localtime')) END,
       updated_at = datetime('now','localtime') WHERE id = ?`,
    f.title, f.notes, f.project_id, f.status, f.priority, f.due_date, f.due_time, sort, f.status, existing.id,
  );
  touchProject(f.project_id);
  return getTask(existing.id);
}

function deleteTask(id) {
  const t = getTask(id);
  db.run('DELETE FROM tasks WHERE id = ?', t.id);
  touchProject(t.project_id);
  return t;
}

/** Tablero: guarda el nuevo orden (y estado) de una columna. */
function reorderTasks(ids, status) {
  const st = pick(status, TASK_STATUSES, ALIASES.task, null, 'Estado');
  if (!st) throw bad('Indica la columna (estado).');
  if (!Array.isArray(ids) || ids.length > 1000) throw bad('Lista de tareas no válida.');
  db.transaction(() => {
    ids.forEach((id, i) => {
      db.run(
        `UPDATE tasks SET status = ?, sort_order = ?,
           completed_at = CASE WHEN ? = 'hecha' THEN COALESCE(completed_at, datetime('now','localtime')) END,
           updated_at = datetime('now','localtime') WHERE id = ?`,
        st, i + 1, st, int(id),
      );
    });
  });
}

function touchProject(projectId) {
  if (projectId) db.run("UPDATE projects SET updated_at = datetime('now','localtime') WHERE id = ?", projectId);
}

/** Busca una tarea por id o por título aproximado (primero entre las no terminadas). */
function findTask(ref, { openOnly = true, projectId = null } = {}) {
  if (ref === null || ref === undefined || ref === '') return null;
  if (/^\d+$/.test(String(ref).trim())) return db.get(`${TASK_SELECT} WHERE t.id = ?`, int(ref)) || null;
  const where = [];
  const params = [];
  if (openOnly) where.push("t.status <> 'hecha'");
  if (projectId) {
    where.push('t.project_id = ?');
    params.push(projectId);
  }
  const list = db.all(`${TASK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.updated_at DESC LIMIT 500`, ...params);
  return bestMatch(String(ref), list, (t) => t.title, 0.5);
}

/** Versión compacta de una tarea (para el asistente). */
function briefTask(t) {
  const o = { id: t.id, title: t.title, status: t.status, priority: t.priority };
  if (t.due_date) o.due = t.due_time ? `${t.due_date}T${t.due_time}` : t.due_date;
  if (t.project_name) o.project = t.project_name;
  if (t.project_id) o.project_id = t.project_id;
  if (t.notes) o.notes = t.notes.slice(0, 300);
  return o;
}

function briefProject(p) {
  const o = { id: p.id, name: p.name, status: p.status, priority: p.priority, progress: p.progress, tasks: `${p.tasks_done}/${p.tasks_total}` };
  if (p.due_date) {
    o.due_date = p.due_date;
    o.days_left = p.days_left;
  }
  if (p.tasks_overdue) o.overdue_tasks = p.tasks_overdue;
  if (p.description) o.description = p.description.slice(0, 300);
  return o;
}

module.exports = {
  PROJECT_STATUSES, TASK_STATUSES, PRIORITIES,
  listProjects, getProject, createProject, updateProject, deleteProject, addNote, deleteNote, findProject,
  listTasks, getTask, createTask, updateTask, deleteTask, reorderTasks, findTask, briefTask, briefProject,
};
