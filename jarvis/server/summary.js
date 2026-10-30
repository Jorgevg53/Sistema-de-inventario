'use strict';
/* Resumen del día (datos y texto hablado) y búsqueda general. */
const db = require('./db');
const D = require('./dates');
const agenda = require('./agenda');
const projects = require('./projects');
const { fold } = require('./util');

/** Cómo llama JARVIS al usuario: el tratamiento elegido ("señor") o, si no hay, su nombre. */
function address() {
  const title = (db.getSetting('user_title') || '').trim();
  const name = (db.getSetting('user_name') || '').trim().split(/\s+/)[0] || '';
  return title || name;
}

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function briefing(date = D.today()) {
  date = D.normDate(String(date ?? '')) || D.today();
  const now = D.nowWall();
  const isToday = date === now.slice(0, 10);
  const events = agenda.listEvents(date, date);
  const upcoming = agenda.listEvents(D.addDays(date, 1), D.addDays(date, 7)).slice(0, 8);
  return {
    date,
    long_date: D.longDate(date),
    is_today: isToday,
    now,
    events,
    next_event: isToday ? events.find((e) => !e.all_day && e.end > now) || null : null,
    tasks_due: projects.listTasks({ status: 'abiertas', when: date }),
    overdue: isToday ? projects.listTasks({ when: 'overdue' }) : [],
    in_progress: projects.listTasks({ status: 'en_progreso', limit: 8 }),
    projects: projects.listProjects({ status: 'activo' }).slice(0, 8),
    upcoming,
  };
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('; ')} y ${items[items.length - 1]}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function eventPhrase(e) {
  if (e.all_day) return `${e.title} (todo el día)`;
  return `a las ${D.humanTime(e.start.slice(11))}, ${e.title}${e.location ? ` en ${e.location}` : ''}`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Evita el punto doble tras "p. m." al cerrar una frase. */
const tidy = (s) => s.replace(/([ap]\. m\.)\./g, '$1');

/** Texto breve, pensado para leerse en voz alta. */
function briefingText(b, { greet = true } = {}) {
  const who = address();
  const parts = [];
  const shortDate = b.long_date.replace(/ de \d{4}$/, '');
  if (greet) parts.push(`${greeting()}${who ? `, ${who}` : ''}.`);
  if (b.is_today) parts.push(`Hoy es ${shortDate}.`);
  const subject = b.is_today ? '' : `${cap(D.humanDate(b.date))}${D.daysBetween(D.today(), b.date) > 2 ? ` (${shortDate})` : ''} `;

  const pending = b.is_today ? b.events.filter((e) => e.all_day || e.end > b.now) : b.events;
  if (!b.events.length) parts.push(`${subject}${subject ? 'no tiene' : 'No tiene'} eventos en la agenda.`);
  else if (b.is_today && !pending.length) parts.push('Ya terminaron todos los eventos de hoy.');
  else {
    const shown = pending.slice(0, 5).map(eventPhrase);
    const more = pending.length > 5 ? `, y ${plural(pending.length - 5, 'más', 'más')}` : '';
    const verb = b.is_today && pending.length < b.events.length ? 'Le quedan' : subject ? 'tiene' : 'Tiene';
    parts.push(`${subject}${verb} ${plural(pending.length, 'evento', 'eventos')}: ${joinList(shown)}${more}.`);
  }

  if (b.tasks_due.length) {
    const names = b.tasks_due.slice(0, 4).map((t) => t.title);
    parts.push(`${b.is_today ? 'Para hoy' : 'Ese día'} vence${b.tasks_due.length === 1 ? '' : 'n'} ${plural(b.tasks_due.length, 'tarea', 'tareas')}: ${joinList(names)}${b.tasks_due.length > 4 ? ', entre otras' : ''}.`);
  }
  if (b.overdue.length) {
    parts.push(`Atención: ${plural(b.overdue.length, 'tarea está vencida', 'tareas están vencidas')}, por ejemplo «${b.overdue[0].title}».`);
  }
  if (!greet) return tidy(parts.join(' '));
  const urgent = b.projects.filter((p) => p.days_left !== null && p.days_left <= 7 && p.days_left >= 0);
  if (urgent.length) {
    const p = urgent[0];
    parts.push(`El proyecto ${p.name} va al ${p.progress}\u00a0% y vence ${p.days_left === 0 ? 'hoy' : p.days_left === 1 ? 'mañana' : `en ${p.days_left} días`}.`);
  } else if (b.projects.length) {
    parts.push(`Tiene ${plural(b.projects.length, 'proyecto activo', 'proyectos activos')}.`);
  }
  return tidy(parts.join(' '));
}

/** Busca en eventos, tareas y proyectos. */
function search(q, limit = 15) {
  const needle = fold(q).trim();
  if (!needle) return { events: [], tasks: [], projects: [] };
  const has = (...fields) => fold(fields.filter(Boolean).join(' ')).includes(needle);
  const events = db.all('SELECT id, title, location, notes FROM events ORDER BY start DESC LIMIT 2000')
    .filter((e) => has(e.title, e.location, e.notes))
    .slice(0, limit)
    .map((e) => agenda.brief(agenda.getEvent(e.id)));
  const tasks = projects.listTasks({ limit: 1000 }).filter((t) => has(t.title, t.notes)).slice(0, limit).map(projects.briefTask);
  const projs = projects.listProjects().filter((p) => has(p.name, p.description)).slice(0, limit).map(projects.briefProject);
  const notes = db.all(
    'SELECT n.id, n.text, n.created_at, p.name AS project FROM project_notes n JOIN projects p ON p.id = n.project_id ORDER BY n.id DESC LIMIT 2000',
  ).filter((n) => has(n.text)).slice(0, limit);
  return { events, tasks, projects: projs, notes };
}

module.exports = { address, greeting, briefing, briefingText, search, eventPhrase, joinList, plural, tidy };
