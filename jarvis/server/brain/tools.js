'use strict';
/**
 * Herramientas de JARVIS. Las usa Claude (tool use) y cada acción que cambia datos queda registrada en
 * ctx.actions para que la interfaz muestre lo que se hizo y se actualice.
 */
const db = require('../db');
const D = require('../dates');
const agenda = require('../agenda');
const projects = require('../projects');
const summary = require('../summary');
const { int } = require('../util');

const DATE = { type: 'string', description: 'Fecha AAAA-MM-DD' };
const WALL = { type: 'string', description: 'Fecha y hora local AAAA-MM-DDTHH:MM (o AAAA-MM-DD si es de todo el día)' };
const NULLABLE_DATE = { type: ['string', 'null'], description: 'Fecha AAAA-MM-DD, o null para quitarla' };
const PRIORITY = { type: 'string', enum: ['alta', 'media', 'baja'] };
const REPEAT = {
  type: 'string', enum: agenda.REPEATS,
  description: 'none = no se repite; daily = diario; weekdays = de lunes a viernes; weekly = cada semana (mismo día que el inicio); monthly = cada mes (mismo día del mes); yearly = cada año',
};
const EVENT_FIELDS = {
  title: { type: 'string', description: 'Título corto, p. ej. "Dentista" o "Reunión con Pedro"' },
  start: WALL,
  end: { type: 'string', description: 'Fin AAAA-MM-DDTHH:MM. Omítelo para usar la duración predeterminada (60 min).' },
  duration_min: { type: 'integer', description: 'Duración en minutos (alternativa a end)' },
  all_day: { type: 'boolean', description: 'true para eventos de todo el día (cumpleaños, vacaciones, viajes)' },
  location: { type: 'string' },
  notes: { type: 'string' },
  reminder_min: { type: ['integer', 'null'], description: 'Minutos antes para avisar (0 = a la hora del evento, null = sin aviso). Si se omite al crear, se usa el aviso predeterminado.' },
  repeat: REPEAT,
  repeat_until: { type: 'string', description: 'Último día de la repetición AAAA-MM-DD (opcional)' },
  category: { type: 'string', description: 'general, trabajo, personal, salud, familia, estudio, finanzas o viaje' },
  project_id: { type: ['integer', 'null'], description: 'Proyecto relacionado (opcional)' },
};
const TASK_FIELDS = {
  title: { type: 'string' },
  project_id: { type: ['integer', 'null'], description: 'id del proyecto (null = tarea suelta)' },
  due_date: NULLABLE_DATE,
  due_time: { type: ['string', 'null'], description: 'Hora límite HH:MM (opcional, avisa a esa hora)' },
  priority: PRIORITY,
  status: { type: 'string', enum: projects.TASK_STATUSES },
  notes: { type: 'string' },
};

function eventLabel(e) {
  const when = e.all_day ? D.humanDate(e.start.slice(0, 10)) : `${D.humanDate(e.start.slice(0, 10))} a las ${D.humanTime(e.start.slice(11))}`;
  const rep = e.repeat && e.repeat !== 'none' ? `, ${agenda.REPEAT_NAMES[e.repeat]}` : '';
  return `${e.title} · ${when}${rep}`;
}

function conflicts(ev) {
  if (ev.all_day) return [];
  return agenda
    .listEvents(ev.start.slice(0, 10), ev.end.slice(0, 10))
    .filter((o) => o.id !== ev.id && !o.all_day && o.start < ev.end && o.end > ev.start)
    .map(agenda.brief);
}

function tasksDueBetween(from, to) {
  return projects
    .listTasks({ status: 'abiertas', limit: 1000 })
    .filter((t) => t.due_date && t.due_date >= from && t.due_date <= to)
    .map(projects.briefTask);
}

const TOOLS = [
  {
    name: 'get_agenda',
    description: 'Consulta la agenda entre dos fechas: eventos (las repeticiones ya vienen calculadas, una entrada por ocasión) y tareas abiertas que vencen en ese rango. Úsala antes de responder sobre lo que el usuario tiene programado y para obtener el id de un evento antes de modificarlo o eliminarlo.',
    input_schema: { type: 'object', properties: { from: DATE, to: { ...DATE, description: 'Fecha final AAAA-MM-DD (inclusive, máximo 400 días)' } }, required: ['from', 'to'] },
    run({ from, to }) {
      const f = D.normDate(String(from ?? '')) || D.today();
      const t = D.normDate(String(to ?? '')) || f;
      return { events: agenda.listEvents(f, t).map(agenda.brief), tasks_due: tasksDueBetween(f, t) };
    },
  },
  {
    name: 'get_briefing',
    description: 'Resumen de un día: eventos, próximo evento, tareas que vencen, tareas vencidas, tareas en progreso y proyectos activos con su avance.',
    input_schema: { type: 'object', properties: { date: { ...DATE, description: 'Día a resumir (por defecto hoy)' } } },
    run({ date }) {
      const b = summary.briefing(date);
      return {
        date: b.date,
        events: b.events.map(agenda.brief),
        next_event: b.next_event && agenda.brief(b.next_event),
        tasks_due: b.tasks_due.map(projects.briefTask),
        overdue: b.overdue.slice(0, 20).map(projects.briefTask),
        in_progress: b.in_progress.map(projects.briefTask),
        projects: b.projects.map(projects.briefProject),
        next_7_days: b.upcoming.map(agenda.brief),
      };
    },
  },
  {
    name: 'create_event',
    description: 'Crea un evento en la agenda (cita, reunión, recordatorio con hora, evento de todo el día). Devuelve el evento y los conflictos de horario si los hay.',
    input_schema: { type: 'object', properties: EVENT_FIELDS, required: ['title', 'start'] },
    run(input, ctx) {
      const data = { ...input };
      if (!('reminder_min' in data)) data.reminder_min = int(db.getSetting('default_reminder'));
      const ev = agenda.createEvent(data);
      ctx.actions.push({ type: 'event_created', label: `Evento creado: ${eventLabel(ev)}`, ref: { kind: 'event', id: ev.id, date: ev.start.slice(0, 10) } });
      return { event: agenda.brief(ev), conflicts: conflicts(ev) };
    },
  },
  {
    name: 'update_event',
    description: 'Modifica un evento existente (toda la serie si se repite). Solo envía los campos que cambian.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' }, ...EVENT_FIELDS }, required: ['id'] },
    run({ id, ...input }, ctx) {
      const ev = agenda.updateEvent(id, input);
      ctx.actions.push({ type: 'event_updated', label: `Evento actualizado: ${eventLabel(ev)}`, ref: { kind: 'event', id: ev.id, date: ev.start.slice(0, 10) } });
      return { event: agenda.brief(ev), conflicts: conflicts(ev) };
    },
  },
  {
    name: 'delete_event',
    description: 'Elimina un evento. Si el evento se repite y el usuario se refiere a una sola ocasión, envía occurrence_date para cancelar solo ese día.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' }, occurrence_date: { ...DATE, description: 'Solo para eventos repetidos: el día que se cancela' } },
      required: ['id'],
    },
    run({ id, occurrence_date: date }, ctx) {
      const r = agenda.deleteEvent(id, date || null);
      const label = r.deleted === 'occurrence'
        ? `Cancelado solo ${D.humanDate(r.date)}: ${r.event.title}`
        : `Evento eliminado: ${r.event.title}`;
      ctx.actions.push({ type: 'event_deleted', label, ref: { kind: 'event', id: r.event.id } });
      return { ok: true, deleted: r.deleted, title: r.event.title, date: r.date };
    },
  },
  {
    name: 'find_free_time',
    description: 'Busca huecos libres en un día para algo de cierta duración, dentro del horario laboral del usuario (o el rango indicado).',
    input_schema: {
      type: 'object',
      properties: {
        date: DATE,
        duration_min: { type: 'integer', description: 'Minutos que se necesitan (por defecto 60)' },
        from_time: { type: 'string', description: 'HH:MM (opcional)' },
        to_time: { type: 'string', description: 'HH:MM (opcional)' },
      },
      required: ['date'],
    },
    run({ date, duration_min: dur, from_time: from, to_time: to }) {
      const r = agenda.freeSlots(date, dur || 60, from, to);
      return { date: r.date, duration_min: r.duration_min, window: `${r.from}-${r.to}`, free_slots: r.slots, busy: r.busy };
    },
  },
  {
    name: 'list_projects',
    description: 'Lista los proyectos con su avance (porcentaje de tareas hechas), fecha límite, días restantes y tareas vencidas.',
    input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['abiertos', ...projects.PROJECT_STATUSES], description: 'abiertos = activos y en pausa' } } },
    run({ status }) {
      return { projects: projects.listProjects({ status: status || null }).map(projects.briefProject) };
    },
  },
  {
    name: 'get_project',
    description: 'Detalle de un proyecto: datos, avance, todas sus tareas, notas de la bitácora y eventos relacionados.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    run({ id }) {
      const p = projects.getProject(id);
      return {
        project: { ...projects.briefProject(p), start_date: p.start_date, description: p.description },
        tasks: p.tasks.map(projects.briefTask),
        notes: p.notes.slice(0, 30).map((n) => ({ id: n.id, date: n.created_at, text: n.text })),
        events: p.events,
      };
    },
  },
  {
    name: 'create_project',
    description: 'Crea un proyecto. Puede incluir de una vez sus primeras tareas (por ejemplo, cuando el usuario pide planearlo o desglosarlo).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', description: 'Objetivo y alcance' },
        start_date: DATE,
        due_date: { ...DATE, description: 'Fecha límite AAAA-MM-DD (opcional)' },
        priority: PRIORITY,
        tasks: {
          type: 'array', maxItems: 50,
          items: { type: 'object', properties: { title: TASK_FIELDS.title, due_date: DATE, priority: PRIORITY, notes: TASK_FIELDS.notes }, required: ['title'] },
        },
      },
      required: ['name'],
    },
    run({ tasks = [], ...input }, ctx) {
      const p = db.transaction(() => {
        const created = projects.createProject(input);
        for (const t of tasks.slice(0, 50)) projects.createTask({ ...t, project_id: created.id });
        return projects.getProject(created.id);
      });
      ctx.actions.push({ type: 'project_created', label: `Proyecto creado: ${p.name}${tasks.length ? ` (${tasks.length} tareas)` : ''}`, ref: { kind: 'project', id: p.id } });
      return { project: projects.briefProject(p), tasks: p.tasks.map(projects.briefTask) };
    },
  },
  {
    name: 'update_project',
    description: 'Modifica un proyecto: nombre, descripción, estado (activo, en_pausa, completado, cancelado), prioridad o fechas.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: projects.PROJECT_STATUSES },
        priority: PRIORITY,
        start_date: NULLABLE_DATE,
        due_date: NULLABLE_DATE,
      },
      required: ['id'],
    },
    run({ id, ...input }, ctx) {
      const p = projects.updateProject(id, input);
      ctx.actions.push({ type: 'project_updated', label: `Proyecto actualizado: ${p.name}`, ref: { kind: 'project', id: p.id } });
      return { project: projects.briefProject(p) };
    },
  },
  {
    name: 'add_project_note',
    description: 'Agrega una nota a la bitácora de un proyecto (ideas, acuerdos, avances, datos importantes).',
    input_schema: { type: 'object', properties: { project_id: { type: 'integer' }, text: { type: 'string' } }, required: ['project_id', 'text'] },
    run({ project_id: projectId, text }, ctx) {
      const n = projects.addNote(projectId, text);
      const p = projects.getProject(projectId);
      ctx.actions.push({ type: 'note_added', label: `Nota en ${p.name}`, ref: { kind: 'project', id: p.id } });
      return { ok: true, note_id: n.id };
    },
  },
  {
    name: 'list_tasks',
    description: 'Lista tareas con filtros. status: abiertas (todo lo no terminado), pendiente, en_progreso o hecha. when: today (vencen hoy), overdue (vencidas), week (próximos 7 días), upcoming (con fecha futura), nodate (sin fecha).',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer' },
        status: { type: 'string', enum: ['abiertas', ...projects.TASK_STATUSES] },
        when: { type: 'string', enum: ['today', 'overdue', 'week', 'upcoming', 'nodate'] },
        query: { type: 'string', description: 'Texto a buscar en el título o las notas' },
      },
    },
    run({ project_id: projectId, status, when, query }) {
      const list = projects.listTasks({ project_id: projectId ?? null, status: status || (when ? null : 'abiertas'), when: when || null, q: query || null, limit: 100 });
      return { count: list.length, tasks: list.map(projects.briefTask) };
    },
  },
  {
    name: 'create_tasks',
    description: 'Crea una o varias tareas (sueltas o dentro de un proyecto). Úsala también para "recuérdame hacer X" cuando no hay una hora concreta.',
    input_schema: {
      type: 'object',
      properties: { tasks: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', properties: TASK_FIELDS, required: ['title'] } } },
      required: ['tasks'],
    },
    run({ tasks }, ctx) {
      const created = db.transaction(() => (tasks || []).slice(0, 50).map((t) => projects.createTask(t)));
      for (const t of created) {
        ctx.actions.push({
          type: 'task_created',
          label: `Tarea: ${t.title}${t.due_date ? ` · ${D.humanDate(t.due_date)}` : ''}${t.project_name ? ` · ${t.project_name}` : ''}`,
          ref: { kind: 'task', id: t.id, project_id: t.project_id },
        });
      }
      return { created: created.map(projects.briefTask) };
    },
  },
  {
    name: 'update_task',
    description: 'Modifica una tarea: marcarla como hecha (status "hecha"), en progreso, cambiar título, fecha, prioridad, proyecto o notas. Solo envía lo que cambia.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' }, ...TASK_FIELDS }, required: ['id'] },
    run({ id, ...input }, ctx) {
      const t = projects.updateTask(id, input);
      const label = input.status === 'hecha' ? `Tarea completada: ${t.title}` : `Tarea actualizada: ${t.title}`;
      ctx.actions.push({ type: 'task_updated', label, ref: { kind: 'task', id: t.id, project_id: t.project_id } });
      return { task: projects.briefTask(t) };
    },
  },
  {
    name: 'delete_task',
    description: 'Elimina una tarea definitivamente (para terminarla usa update_task con status "hecha").',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    run({ id }, ctx) {
      const t = projects.deleteTask(id);
      ctx.actions.push({ type: 'task_deleted', label: `Tarea eliminada: ${t.title}`, ref: { kind: 'task', id: t.id, project_id: t.project_id } });
      return { ok: true, title: t.title };
    },
  },
  {
    name: 'search',
    description: 'Busca texto en eventos, tareas, proyectos y notas de proyectos.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run({ query }) {
      return summary.search(query, 15);
    },
  },
];

module.exports = { TOOLS, eventLabel, conflicts };
