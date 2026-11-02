'use strict';
/**
 * Modo básico de JARVIS: funciona sin internet y sin clave de Claude. Entiende las órdenes más comunes en español
 * ("agenda dentista mañana a las 5", "¿qué tengo hoy?", "agrega la tarea X al proyecto Y", "terminé X"…).
 */
const db = require('../db');
const D = require('../dates');
const agenda = require('../agenda');
const projects = require('../projects');
const summary = require('../summary');
const { fold, bestMatch } = require('../util');
const { eventLabel, conflicts } = require('./tools');

// Evento al que le falta la fecha: la siguiente respuesta ("mañana a las 5") lo completa.
let pending = null;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const sir = () => {
  const w = summary.address();
  return w ? `, ${w}` : '';
};

/** Quita del texto original lo que coincide con `re` al inicio (las posiciones coinciden gracias a fold). */
function stripPrefix(text, re) {
  const m = fold(text).replace(/[,;:]/g, ' ').match(re);
  return m && m.index === 0 ? text.slice(m[0].length) : text;
}

function whenText(date, time) {
  return time ? `${D.humanDate(date)} a las ${D.humanTime(time)}` : D.humanDate(date);
}

const HELP = `En modo básico entiendo órdenes como:
• «Agenda dentista mañana a las 5»
• «Recuérdame llamar a Juan en 2 horas»
• «Agenda junta de equipo todos los lunes a las 9:30»
• «¿Qué tengo hoy?» o «¿qué tengo esta semana?»
• «¿Cuándo tengo tiempo libre el viernes?»
• «Crea el proyecto Tienda en línea para el 30 de noviembre»
• «Agrega la tarea diseñar el logo al proyecto Tienda en línea para el lunes»
• «Terminé la tarea diseñar el logo»
• «¿Cómo va el proyecto Tienda en línea?»
• «Cancela la cita con el dentista»
Si agrega su clave de Claude en Ajustes podrá hablarme con total libertad y le ayudaré a planear proyectos completos.`;

// ---------------------------------------------------------------------------
// Patrones (sobre el texto en minúsculas y sin acentos)
// ---------------------------------------------------------------------------
const COMPLETE_RE = /^(?:ya\s+)?(?:complete|termine|acabe|finalice|hice|marca(?:r|la)?|completa(?:r|la)?|termina(?:r|la)?|tacha(?:r|la)?|finaliza(?:r)?)\b/;
const START_RE = /^(?:empiezo|empece|comienzo|comence|inicio|inicie|estoy\s+(?:haciendo|trabajando\s+en)|voy\s+a\s+(?:empezar|comenzar)(?:\s+con)?)\b/;
const CANCEL_RE = /^(?:cancela(?:r|me)?|elimina(?:r)?|borra(?:r)?|quita(?:r)?|suprime)\b/;
const PROJECT_CREATE_RE = /^(?:(?:crea(?:r|me)?|nuevo|nueva|inicia(?:r)?|empieza|empezar|comienza|abre|abrir|agrega(?:r)?|anade|registra(?:r)?)\s+(?:un\s+|el\s+|mi\s+)?(?:nuevo\s+)?proyecto|proyecto\s+nuevo)\b\s*(?::\s*)?/;
const NOTE_RE = /^(?:(?:anota|apunta|agrega|anade|guarda)\s+(?:una\s+)?(?:nota\s+)?|nota\s+)(?:en|al|para|del)\s+(?:el\s+)?proyecto\s+/;
const TASK_CREATE_RE = /^(?:(?:agrega(?:r|me)?|anade|crea(?:r|me)?|pon(?:me)?|anota(?:me)?|apunta(?:me)?|nueva|registra(?:r)?)\s+(?:una\s+|la\s+|las\s+)?(?:nuevas?\s+)?tareas?|tareas?\s+nuevas?|tengo\s+que|necesito|debo|hay\s+que|pendiente)\b\s*(?::\s*)?/;
const EVENT_CREATE_RE = /^(?:agenda(?:r|me|le)?|programa(?:r|me)?|anota(?:me)?|apunta(?:me)?|pon(?:me|er)?|registra(?:r)?|reserva(?:r)?|aparta(?:r)?|bloquea(?:r)?|recuerdame|recordarme|avisame|(?:crea(?:r)?|agrega(?:r)?|anade|nuev[oa])\s+(?:un\s+|una\s+)?(?:evento|cita|reunion|junta|recordatorio)|tengo\s+(?:una?\s+)?(?:cita|reunion|junta|evento|clase|consulta|vuelo|cena|comida|entrevista))\b/;
const EVENT_PREFIX = /^(?:agenda(?:r|me|le)?|programa(?:r|me)?|anota(?:me)?|apunta(?:me)?|pon(?:me|er)?|registra(?:r)?|reserva(?:r)?|aparta(?:r)?|bloquea(?:r)?|recuerdame|recordarme|avisame|tengo|crea(?:r)?|agrega(?:r)?|anade|nuevo|nueva)\s+(?:que\s+)?(?:un\s+|una\s+)?(?:(?:evento|recordatorio)\s+(?:de\s+|para\s+|llamado\s+)?)?(?:en\s+(?:mi\s+|la\s+)?agenda\s+)?/;
const REMIND_RE = /^(?:recuerdame|recordarme|avisame)\b/;
const FREE_RE = /\b(?:tiempo\s+libre|huecos?|horario\s+libre|espacio\s+libre|estoy\s+libre|tengo\s+tiempo|cuando\s+puedo|disponibilidad|disponible)\b/;
const TASKS_Q_RE = /\b(?:tareas|pendientes|por\s+hacer|que\s+me\s+falta|que\s+debo|que\s+tengo\s+que\s+hacer|vencidas?|atrasad[ao]s?)\b/;
const PROJECTS_Q_RE = /\b(?:proyectos?|como\s+va(?:n)?|avance|progreso|estado\s+de)\b/;
const BRIEF_RE = /\b(?:resumen|informe|reporte|briefing|ponme\s+al\s+dia|novedades|como\s+vamos)\b/;
const AGENDA_Q_RE = /\b(?:que\s+tengo|agenda|eventos?|citas?|reuniones|compromisos|mi\s+dia|que\s+hay|que\s+me\s+toca|planes|horario|calendario|ocupad[oa])\b/;

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------
function createEventFrom(title, p, reminderOnly, ctx) {
  const allDay = !p.time;
  const ev = agenda.createEvent(agenda.fromParsed(title, p, reminderOnly));
  ctx.actions.push({ type: 'event_created', label: `Evento creado: ${eventLabel(ev)}`, ref: { kind: 'event', id: ev.id, date: ev.start.slice(0, 10) } });
  const rep = ev.repeat !== 'none' ? `, ${agenda.REPEAT_NAMES[ev.repeat]}` : '';
  const rem = ev.reminder_min === null ? '' : ev.reminder_min === 0 ? '. Le avisaré a esa hora' : `. Le avisaré ${ev.reminder_min} minutos antes`;
  const cross = conflicts(ev);
  const warn = cross.length ? ` Ojo: se cruza con «${cross[0].title}» a las ${D.humanTime(cross[0].start.slice(11))}.` : '';
  const verb = reminderOnly ? 'Se lo recordaré' : 'Agendado';
  return `${verb}${sir()}: «${ev.title}» ${whenText(ev.start.slice(0, 10), allDay ? null : ev.start.slice(11))}${rep}${rem}.${warn}`;
}

function createEvent(text, n, ctx, now) {
  const reminderOnly = REMIND_RE.test(n);
  const rest = stripPrefix(text, EVENT_PREFIX);
  const p = D.parseSpanish(rest, now);
  const title = D.cleanText(p.rest.replace(/\s+en\s+(?:mi|la)\s+agenda\s*$/i, ''));
  if (!title) return p.found ? agendaReply(text, now) : '¿Qué desea que agende y para cuándo?';
  if (!p.found) {
    if (reminderOnly) return createTasks(rest, ctx, now, true);
    pending = { title, reminderOnly, at: Date.now() };
    return `¿Para cuándo agendo «${cap(title)}»?`;
  }
  if (reminderOnly && !p.time) return createTasks(rest, ctx, now, true);
  return createEventFrom(title, p, reminderOnly, ctx);
}

function createTasks(rest, ctx, now, fromReminder = false, multi = false) {
  const p = D.parseSpanish(rest, now);
  let body = p.rest;
  let priority = null;
  body = body.replace(/\b(?:con\s+)?prioridad\s+(alta|media|baja)\b/i, (_, x) => { priority = fold(x); return ' '; });
  body = body.replace(/\b(urgente|importante)\b/i, () => { priority = 'alta'; return ' '; });
  let project = null;
  let missingProject = null;
  const pm = fold(body).match(/(?:^|[\s,])(?:al|del|en\s+el|para\s+el|en|de|para)\s+proyecto\s+(.+)$/);
  if (pm) {
    const ref = D.cleanText(body.slice(pm.index + pm[0].length - pm[1].length));
    project = projects.findProject(ref);
    if (!project) missingProject = ref;
    body = body.slice(0, pm.index);
  }
  const cleaned = D.cleanText(body);
  const list = (multi ? cleaned.split(/\s*[,;]\s*|\s+y\s+/i) : [cleaned]).map((t) => cap(D.cleanText(t))).filter(Boolean);
  if (!list.length) return '¿Cuál es la tarea?';
  const created = db.transaction(() =>
    list.map((title) =>
      projects.createTask({
        title,
        project_id: project ? project.id : null,
        due_date: p.found ? p.date : null,
        due_time: p.found && p.time ? p.time : null,
        priority: priority || 'media',
      }),
    ),
  );
  for (const t of created) {
    ctx.actions.push({ type: 'task_created', label: `Tarea: ${t.title}${t.due_date ? ` · ${D.humanDate(t.due_date)}` : ''}${t.project_name ? ` · ${t.project_name}` : ''}`, ref: { kind: 'task', id: t.id, project_id: t.project_id } });
  }
  const first = created[0];
  const what = created.length === 1 ? `«${first.title}»` : `${created.length} tareas`;
  const when = first.due_date ? `, para ${whenText(first.due_date, first.due_time)}` : '';
  const where = project ? ` en el proyecto ${project.name}` : '';
  const miss = missingProject ? ` No encontré el proyecto «${missingProject}», así que quedó como tarea suelta.` : '';
  const hint = fromReminder && !first.due_time ? ' Si quiere un aviso, dígame a qué hora.' : '';
  return `Anotado${sir()}: ${what}${where}${when}.${miss}${hint}`;
}

function cleanRef(s) {
  return D.cleanText(
    fold(s)
      .replace(/\b(?:como\s+)?(?:hecha|hecho|terminada|terminado|completada|completado|lista|listo)\b/g, ' ')
      .replace(/\b(?:tarea|pendiente)\b/g, ' '),
  );
}

function completeTask(text, ctx) {
  const ref = cleanRef(stripPrefix(text, COMPLETE_RE));
  if (!ref) return '¿Qué tarea terminó?';
  const t = projects.findTask(ref);
  if (!t) return `No encontré una tarea pendiente parecida a «${ref}».`;
  const u = projects.updateTask(t.id, { status: 'hecha' });
  ctx.actions.push({ type: 'task_updated', label: `Tarea completada: ${u.title}`, ref: { kind: 'task', id: u.id, project_id: u.project_id } });
  let extra = '';
  if (u.project_id) {
    const p = projects.getProject(u.project_id);
    extra = p.progress === 100 ? ` ¡El proyecto ${p.name} tiene todas sus tareas terminadas!` : ` El proyecto ${p.name} va al ${p.progress}\u00a0%.`;
  }
  return `Excelente trabajo${sir()}. Marqué «${u.title}» como hecha.${extra}`;
}

function startTask(text, ctx) {
  const ref = cleanRef(stripPrefix(text, START_RE).replace(/^\s*(?:con|a)\s+/i, ''));
  const t = ref && projects.findTask(ref);
  if (!t) return ref ? `No encontré una tarea pendiente parecida a «${ref}».` : '¿Con qué tarea empieza?';
  const u = projects.updateTask(t.id, { status: 'en_progreso' });
  ctx.actions.push({ type: 'task_updated', label: `En progreso: ${u.title}`, ref: { kind: 'task', id: u.id, project_id: u.project_id } });
  return `Entendido: «${u.title}» está en progreso. Mucho éxito${sir()}.`;
}

function cancel(text, n, ctx, now) {
  const rest = stripPrefix(text, CANCEL_RE);
  const f = fold(rest);
  if (/\bproyecto\b/.test(f)) return 'Por seguridad, los proyectos se eliminan desde la pantalla de Proyectos.';
  if (/\b(?:tarea|pendiente)\b/.test(f)) {
    const ref = cleanRef(rest);
    const t = ref && projects.findTask(ref, { openOnly: false });
    if (!t) return `No encontré la tarea «${ref}».`;
    projects.deleteTask(t.id);
    ctx.actions.push({ type: 'task_deleted', label: `Tarea eliminada: ${t.title}`, ref: { kind: 'task', id: t.id, project_id: t.project_id } });
    return `Eliminé la tarea «${t.title}».`;
  }
  const p = D.parseSpanish(rest, now);
  const ref = D.cleanText(p.rest);
  if (!ref) return '¿Qué evento cancelo?';
  const today = D.today(now);
  const from = p.found ? p.date : today;
  const occ = agenda.listEvents(from, p.found ? p.date : D.addDays(today, 90)).filter((e) => e.end >= D.nowWall(now) || p.found);
  const generic = fold(ref).replace(/\b(?:cita|evento|recordatorio|compromiso)\b/g, ' ');
  const ev = bestMatch(ref, occ, (e) => e.title) || bestMatch(generic, occ, (e) => e.title);
  if (!ev) return `No encontré «${ref}» en su agenda${p.found ? ` para ${D.humanDate(p.date)}` : ' de los próximos 90 días'}.`;
  if (ev.recurring) {
    agenda.deleteEvent(ev.id, ev.occurrence);
    ctx.actions.push({ type: 'event_deleted', label: `Cancelado solo ${D.humanDate(ev.occurrence)}: ${ev.title}`, ref: { kind: 'event', id: ev.id } });
    return `Cancelé «${ev.title}» solo ${D.humanDate(ev.occurrence)}. La serie sigue en pie; para eliminarla completa hágalo desde la Agenda.`;
  }
  agenda.deleteEvent(ev.id);
  ctx.actions.push({ type: 'event_deleted', label: `Evento eliminado: ${ev.title}`, ref: { kind: 'event', id: ev.id } });
  return `Listo, cancelé «${ev.title}» de ${whenText(ev.start.slice(0, 10), ev.all_day ? null : ev.start.slice(11))}.`;
}

function createProject(text, ctx, now) {
  const rest = stripPrefix(text, PROJECT_CREATE_RE);
  const p = D.parseSpanish(rest, now);
  let name = p.rest
    .replace(/^\s*(?:llamado|llamada|que\s+se\s+llame|de\s+nombre|con\s+(?:el\s+)?nombre(?:\s+de)?)\s+/i, '')
    .replace(/\s+(?:que\s+)?(?:termin[ea]|venc[ea]|se\s+entregue|entrega|con\s+fecha\s+l[ií]mite|fecha\s+l[ií]mite)(?:\s+(?:el|para))?\s*$/i, '')
    .replace(/["“”«»]/g, '');
  name = cap(D.cleanText(name));
  if (!name) return '¿Cómo se llamará el proyecto?';
  const proj = projects.createProject({ name, due_date: p.found ? p.date : null });
  ctx.actions.push({ type: 'project_created', label: `Proyecto creado: ${proj.name}`, ref: { kind: 'project', id: proj.id } });
  const due = proj.due_date ? `, con fecha límite ${D.humanDate(proj.due_date)}` : '';
  return `Proyecto «${proj.name}» creado${due}. ¿Agregamos sus primeras tareas? Diga, por ejemplo: «agrega la tarea definir objetivos al proyecto ${proj.name}».`;
}

function addNote(text, ctx) {
  const rest = stripPrefix(text, NOTE_RE);
  const m = rest.match(/^(.+?)(?::|\s+que\s+|\s*[-–]\s+)(.+)$/i);
  if (!m) return 'Dígame la nota así: «anota en el proyecto Nombre: el texto de la nota».';
  const proj = projects.findProject(D.cleanText(m[1]));
  if (!proj) return `No encontré el proyecto «${D.cleanText(m[1])}».`;
  projects.addNote(proj.id, cap(m[2].trim()));
  ctx.actions.push({ type: 'note_added', label: `Nota en ${proj.name}`, ref: { kind: 'project', id: proj.id } });
  return `Anotado en la bitácora de ${proj.name}.`;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
function rangeFrom(text, now) {
  const f = fold(text);
  const today = D.today(now);
  if (/\besta\s+semana\b/.test(f)) return [today, D.weekday(today) === 0 ? today : D.nextWeekday(today, 0, true)];
  if (/\b(?:(?:la\s+)?(?:proxima|siguiente)\s+semana|semana\s+que\s+viene)\b/.test(f)) {
    const mon = D.nextWeekday(today, 1, false);
    return [mon, D.addDays(mon, 6)];
  }
  if (/\beste\s+mes\b/.test(f)) {
    const [y, m] = today.split('-').map(Number);
    return [today, `${today.slice(0, 8)}${String(D.daysInMonth(y, m - 1)).padStart(2, '0')}`];
  }
  if (/\b(?:proximos|siguientes)\s+dias\b/.test(f)) return [today, D.addDays(today, 7)];
  const p = D.parseSpanish(text, now);
  const d = p.found && p.date ? p.date : today;
  return [d, d];
}

function agendaReply(text, now) {
  const [from, to] = rangeFrom(text, now);
  if (from === to) return summary.briefingText(summary.briefing(from), { greet: false });
  const events = agenda.listEvents(from, to);
  if (!events.length) return `No tiene eventos entre ${D.humanDate(from)} y ${D.humanDate(to)}.`;
  const byDay = new Map();
  for (const e of events) {
    const d = e.start.slice(0, 10) < from ? from : e.start.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  const lines = [...byDay.entries()].slice(0, 10).map(([d, list]) =>
    `• ${cap(D.humanDate(d))}: ${list.slice(0, 4).map((e) => (e.all_day ? e.title : `${D.humanTime(e.start.slice(11))} ${e.title}`)).join('; ')}${list.length > 4 ? '…' : ''}`);
  return `Tiene ${summary.plural(events.length, 'evento', 'eventos')}:\n${lines.join('\n')}`;
}

function freeTime(text, now) {
  const p = D.parseSpanish(text, now);
  const date = p.found && p.date ? p.date : D.today(now);
  const r = agenda.freeSlots(date, p.duration || 60);
  if (!r.slots.length) return `${cap(D.humanDate(date))} no tiene huecos de ${r.duration_min} minutos entre ${D.humanTime(r.from)} y ${D.humanTime(r.to)}.`;
  const list = r.slots.slice(0, 5).map((s) => `de ${D.humanTime(s.start.slice(11))} a ${D.humanTime(s.end.slice(11))}`);
  return `${cap(D.humanDate(date))} está libre ${summary.joinList(list)}.`;
}

function taskLine(t) {
  const due = t.due_date ? ` (${t.due_date < D.today() ? 'venció ' : ''}${D.humanDate(t.due_date)})` : '';
  return `• ${t.title}${due}${t.project_name ? ` — ${t.project_name}` : ''}`;
}

function tasksReply(text, now) {
  const f = fold(text);
  if (/vencid|atrasad/.test(f)) {
    const list = projects.listTasks({ when: 'overdue' });
    if (!list.length) return `No tiene tareas vencidas${sir()}. Todo al día.`;
    return `Tiene ${summary.plural(list.length, 'tarea vencida', 'tareas vencidas')}:\n${list.slice(0, 8).map(taskLine).join('\n')}`;
  }
  const pm = f.match(/\bproyecto\s+(.+)$/);
  if (pm) {
    const proj = projects.findProject(D.cleanText(pm[1]));
    if (!proj) return `No encontré el proyecto «${D.cleanText(pm[1])}».`;
    const list = projects.listTasks({ project_id: proj.id, status: 'abiertas' });
    if (!list.length) return `El proyecto ${proj.name} no tiene tareas pendientes.`;
    return `${proj.name} tiene ${summary.plural(list.length, 'tarea pendiente', 'tareas pendientes')}:\n${list.slice(0, 8).map(taskLine).join('\n')}`;
  }
  const p = D.parseSpanish(text, now);
  if (p.found && p.date) {
    const list = projects.listTasks({ status: 'abiertas', when: p.date });
    if (!list.length) return `No tiene tareas que venzan ${D.humanDate(p.date)}.`;
    return `${cap(D.humanDate(p.date))} vence${list.length === 1 ? '' : 'n'} ${summary.plural(list.length, 'tarea', 'tareas')}:\n${list.slice(0, 8).map(taskLine).join('\n')}`;
  }
  const open = projects.listTasks({ status: 'abiertas' });
  if (!open.length) return `No tiene tareas pendientes${sir()}. ¿Agregamos alguna?`;
  const overdue = projects.listTasks({ when: 'overdue' }).length;
  const head = `Tiene ${summary.plural(open.length, 'tarea pendiente', 'tareas pendientes')}${overdue ? `, ${overdue} vencida${overdue === 1 ? '' : 's'}` : ''}.`;
  return `${head}\n${open.slice(0, 8).map(taskLine).join('\n')}`;
}

function projectStatus(p) {
  const full = projects.getProject(p.id);
  const next = full.tasks.filter((t) => t.status !== 'hecha').slice(0, 3).map((t) => t.title);
  const due = full.due_date
    ? full.days_left < 0 ? ` Venció ${D.humanDate(full.due_date)}.` : ` Vence ${D.humanDate(full.due_date)} (faltan ${summary.plural(full.days_left, 'día', 'días')}).`
    : '';
  const late = full.tasks_overdue ? ` Hay ${summary.plural(full.tasks_overdue, 'tarea vencida', 'tareas vencidas')}.` : '';
  const steps = next.length ? ` Siguiente${next.length > 1 ? 's pasos' : ' paso'}: ${summary.joinList(next)}.` : '';
  const status = full.status === 'activo' ? '' : ` (está ${full.status.replace('_', ' ')})`;
  return `${full.name}${status} va al ${full.progress}\u00a0%: ${full.tasks_done} de ${summary.plural(full.tasks_total, 'tarea', 'tareas')} hechas.${due}${late}${steps}`;
}

function projectsReply(text) {
  const f = fold(text);
  const m = f.match(/\b(?:proyecto|como\s+va|estado\s+de|avance\s+de|progreso\s+de)\s+(?:el\s+|la\s+|mi\s+|del\s+)?(?:proyecto\s+)?(.+)$/);
  if (m) {
    const ref = D.cleanText(m[1].replace(/\b(?:proyectos?)\b/g, ' '));
    const proj = ref && projects.findProject(ref);
    if (proj) return projectStatus(proj);
  }
  const list = projects.listProjects({ status: 'activo' });
  if (!list.length) return 'No tiene proyectos activos. Diga «crea el proyecto…» para empezar uno.';
  const lines = list.slice(0, 6).map((p) => `• ${p.name}: ${p.progress}\u00a0%${p.days_left !== null ? (p.days_left < 0 ? ', vencido' : `, vence en ${summary.plural(p.days_left, 'día', 'días')}`) : ''}${p.tasks_overdue ? `, ${p.tasks_overdue} vencidas` : ''}`);
  return `Tiene ${summary.plural(list.length, 'proyecto activo', 'proyectos activos')}:\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
function route(raw, ctx, now) {
  const text = raw
    .replace(/^\s*(?:(?:oye|hey|ok|hola)\s*,?\s*)?jarvis\b[\s,:.!¡]*/i, '')
    .replace(/^[\s¿¡]+/, '')
    .replace(/[?!.\s]+$/, '');
  const n = fold(text).replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (!n) return summary.briefingText(summary.briefing(D.today(now)));

  if (pending && Date.now() - pending.at < 5 * 60000 && !EVENT_CREATE_RE.test(n)) {
    const p = D.parseSpanish(text, now);
    const job = pending;
    pending = null;
    if (p.found && p.date && !D.cleanText(p.rest)) return createEventFrom(job.title, p, job.reminderOnly, ctx);
  }
  pending = null;

  if (/^(?:gracias|muchas\s+gracias|mil\s+gracias|perfecto|excelente|genial|ok\s+gracias)\b/.test(n)) return `A su servicio${sir()}.`;
  if (/\b(?:ayuda|que\s+puedes\s+hacer|que\s+sabes\s+hacer|comandos|como\s+funcionas|como\s+te\s+uso)\b/.test(n)) return HELP;
  if (/\b(?:que\s+hora\s+es|dime\s+la\s+hora)\b/.test(n)) return `Son las ${D.humanTime(D.nowWall(now).slice(11))}.`;
  if (/\b(?:que\s+dia\s+es\s+hoy|que\s+fecha\s+es|fecha\s+de\s+hoy|a\s+que\s+estamos)\b/.test(n)) return `Hoy es ${D.longDate(D.today(now))}.`;
  if (/^(?:hola|buen(?:os|as)\s+(?:dias|tardes|noches)|que\s+tal|saludos|hey)\b/.test(n) && n.split(' ').length <= 4) {
    return summary.briefingText(summary.briefing(D.today(now)));
  }

  if (PROJECT_CREATE_RE.test(n)) return createProject(text, ctx, now);
  if (NOTE_RE.test(n)) return addNote(text, ctx);
  if (COMPLETE_RE.test(n)) return completeTask(text, ctx);
  if (START_RE.test(n)) return startTask(text, ctx);
  if (CANCEL_RE.test(n)) return cancel(text, n, ctx, now);
  if (TASK_CREATE_RE.test(n)) {
    const multi = /^\S+\s+(?:las\s+)?(?:nuevas\s+)?tareas\b|^tareas\b/.test(n);
    return createTasks(stripPrefix(text, TASK_CREATE_RE), ctx, now, false, multi);
  }
  if (EVENT_CREATE_RE.test(n)) return createEvent(text, n, ctx, now);
  if (FREE_RE.test(n)) return freeTime(text, now);
  if (BRIEF_RE.test(n)) {
    const p = D.parseSpanish(text, now);
    return summary.briefingText(summary.briefing(p.found && p.date ? p.date : D.today(now)));
  }
  if (TASKS_Q_RE.test(n)) return tasksReply(text, now);
  if (PROJECTS_Q_RE.test(n)) return projectsReply(text);
  if (AGENDA_Q_RE.test(n)) return agendaReply(text, now);

  return `Disculpe${sir()}, en modo básico no entendí esa orden. Pruebe con «agenda dentista mañana a las 5», «¿qué tengo hoy?» o «agrega la tarea diseñar el logo al proyecto Tienda». Diga «ayuda» para ver más ejemplos.`;
}

/** Responde un mensaje. Devuelve { reply, actions }. */
function respond(message, now = new Date()) {
  const ctx = { actions: [] };
  const reply = summary.tidy(route(String(message ?? ''), ctx, now));
  return { reply, actions: ctx.actions };
}

function resetPending() {
  pending = null;
}

module.exports = { respond, resetPending, HELP };
