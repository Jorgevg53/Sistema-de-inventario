'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);
const notFound = (msg = 'No encontrado') => new HttpError(404, msg);

/** Redondea a 2 decimales evitando errores de punto flotante. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function num(v, def = 0) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function int(v, def = 0) {
  return Math.trunc(num(v, def));
}

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

function folio(prefix, id) {
  return `${prefix}-${String(id).padStart(6, '0')}`;
}

/** Fecha/hora local en formato SQLite (YYYY-MM-DD HH:MM:SS). */
function nowLocal(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function dateOnly(d = new Date()) {
  return nowLocal(d).slice(0, 10);
}

/** Normaliza un rango de fechas (YYYY-MM-DD) recibido en query string. */
function dateRange(query) {
  const today = dateOnly();
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = isDate(query.from) ? query.from : today;
  const to = isDate(query.to) ? query.to : from > today ? from : today;
  return { from, to, fromTs: `${from} 00:00:00`, toTs: `${to} 23:59:59` };
}

/** Construye cláusula LIKE para búsqueda por palabras sobre varias columnas. */
function wordsFilter(q, columns) {
  const words = String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const clauses = [];
  const params = [];
  for (const w of words) {
    clauses.push('(' + columns.map((c) => `${c} LIKE ?`).join(' OR ') + ')');
    for (let i = 0; i < columns.length; i++) params.push(`%${w}%`);
  }
  return { sql: clauses.join(' AND '), params };
}

module.exports = { HttpError, bad, notFound, round2, num, int, str, bool, folio, nowLocal, dateOnly, dateRange, wordsFilter };
