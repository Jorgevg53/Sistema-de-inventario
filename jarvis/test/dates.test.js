'use strict';
/* Pruebas del intérprete de fechas en español: node --test test/ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../server/dates');

// Viernes 30 de octubre de 2026, 6:40 p. m.
const REF = new Date(2026, 9, 30, 18, 40);
const parse = (s, opts) => D.parseSpanish(s, REF, opts);

test('utilidades de fechas', () => {
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addMinutes('2026-10-30T23:30', 45), '2026-10-31T00:15');
  assert.equal(D.diffMinutes('2026-10-30T09:00', '2026-10-30T10:30'), 90);
  assert.equal(D.weekday('2026-10-30'), 5);
  assert.equal(D.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(D.addMonths('2026-12-15', 2), '2027-02-15');
  assert.equal(D.normWall('2026-10-30 9:05'), '2026-10-30T09:05');
  assert.equal(D.normWall('2026-10-30T17:00:00-06:00'), '2026-10-30T17:00');
  assert.equal(D.normWall('2026-02-30'), null);
  assert.equal(D.humanTime('17:05'), '5:05 p. m.');
  assert.equal(D.humanTime('00:30'), '12:30 a. m.');
  assert.equal(D.humanDate('2026-10-31', '2026-10-30'), 'mañana');
  assert.equal(D.humanDate('2026-11-06', '2026-10-30'), 'el viernes 6 de noviembre');
});

test('día y hora', () => {
  let r = parse('Agenda dentista mañana a las 5');
  assert.deepEqual([r.date, r.time, r.rest], ['2026-10-31', '17:00', 'Agenda dentista']);
  r = parse('clase hoy a las 10 de la mañana');
  assert.deepEqual([r.date, r.time], ['2026-10-30', '10:00']);
  r = parse('reunión con Pedro el viernes de 3 a 5 pm');
  assert.deepEqual([r.date, r.time, r.end_time, r.rest], ['2026-11-06', '15:00', '17:00', 'reunión con Pedro']);
  r = parse('videollamada el 5 a las 4 menos cuarto');
  assert.deepEqual([r.date, r.time], ['2026-11-05', '15:45']);
  r = parse('presentación el 2026-11-20 17:30 por 2 horas');
  assert.deepEqual([r.date, r.time, r.end_time], ['2026-11-20', '17:30', '19:30']);
  r = parse('cita con el doctor el 3/11 a las 10 de la mañana con aviso de 1 hora antes');
  assert.deepEqual([r.date, r.time, r.reminder, r.rest], ['2026-11-03', '10:00', 60, 'cita con el doctor']);
  r = parse('comida familiar el domingo al mediodía');
  assert.deepEqual([r.date, r.time], ['2026-11-01', '12:00']);
  r = parse('cena esta noche');
  assert.deepEqual([r.date, r.time, r.rest], ['2026-10-30', '20:00', 'cena']);
  r = parse('mañana en la mañana revisar correos');
  assert.deepEqual([r.date, r.time], ['2026-10-31', '09:00']);
});

test('horas sin indicar a. m. o p. m.', () => {
  // A las 6:40 p. m., "a las 9" ya pasó por la mañana: se entiende 9 de la noche.
  assert.equal(parse('llamar a Ana a las 9').time, '21:00');
  // "a las 5" se entiende 5 de la tarde.
  assert.equal(parse('café a las 5').time, '17:00');
  // Si ya pasó también por la tarde, se pasa a mañana.
  const r = parse('meditación a las 6 y media');
  assert.deepEqual([r.date, r.time], ['2026-10-31', '18:30']);
});

test('fechas relativas y con nombre de mes', () => {
  assert.equal(parse('cumpleaños de mamá el 15 de noviembre').date, '2026-11-15');
  assert.equal(parse('aniversario el 2 de enero').date, '2027-01-02');
  assert.equal(parse('vacaciones dentro de 2 semanas').date, '2026-11-13');
  assert.equal(parse('revisar presupuesto el próximo lunes').date, '2026-11-02');
  assert.equal(parse('entregar reporte fin de mes').date, '2026-10-31');
  assert.equal(parse('pasado mañana').date, '2026-11-01');
  const r = parse('llamar al banco en 2 horas');
  assert.deepEqual([r.date, r.time, r.rest], ['2026-10-30', '20:40', 'llamar al banco']);
});

test('repeticiones', () => {
  let r = parse('junta de equipo todos los lunes a las 9:30');
  assert.deepEqual([r.repeat, r.date, r.time, r.rest], ['weekly', '2026-11-02', '09:30', 'junta de equipo']);
  r = parse('pagar la renta cada 1 de mes');
  assert.deepEqual([r.repeat, r.date], ['monthly', '2026-11-01']);
  r = parse('entrenar entre semana a las 7 de la mañana');
  assert.deepEqual([r.repeat, r.time], ['weekdays', '07:00']);
  assert.equal(parse('tomar vitaminas todos los días a las 8').repeat, 'daily');
  assert.equal(parse('gimnasio cada sábado a las 10').repeat, 'weekly');
});

test('día predeterminado (alta rápida desde la agenda)', () => {
  let r = parse('Dentista a las 9', { defaultDate: '2026-11-20' });
  assert.deepEqual([r.date, r.time], ['2026-11-20', '09:00']);
  r = parse('Dentista mañana a las 9', { defaultDate: '2026-11-20' });
  assert.equal(r.date, '2026-10-31');
  r = parse('Cumpleaños de Ana', { defaultDate: '2026-11-20' });
  assert.deepEqual([r.date, r.time, r.found], ['2026-11-20', null, false]);
});

test('texto sin fechas queda intacto', () => {
  const r = parse('Comprar pan y leche');
  assert.equal(r.found, false);
  assert.equal(r.date, null);
  assert.equal(r.rest, 'Comprar pan y leche');
});
