'use strict';
/* Agenda: eventos (con repeticiones y excepciones), horarios libres y recordatorios. */
const db = require('./db');
const D = require('./dates');
const { bad, notFound, str, int, bool, fold } = require('./util');

const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
const REPEAT_ALIASES = {
  no: 'none', ninguno: 'none', nunca: 'none', diario: 'daily', diaria: 'daily', 'entre semana': 'weekdays',
  laborables: 'weekdays', semanal: 'weekly', mensual: 'monthly', anual: 'yearly',
};
const REPEAT_NAMES = {
  none: '', daily: 'todos los días', weekdays: 'de lunes a viernes', weekly: 'cada semana', monthly: 'cada mes', yearly: 'cada año',
};
const MAX_SPAN_DAYS = 62;

function parseRow(row) {
  if (!row) return null;
  let exceptions = [];
  try { exceptions = JSON.parse(row.exceptions || '[]'); } catch { /* lista vacía */ }
  return { ...row, all_day: !!row.all_day, exceptions };
}

const SELECT = `SELECT e.*, p.name AS project_name, p.color AS project_color
  FROM events e LEFT JOIN projects p ON p.id = e.project_id`;

function getEvent(id) {
  const ev = parseRow(db.get(`${SELECT} WHERE e.id = ?`, int(id)));
  if (!ev) throw notFound('No encontré ese evento.');
  return ev;
}

function normRepeat(v) {
  if (v === null || v === undefined || v === '') return 'none';
  const s = fold(v).trim();
  const r = REPEAT_ALIASES[s] || s;
  if (!REPEATS.includes(r)) throw bad(`Repetición no válida: "${v}". Opciones: ${REPEATS.join(', ')}.`);
  return r;
}

/** Valida y normaliza los datos de un evento. `existing` permite actualizaciones parciales. */
function validate(input, existing = null) {
  const src = { ...(existing || {}), ...input };
  const title = str(src.title, 200);
  if (!title) throw bad('El evento necesita un título.');
  const allDay = bool(src.all_day);
  let start = D.normWall(String(src.start ?? ''), '09:00');
  if (!start) throw bad('La fecha de inicio no es válida (usa AAAA-MM-DD o AAAA-MM-DDTHH:MM).');

  let end = null;
  if (src.end) {
    end = D.normWall(String(src.end), '23:59');
    if (!end) throw bad('La fecha de fin no es válida.');
  }
  const duration = int(src.duration_min);
  if (allDay) {
    start = `${start.slice(0, 10)}T00:00`;
    end = `${(end && end >= start ? end : start).slice(0, 10)}T23:59`;
  } else if (!end || duration) {
    const mins = duration && duration > 0 ? duration : int(db.getSetting('default_duration'), 60);
    end = D.addMinutes(start, mins);
  }
  if (end < start) throw bad('La hora de fin no puede ser antes del inicio.');
  if (D.diffMinutes(start, end) > MAX_SPAN_DAYS * 1440) throw bad(`Un evento no puede durar más de ${MAX_SPAN_DAYS} días.`);

  const repeat = normRepeat(src.repeat);
  let repeatUntil = null;
  if (repeat !== 'none' && src.repeat_until) {
    repeatUntil = D.normDate(String(src.repeat_until));
    if (!repeatUntil) throw bad('La fecha final de la repetición no es válida.');
    if (repeatUntil < start.slice(0, 10)) throw bad('La repetición no puede terminar antes de empezar.');
  }

  let reminder = null;
  if (src.reminder_min !== null && src.reminder_min !== undefined && src.reminder_min !== '') {
    reminder = int(src.reminder_min);
    if (reminder === null || reminder < 0 || reminder > 40320) throw bad('El aviso debe ser de 0 a 40320 minutos antes.');
  }

  let projectId = null;
  if (src.project_id !== null && src.project_id !== undefined && src.project_id !== '') {
    projectId = int(src.project_id);
    if (!db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw bad('Ese proyecto no existe.');
  }

  const exceptions = (Array.isArray(src.exceptions) ? src.exceptions : []).filter((d) => D.isDate(d)).slice(0, 500);
  return {
    title,
    start,
    end,
    all_day: allDay,
    location: str(src.location, 200),
    notes: str(src.notes, 4000),
    category: (str(src.category, 30) || 'general').toLowerCase(),
    reminder_min: reminder,
    repeat,
    repeat_until: repeatUntil,
    exceptions: JSON.stringify(repeat === 'none' ? [] : exceptions),
    project_id: projectId,
  };
}

function createEvent(input) {
  const f = validate(input);
  const r = db.run(
    `INSERT INTO events (title, start, end, all_day, location, notes, category, reminder_min, repeat, repeat_until, exceptions, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    f.title, f.start, f.end, f.all_day, f.location, f.notes, f.category, f.reminder_min, f.repeat, f.repeat_until, f.exceptions, f.project_id,
  );
  return getEvent(r.lastInsertRowid);
}

function updateEvent(id, input) {
  const existing = getEvent(id);
  const patch = { ...input };
  // Si solo cambia el inicio, se conserva la duración.
  if ('start' in patch && !('end' in patch) && !('duration_min' in patch) && !patch.all_day) {
    patch.duration_min = D.diffMinutes(existing.start, existing.end) || null;
    patch.end = null;
  }
  const f = validate(patch, existing);
  db.run(
    `UPDATE events SET title = ?, start = ?, end = ?, all_day = ?, location = ?, notes = ?, category = ?, reminder_min = ?,
       repeat = ?, repeat_until = ?, exceptions = ?, project_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    f.title, f.start, f.end, f.all_day, f.location, f.notes, f.category, f.reminder_min, f.repeat, f.repeat_until, f.exceptions, f.project_id, existing.id,
  );
  return getEvent(existing.id);
}

/** Borra el evento o, si se indica una fecha de un evento repetido, solo esa ocasión. */
function deleteEvent(id, onlyDate = null) {
  const ev = getEvent(id);
  if (onlyDate && ev.repeat !== 'none') {
    const d = D.normDate(String(onlyDate));
    if (!d) throw bad('La fecha de la ocasión no es válida.');
    const exceptions = [...new Set([...ev.exceptions, d])].sort();
    db.run("UPDATE events SET exceptions = ?, updated_at = datetime('now','localtime') WHERE id = ?", JSON.stringify(exceptions), ev.id);
    return { deleted: 'occurrence', event: ev, date: d };
  }
  db.run('DELETE FROM events WHERE id = ?', ev.id);
  return { deleted: 'event', event: ev };
}

/** Las ocasiones de un evento que caen (total o parcialmente) entre dos fechas. */
function expand(ev, from, to) {
  const out = [];
  const dur = D.diffMinutes(ev.start, ev.end);
  const fromW = `${from}T00:00`;
  const toW = `${to}T23:59`;
  const time = ev.start.slice(11);
  const push = (date) => {
    const s = `${date}T${time}`;
    const e = D.addMinutes(s, dur);
    if (e >= fromW && s <= toW && !ev.exceptions.includes(date)) {
      out.push({ ...ev, occurrence: date, start: s, end: e, recurring: ev.repeat !== 'none', series_start: ev.start });
    }
  };
  const first = ev.start.slice(0, 10);
  if (ev.repeat === 'none') {
    push(first);
    return out;
  }
  const lower = D.addDays(from, -Math.ceil(dur / 1440));
  const begin = lower > first ? lower : first;
  const last = ev.repeat_until && ev.repeat_until < to ? ev.repeat_until : to;
  let guard = 0;
  if (ev.repeat === 'daily' || ev.repeat === 'weekdays') {
    for (let d = begin; d <= last && guard++ < 1500; d = D.addDays(d, 1)) {
      if (ev.repeat === 'weekdays' && [0, 6].includes(D.weekday(d))) continue;
      push(d);
    }
  } else if (ev.repeat === 'weekly') {
    let k = Math.max(0, Math.ceil(D.daysBetween(first, begin) / 7));
    for (let d = D.addDays(first, 7 * k); d <= last && guard++ < 600; d = D.addDays(first, 7 * ++k)) push(d);
  } else {
    const step = ev.repeat === 'monthly' ? 1 : 12;
    const day = Number(first.slice(8, 10));
    let k = Math.max(0, Math.floor(D.monthsBetween(first, begin) / step) - 1);
    for (let d = D.addMonths(first, k * step, day); d <= last && guard++ < 400; d = D.addMonths(first, ++k * step, day)) {
      if (d >= begin) push(d);
    }
  }
  return out;
}

/** Todas las ocasiones de eventos entre dos fechas (YYYY-MM-DD, inclusive), en orden. */
function listEvents(from, to) {
  from = D.normDate(String(from ?? '')) || D.today();
  to = D.normDate(String(to ?? '')) || from;
  if (to < from) [from, to] = [to, from];
  if (D.daysBetween(from, to) > 400) throw bad('El rango máximo es de 400 días.');
  const rows = db.all(
    `${SELECT} WHERE e.start <= ? AND ((e.repeat = 'none' AND e.end >= ?) OR (e.repeat <> 'none' AND (e.repeat_until IS NULL OR e.repeat_until >= ?)))
     ORDER BY e.start`,
    `${to}T23:59`, `${from}T00:00`, D.addDays(from, -MAX_SPAN_DAYS),
  );
  const out = [];
  for (const row of rows) out.push(...expand(parseRow(row), from, to));
  out.sort((a, b) => (a.all_day === b.all_day ? 0 : a.all_day ? -1 : 1) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return out;
}

const maxW = (a, b) => (a > b ? a : b);
const minW = (a, b) => (a < b ? a : b);

/** Huecos libres de un día dentro del horario de trabajo (o el que se indique). */
function freeSlots(date, durationMin = 60, from = null, to = null) {
  date = D.normDate(String(date ?? '')) || D.today();
  const duration = Math.max(5, int(durationMin, 60));
  const startT = D.normTime(String(from ?? '')) || db.getSetting('work_start') || '09:00';
  const endT = D.normTime(String(to ?? '')) || db.getSetting('work_end') || '19:00';
  let cursor = `${date}T${startT}`;
  const endW = `${date}T${endT}`;
  const now = D.nowWall();
  if (date === now.slice(0, 10)) {
    const m = Number(now.slice(14, 16));
    cursor = maxW(cursor, D.addMinutes(now, (15 - (m % 15)) % 15));
  }
  const busy = listEvents(date, date).filter((e) => !e.all_day);
  const slots = [];
  for (const e of busy) {
    if (cursor >= endW) break;
    if (e.start > cursor) {
      const gapEnd = minW(e.start, endW);
      if (D.diffMinutes(cursor, gapEnd) >= duration) slots.push({ start: cursor, end: gapEnd });
    }
    cursor = maxW(cursor, e.end);
  }
  if (cursor < endW && D.diffMinutes(cursor, endW) >= duration) slots.push({ start: cursor, end: endW });
  return { date, duration_min: duration, from: startT, to: endT, slots, busy: busy.map(brief) };
}

/** Avisos que tocan entre dos momentos: eventos con aviso y tareas con hora límite. */
function reminders(fromW, toW) {
  fromW = D.normWall(String(fromW ?? '')) || D.nowWall();
  toW = D.normWall(String(toW ?? '')) || D.addMinutes(fromW, 24 * 60);
  if (D.diffMinutes(fromW, toW) > 7 * 1440) toW = D.addMinutes(fromW, 7 * 1440);
  const out = [];
  for (const e of listEvents(fromW.slice(0, 10), D.addDays(toW.slice(0, 10), 28))) {
    if (e.reminder_min === null || e.reminder_min === undefined) continue;
    const at = D.addMinutes(e.start, -e.reminder_min);
    if (at >= fromW && at <= toW) {
      out.push({ kind: 'event', key: `e${e.id}@${e.start}`, remind_at: at, id: e.id, title: e.title, start: e.start, location: e.location, minutes_before: e.reminder_min });
    }
  }
  const tasks = db.all(
    `SELECT id, title, due_date, due_time FROM tasks WHERE status <> 'hecha' AND due_time IS NOT NULL
       AND (due_date || 'T' || due_time) BETWEEN ? AND ?`,
    fromW, toW,
  );
  for (const t of tasks) {
    const at = `${t.due_date}T${t.due_time}`;
    out.push({ kind: 'task', key: `t${t.id}@${at}`, remind_at: at, id: t.id, title: t.title, start: at, minutes_before: 0 });
  }
  return out.sort((a, b) => a.remind_at.localeCompare(b.remind_at));
}

/**
 * Datos de un evento a partir de lo que entendió el intérprete de fechas (dates.parseSpanish).
 * Sin hora es de todo el día. reminderOnly ("recuérdame…") avisa a la hora exacta.
 */
function fromParsed(title, p, reminderOnly = false) {
  const allDay = !p.time;
  const data = {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    start: allDay ? p.date : `${p.date}T${p.time}`,
    all_day: allDay,
    repeat: p.repeat || 'none',
    reminder_min: p.reminder ?? (allDay ? null : reminderOnly ? 0 : int(db.getSetting('default_reminder'))),
  };
  if (p.end_time && !allDay) data.end = `${p.date}T${p.end_time}`;
  return data;
}

/** Versión compacta de una ocasión (para el asistente y los resúmenes). */
function brief(e) {
  const o = { id: e.id, title: e.title, start: e.start, end: e.end };
  if (e.all_day) o.all_day = true;
  if (e.location) o.location = e.location;
  if (e.notes) o.notes = e.notes.slice(0, 300);
  if (e.repeat && e.repeat !== 'none') {
    o.repeat = e.repeat;
    o.occurrence = e.occurrence;
  }
  if (e.reminder_min !== null && e.reminder_min !== undefined) o.reminder_min = e.reminder_min;
  if (e.project_name) o.project = e.project_name;
  if (e.category && e.category !== 'general') o.category = e.category;
  return o;
}

module.exports = {
  REPEATS, REPEAT_NAMES, getEvent, createEvent, updateEvent, deleteEvent, listEvents, expand, freeSlots, reminders, brief, validate, fromParsed,
};
