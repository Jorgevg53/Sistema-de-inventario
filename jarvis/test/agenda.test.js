'use strict';
/* Pruebas de agenda (repeticiones, excepciones, huecos libres) y proyectos. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-agenda-'));
process.env.DATA_DIR = tmp;
process.env.DB_FILE = path.join(tmp, 'test.db');

const db = require('../server/db');
const agenda = require('../server/agenda');
const projects = require('../server/projects');

before(() => db.open());
after(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const starts = (list) => list.map((e) => e.start);

test('evento simple con duración predeterminada y validaciones', () => {
  const ev = agenda.createEvent({ title: 'Dentista', start: '2030-03-10T17:00' });
  assert.equal(ev.end, '2030-03-10T18:00');
  assert.equal(ev.repeat, 'none');
  assert.throws(() => agenda.createEvent({ title: '', start: '2030-03-10T17:00' }), /título/);
  assert.throws(() => agenda.createEvent({ title: 'X', start: 'mañana' }), /inicio no es válida/);
  assert.throws(() => agenda.createEvent({ title: 'X', start: '2030-03-10T17:00', end: '2030-03-10T16:00' }), /antes del inicio/);
  const moved = agenda.updateEvent(ev.id, { start: '2030-03-11T09:30' });
  assert.equal(moved.end, '2030-03-11T10:30', 'al mover el inicio se conserva la duración');
});

test('repetición semanal con excepción y fecha final', () => {
  const ev = agenda.createEvent({ title: 'Junta', start: '2030-01-07T09:00', duration_min: 30, repeat: 'semanal', repeat_until: '2030-02-04' });
  let occ = agenda.listEvents('2030-01-01', '2030-02-28').filter((e) => e.id === ev.id);
  assert.deepEqual(starts(occ), ['2030-01-07T09:00', '2030-01-14T09:00', '2030-01-21T09:00', '2030-01-28T09:00', '2030-02-04T09:00']);
  agenda.deleteEvent(ev.id, '2030-01-21');
  occ = agenda.listEvents('2030-01-15', '2030-01-31').filter((e) => e.id === ev.id);
  assert.deepEqual(starts(occ), ['2030-01-28T09:00']);
  assert.equal(occ[0].recurring, true);
});

test('repetición mensual el día 31 usa el último día del mes', () => {
  const ev = agenda.createEvent({ title: 'Pagar tarjeta', start: '2031-01-31', all_day: true, repeat: 'monthly' });
  const occ = agenda.listEvents('2031-02-01', '2031-04-30').filter((e) => e.id === ev.id);
  assert.deepEqual(occ.map((e) => e.occurrence), ['2031-02-28', '2031-03-31', '2031-04-30']);
  assert.equal(occ[0].all_day, true);
});

test('de lunes a viernes y diario', () => {
  const ev = agenda.createEvent({ title: 'Gimnasio', start: '2032-03-05T07:00', repeat: 'weekdays' }); // viernes
  const occ = agenda.listEvents('2032-03-05', '2032-03-10').filter((e) => e.id === ev.id);
  assert.deepEqual(occ.map((e) => e.occurrence), ['2032-03-05', '2032-03-08', '2032-03-09', '2032-03-10']);
  const daily = agenda.createEvent({ title: 'Vitaminas', start: '2032-03-01T08:00', repeat: 'daily', duration_min: 5 });
  assert.equal(agenda.listEvents('2032-03-10', '2032-03-12').filter((e) => e.id === daily.id).length, 3);
});

test('eventos de varios días aparecen en el rango aunque empiecen antes', () => {
  const ev = agenda.createEvent({ title: 'Viaje', start: '2033-05-01', end: '2033-05-05', all_day: true });
  assert.equal(ev.end, '2033-05-05T23:59');
  assert.equal(agenda.listEvents('2033-05-03', '2033-05-03').filter((e) => e.id === ev.id).length, 1);
});

test('huecos libres dentro de la jornada', () => {
  agenda.createEvent({ title: 'A', start: '2034-06-12T10:00', end: '2034-06-12T11:00' });
  agenda.createEvent({ title: 'B', start: '2034-06-12T10:30', end: '2034-06-12T12:00' });
  agenda.createEvent({ title: 'C', start: '2034-06-12T15:00', end: '2034-06-12T15:30' });
  const r = agenda.freeSlots('2034-06-12', 60, '09:00', '18:00');
  assert.equal(agenda.freeSlots('2034-06-12', 120, '09:00', '18:00').slots.length, 2, 'con 2 horas no cabe antes de las 10');
  assert.deepEqual(r.slots, [
    { start: '2034-06-12T09:00', end: '2034-06-12T10:00' },
    { start: '2034-06-12T12:00', end: '2034-06-12T15:00' },
    { start: '2034-06-12T15:30', end: '2034-06-12T18:00' },
  ]);
});

test('recordatorios de eventos y tareas', () => {
  agenda.createEvent({ title: 'Llamada', start: '2035-01-10T10:00', reminder_min: 15 });
  projects.createTask({ title: 'Enviar factura', due_date: '2035-01-10', due_time: '12:00' });
  const r = agenda.reminders('2035-01-10T09:00', '2035-01-10T12:30');
  assert.deepEqual(r.map((x) => [x.kind, x.title, x.remind_at]), [
    ['event', 'Llamada', '2035-01-10T09:45'],
    ['task', 'Enviar factura', '2035-01-10T12:00'],
  ]);
});

test('proyectos: avance, búsqueda aproximada y tablero', () => {
  const p = projects.createProject({ name: 'Tienda en línea', due_date: '2099-12-31' });
  const a = projects.createTask({ title: 'Comprar dominio', project_id: p.id });
  const b = projects.createTask({ title: 'Diseñar logo', project_id: p.id, priority: 'urgente' });
  assert.equal(b.priority, 'alta');
  projects.updateTask(a.id, { status: 'terminada' });
  let full = projects.getProject(p.id);
  assert.equal(full.progress, 50);
  assert.equal(full.tasks_total, 2);
  assert.ok(projects.getTask(a.id).completed_at);
  assert.equal(projects.findProject('la tienda').id, p.id);
  assert.equal(projects.findTask('logo').id, b.id);
  projects.reorderTasks([b.id], 'en_progreso');
  assert.equal(projects.getTask(b.id).status, 'en_progreso');
  projects.addNote(p.id, 'El hosting cuesta 200 al mes');
  full = projects.getProject(p.id);
  assert.equal(full.notes.length, 1);
  projects.deleteProject(p.id);
  assert.throws(() => projects.getTask(b.id), /No encontré/);
});
