'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);
const notFound = (msg = 'No encontrado.') => new HttpError(404, msg);

function str(v, max = 2000) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s.slice(0, max);
}

function int(v, def = null) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

function oneOf(v, allowed, def) {
  if (v === null || v === undefined || v === '') return def;
  const s = String(v).trim().toLowerCase();
  if (!allowed.includes(s)) throw bad(`Valor no válido: "${v}". Opciones: ${allowed.join(', ')}.`);
  return s;
}

/** Minúsculas y sin acentos, conservando la longitud (las posiciones coinciden con el texto original en NFC). */
function fold(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const STOP = new Set('el la los las un una unos unas de del al a en con por para y o que mi mis su sus tu tus lo le se es'.split(' '));

function words(s) {
  return fold(s).split(/[^a-z0-9ñ]+/).filter((w) => w && !STOP.has(w));
}

/** Parecido entre una búsqueda y un texto (0 a 1). */
function similarity(query, text) {
  const q = fold(query).trim();
  const t = fold(text).trim();
  if (!q || !t) return 0;
  if (q === t) return 1;
  const qw = words(q);
  const tw = words(t);
  if (!qw.length || !tw.length) return t.includes(q) ? 0.6 : 0;
  let hits = 0;
  for (const w of qw) if (tw.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x))))) hits++;
  const score = hits / qw.length;
  const bonus = t.includes(q) ? 0.2 : 0;
  return Math.min(0.99, score * 0.8 + bonus);
}

/** El elemento que mejor coincide con la búsqueda (o null si ninguno se parece lo suficiente). */
function bestMatch(query, items, getText, min = 0.5) {
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const s = similarity(query, getText(item));
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return bestScore >= min ? best : null;
}

module.exports = { HttpError, bad, notFound, str, int, bool, oneOf, fold, words, similarity, bestMatch };
