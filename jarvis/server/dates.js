'use strict';
/**
 * Fechas en hora local "de pared" ('YYYY-MM-DD' y 'YYYY-MM-DDTHH:MM') y un intérprete de fechas en español:
 * "mañana a las 5", "el viernes 31 de octubre", "cada lunes", "en 2 horas", "de 3 a 5 pm", "30 minutos antes"…
 * Las cuentas se hacen en UTC sobre la hora de pared para que el horario de verano no mueva nada.
 */
const { fold } = require('./util');

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function toUTC(s) {
  const [d, t = '00:00'] = String(s).split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, day, h || 0, mi || 0));
}

const fmtDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fmtWall = (d) => `${fmtDate(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmtDate(toUTC(s)) === s;
}

function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function isWall(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && isDate(s.slice(0, 10)) && isTime(s.slice(11));
}

/** Acepta 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM', 'YYYY-MM-DDTHH:MM:SS' (la zona horaria, si viene, se ignora). */
function normWall(s, defTime = '00:00') {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (!m || !isDate(m[1])) return null;
  const time = m[2] !== undefined ? `${pad(m[2])}:${m[3]}` : defTime;
  return isTime(time) ? `${m[1]}T${time}` : null;
}

function normDate(s) {
  if (typeof s !== 'string') return null;
  const d = s.trim().slice(0, 10);
  return isDate(d) ? d : null;
}

function normTime(s) {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const t = `${pad(m[1])}:${m[2]}`;
  return isTime(t) ? t : null;
}

function addDays(date, n) {
  const d = toUTC(String(date).slice(0, 10));
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}

const addMinutes = (wall, n) => fmtWall(new Date(toUTC(wall).getTime() + n * 60000));
const diffMinutes = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 60000);
const daysBetween = (a, b) => Math.round((toUTC(String(b).slice(0, 10)) - toUTC(String(a).slice(0, 10))) / 86400000);
const weekday = (date) => toUTC(String(date).slice(0, 10)).getUTCDay();
const daysInMonth = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Suma meses; si el día no existe en el mes destino (31 de febrero) usa el último día del mes. */
function addMonths(date, n, day = null) {
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  const idx = m - 1 + n;
  const ny = y + Math.floor(idx / 12);
  const nm = ((idx % 12) + 12) % 12;
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(day ?? d, daysInMonth(ny, nm)))}`;
}

function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function nextWeekday(from, idx, allowSame) {
  for (let i = allowSame ? 0 : 1; i <= 7; i++) {
    const cand = addDays(from, i);
    if (weekday(cand) === idx) return cand;
  }
  return from;
}

function nowWall(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const today = (d = new Date()) => nowWall(d).slice(0, 10);

function longDate(date) {
  const d = toUTC(String(date).slice(0, 10));
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** 'hoy', 'mañana', 'el viernes 31 de octubre'… */
function humanDate(date, ref = today()) {
  const diff = daysBetween(ref, date);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === 2) return 'pasado mañana';
  if (diff === -1) return 'ayer';
  const d = toUTC(String(date).slice(0, 10));
  const base = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === toUTC(ref).getUTCFullYear() ? `el ${base}` : `el ${base} de ${d.getUTCFullYear()}`;
}

function humanTime(t) {
  const [h, m] = String(t).split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

// ---------------------------------------------------------------------------
// Intérprete de lenguaje natural
// ---------------------------------------------------------------------------
const NUM_WORDS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, 'cuarenta y cinco': 45, media: 0.5,
};
const NUM = '(\\d+(?:[.,]\\d+)?|cuarenta y cinco|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|media)';
const DUR = `${NUM}\\s+(minutos?|mins?|horas?|hrs?|h|dias?|semanas?)(\\s+y\\s+media)?`;
const DAY = '(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)';
const MONTH = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';
const TIME = '(\\d{1,2})(?:[:.](\\d{2}))?';
const MER = '(am|pm|a\\.\\s?m\\.?|p\\.\\s?m\\.?|de la manana|de la tarde|de la noche|de la madrugada|del mediodia|hrs|horas)';
const PART_TIMES = { manana: '09:00', tarde: '16:00', noche: '20:00', madrugada: '06:00', temprano: '08:00' };

const toNum = (s) => (/^\d/.test(s) ? Number(s.replace(',', '.')) : NUM_WORDS[s.replace(/\s+/g, ' ')] ?? null);
const dayIndex = (name) => ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(name.replace(/^(sabado|domingo)s$/, '$1'));
const monthIndex = (name) => (name === 'setiembre' ? 8 : MESES.findIndex((m) => fold(m) === name));

function unitMinutes(unit) {
  if (/^m/.test(unit)) return 1;
  if (/^h/.test(unit)) return 60;
  if (/^d/.test(unit)) return 1440;
  return 10080; // semanas
}

function durMinutes(n, unit, half) {
  const q = toNum(n);
  if (q === null) return null;
  return Math.round(q * unitMinutes(unit) + (half ? unitMinutes(unit) / 2 : 0));
}

/** Aplica a.m./p.m. ("de la tarde"…). Sin indicación, de 1 a 6 se entiende de la tarde ("a las 5" = 17:00). */
function withMeridiem(h, mer) {
  if (h > 23) return null;
  if (!mer) return { h: h >= 1 && h <= 6 ? h + 12 : h, explicit: h >= 13 || h === 0 };
  const m = mer.replace(/[\s.]/g, '');
  if (h > 12 && m !== 'hrs' && m !== 'horas') return null;
  if (m === 'am' || m === 'delamanana' || m === 'delamadrugada') return { h: h === 12 ? 0 : h, explicit: true };
  if (m === 'pm' || m === 'delatarde' || m === 'delanoche') return { h: h < 12 ? h + 12 : h, explicit: true };
  if (m === 'delmediodia') return { h: h <= 4 ? h + 12 : h, explicit: true };
  return { h, explicit: true }; // "17 hrs"
}

/**
 * Interpreta fechas, horas, duraciones, repeticiones y avisos dentro de un texto en español.
 * Devuelve lo encontrado y el resto del texto (sirve como título del evento o tarea).
 * opts.defaultDate: día que se usa si el texto no menciona ninguno (p. ej. el día elegido en la agenda).
 */
function parseSpanish(text, ref = new Date(), opts = {}) {
  const original = String(text ?? '').normalize('NFC');
  let work = fold(original); // misma longitud que el original: las posiciones coinciden
  const spans = [];
  const now = nowWall(ref);
  const tdy = now.slice(0, 10);
  const r = {
    date: null, time: null, end_time: null, duration: null, repeat: null, reminder: null,
    part: null, rawHour: null, rawMin: 0, explicitMer: false, relMinutes: null, weekdayRepeat: null, monthDay: null,
  };

  const take = (re, fn) => {
    work = work.replace(re, (...args) => {
      const match = args[0];
      const offset = args[args.length - 2];
      if (fn(args.slice(1, -2).map((g) => (g === undefined ? undefined : g.trim())), match) === false) return match;
      spans.push([offset, offset + match.length]);
      return ' '.repeat(match.length);
    });
  };
  const setDate = (d) => {
    if (!d) return false;
    if (!r.date) r.date = d;
  };
  const setTime = (h, m, mer) => {
    const res = withMeridiem(h, mer);
    if (!res || m > 59) return false;
    if (r.time) return;
    r.rawHour = h;
    r.rawMin = m;
    r.explicitMer = res.explicit;
    r.time = `${pad(res.h)}:${pad(m)}`;
  };

  // Repeticiones
  take(/\b(?:todos\s+los\s+dias|cada\s+dia|diariamente|a\s+diario|diario)\b/g, () => { r.repeat = 'daily'; });
  take(/\b(?:entre\s+semana|de\s+lunes\s+a\s+viernes|(?:todos\s+los\s+)?dias\s+(?:habiles|laborables))\b/g, () => { r.repeat = 'weekdays'; });
  const weekly = ([d]) => {
    r.repeat = 'weekly';
    r.weekdayRepeat = dayIndex(d);
  };
  take(new RegExp(`\\b(?:todos\\s+los|cada)\\s+${DAY}\\b`, 'g'), weekly);
  take(/\blos\s+(lunes|martes|miercoles|jueves|viernes|sabados|domingos)\b/g, weekly);
  take(/\b(?:cada|todos\s+los)\s+(?:dia\s+)?(\d{1,2})\s+de\s+(?:cada\s+)?mes\b/g, ([n]) => {
    if (+n < 1 || +n > 31) return false;
    r.repeat = 'monthly';
    r.monthDay = +n;
  });
  take(/\b(?:cada\s+semana|todas\s+las\s+semanas|semanalmente|semanal)\b/g, () => { r.repeat = 'weekly'; });
  take(/\b(?:cada\s+mes|todos\s+los\s+meses|mensualmente|mensual)\b/g, () => { r.repeat = 'monthly'; });
  take(/\b(?:cada\s+ano|todos\s+los\s+anos|anualmente|anual)\b/g, () => { r.repeat = 'yearly'; });

  // Aviso previo: "30 minutos antes", "con aviso de una hora antes"
  take(new RegExp(`\\b(?:(?:con\\s+)?(?:un\\s+)?(?:aviso|recordatorio|alerta)\\s+(?:de\\s+)?)?${DUR}\\s+antes\\b`, 'g'), ([n, unit, half]) => {
    const mins = durMinutes(n, unit, half);
    if (mins === null) return false;
    r.reminder = mins;
  });

  // Relativos: "en 2 horas", "dentro de 3 días", "en un mes"
  take(new RegExp(`\\b(?:en|dentro\\s+de)\\s+(?:unos?\\s+|unas\\s+)?${DUR}\\b`, 'g'), ([n, unit, half]) => {
    const mins = durMinutes(n, unit, half);
    if (mins === null) return false;
    if (unitMinutes(unit) < 1440) r.relMinutes = mins;
    else setDate(addDays(tdy, Math.round(mins / 1440)));
  });
  take(new RegExp(`\\b(?:en|dentro\\s+de)\\s+${NUM}\\s+mes(?:es)?\\b`, 'g'), ([n]) => setDate(addMonths(tdy, Math.round(toNum(n) || 1))));

  // Rango de horas: "de 3 a 5 pm", "de 10:00 a 11:30", "desde las 9 hasta las 2"
  take(new RegExp(`\\b(?:de|desde)\\s+(?:las?\\s+)?${TIME}(?:\\s*${MER})?\\s+(?:a|hasta)\\s+(?:las?\\s+)?${TIME}(?:\\s*${MER})?(?![\\w:])`, 'g'),
    ([h1, m1, mer1, h2, m2, mer2]) => {
      const e = withMeridiem(+h2, mer2);
      let s = withMeridiem(+h1, mer1 || mer2);
      if (!e || !s) return false;
      if (!mer1 && mer2 && s.h > e.h) s = withMeridiem(+h1, 'am') || s; // "de 11 a 1 pm"
      if (!mer1 && !mer2 && e.h <= s.h && e.h + 12 < 24) e.h += 12;
      const sm = +(m1 || 0);
      const em = +(m2 || 0);
      if (sm > 59 || em > 59 || e.h * 60 + em <= s.h * 60 + sm) return false;
      r.rawHour = +h1;
      r.explicitMer = true;
      r.time = `${pad(s.h)}:${pad(sm)}`;
      r.end_time = `${pad(e.h)}:${pad(em)}`;
    });

  // Duración: "por 2 horas", "durante media hora", "de 1 hora y media"
  take(new RegExp(`\\b(?:por|durante|de)\\s+(?:unos?\\s+|unas\\s+)?${DUR}\\b`, 'g'), ([n, unit, half]) => {
    const mins = durMinutes(n, unit, half);
    if (mins === null || unitMinutes(unit) >= 1440) return false;
    r.duration = mins;
  });

  // Horas: "a las 5", "a la 1 y media", "a las 5 menos cuarto", "a las 10 de la mañana", "17:30", "9 pm", "mediodía"
  const minutesFrom = (y, menos) => {
    let add = 0;
    if (y) add += y === 'media' ? 30 : y === 'cuarto' ? 15 : +y;
    if (menos) add -= menos === 'cuarto' ? 15 : toNum(menos) ?? +menos;
    return add;
  };
  take(new RegExp(`\\b(?:a|para|desde|como\\s+a)\\s+las?\\s+${TIME}(?:\\s+y\\s+(media|cuarto|\\d{1,2}))?(?:\\s+menos\\s+(cuarto|diez|cinco|veinte|\\d{1,2}))?(?:\\s*${MER})?(?![\\w:])`, 'g'),
    ([h, m, y, menos, mer]) => {
      let hh = +h;
      let mm = +(m || 0) + minutesFrom(y, menos);
      if (mm < 0) { hh -= 1; mm += 60; }
      if (hh < 0 || mm > 59) return false;
      return setTime(hh, mm, mer);
    });
  take(new RegExp(`\\b(\\d{1,2}):(\\d{2})(?:\\s*${MER})?(?![\\w:])`, 'g'), ([h, m, mer]) => setTime(+h, +m, mer));
  take(/\b(\d{1,2})\s*(am|pm|a\.\s?m\.?|p\.\s?m\.?)(?!\w)/g, ([h, mer]) => setTime(+h, 0, mer));
  take(/\b(?:al\s+|a\s+|en\s+el\s+)?mediodia\b/g, () => setTime(12, 0, 'hrs'));
  take(/\b(?:a\s+la\s+)?medianoche\b/g, () => setTime(23, 59, 'hrs'));

  // Momento del día: "en la tarde", "por la mañana", "temprano"
  take(/\b(?:en|por|de|durante)\s+la\s+(manana|tarde|noche|madrugada)\b/g, ([p]) => { r.part = r.part || p; });
  take(/\btemprano\b/g, () => { r.part = r.part || 'temprano'; });

  // Fechas
  take(/\bpasado\s+manana\b/g, () => setDate(addDays(tdy, 2)));
  take(/\besta\s+(manana|tarde|noche)\b/g, ([p]) => { setDate(tdy); r.part = r.part || p; });
  take(/\b(?:el\s+dia\s+de\s+)?hoy\b/g, () => setDate(tdy));
  take(/(?<!\bla\s)\bmanana\b/g, () => setDate(addDays(tdy, 1)));
  take(/\bayer\b/g, () => setDate(addDays(tdy, -1)));
  take(/\b(?:la\s+)?(?:proxima|siguiente)\s+semana\b|\bla\s+semana\s+que\s+viene\b/g, () => setDate(nextWeekday(tdy, 1, false)));
  take(/\b(?:este\s+|el\s+)?fin\s+de\s+semana\b/g, () => setDate(weekday(tdy) === 0 ? tdy : nextWeekday(tdy, 6, true)));
  take(/\b(?:a\s+|para\s+)?(?:el\s+)?fin(?:al)?\s+del?\s+mes\b/g, () => {
    const [y, m] = tdy.split('-').map(Number);
    setDate(`${y}-${pad(m)}-${pad(daysInMonth(y, m - 1))}`);
  });
  take(/\b(?:el\s+)?(?:proximo|siguiente)\s+mes\b|\bel\s+mes\s+que\s+viene\b/g, () => setDate(addMonths(tdy.slice(0, 8) + '01', 1)));

  const fromParts = (y, m0, d, yearGiven) => {
    if (m0 < 0 || m0 > 11 || d < 1 || d > daysInMonth(y, m0)) return null;
    let s = `${y}-${pad(m0 + 1)}-${pad(d)}`;
    if (!yearGiven && s < tdy) s = fromParts(y + 1, m0, d, true);
    return s;
  };
  const year0 = Number(tdy.slice(0, 4));
  take(new RegExp(`\\b(?:el\\s+)?(?:${DAY}\\s+)?(\\d{1,2})\\s+de\\s+${MONTH}(?:\\s+(?:de|del)\\s+(\\d{4}))?\\b`, 'g'), ([, d, mon, y]) =>
    setDate(fromParts(y ? +y : year0, monthIndex(mon), +d, !!y)));
  take(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?\\b`, 'g'), ([mon, d, y]) =>
    setDate(fromParts(y ? +y : year0, monthIndex(mon), +d, !!y)));
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/g, ([y, m, d]) => setDate(fromParts(+y, +m - 1, +d, true)));
  take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g, ([d, m, y]) =>
    setDate(fromParts(y ? (y.length === 2 ? 2000 + +y : +y) : year0, +m - 1, +d, !!y)));
  take(new RegExp(`\\b(?:el\\s+)?(?:(este|proximo|siguiente)\\s+)?${DAY}(?:\\s+(que\\s+viene|proximo|siguiente))?\\b`, 'g'), ([mod, d, mod2]) => {
    const idx = dayIndex(d);
    if (idx < 0) return false;
    setDate(nextWeekday(tdy, idx, mod === 'este' && !mod2));
  });
  take(/\b(?:el\s+)?dia\s+(\d{1,2})\b|\bel\s+(\d{1,2})(?!\s*(?:de\b|:|am|pm|hrs|horas|personas|\d))\b/g, ([a, b]) => {
    const day = +(a || b);
    let [y, m] = tdy.split('-').map(Number);
    m -= 1;
    if (day < 1 || day > 31) return false;
    for (let i = 0; i < 13; i++) {
      const s = fromParts(y, m, day, true);
      if (s && s >= tdy) return setDate(s);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return false;
  });

  // Resultado
  if (r.relMinutes !== null) {
    const w = addMinutes(now, r.relMinutes);
    if (!r.date) r.date = w.slice(0, 10);
    if (!r.time) r.time = w.slice(11);
    r.explicitMer = true;
  }
  if (r.time && r.part && !r.explicitMer && r.rawHour !== null) {
    const fixed = withMeridiem(r.rawHour, r.part === 'temprano' ? 'am' : `de la ${r.part}`);
    if (fixed) r.time = `${pad(fixed.h)}:${pad(r.rawMin)}`;
    r.explicitMer = true;
  }
  if (!r.time && r.part) r.time = PART_TIMES[r.part];
  if (!r.date && r.weekdayRepeat !== null) r.date = nextWeekday(tdy, r.weekdayRepeat, true);
  if (!r.date && r.monthDay) {
    let cand = addMonths(tdy, 0, r.monthDay);
    if (cand < tdy) cand = addMonths(tdy, 1, r.monthDay);
    r.date = cand;
  }
  if (!r.date && r.repeat === 'weekdays') r.date = [0, 6].includes(weekday(tdy)) ? nextWeekday(tdy, 1, false) : tdy;
  const dateGiven = !!r.date;
  if (!r.date && opts.defaultDate && isDate(opts.defaultDate)) r.date = opts.defaultDate;
  if (!r.date && (r.time || r.repeat)) r.date = tdy;
  if (r.date && r.time && !dateGiven && !opts.defaultDate && `${r.date}T${r.time}` < now && r.repeat === null) {
    const [h, m] = r.time.split(':').map(Number);
    if (!r.explicitMer && h < 12 && `${tdy}T${pad(h + 12)}:${pad(m)}` > now) r.time = `${pad(h + 12)}:${pad(m)}`;
    else r.date = addDays(tdy, 1);
  }
  if (r.time && !r.end_time && r.duration) r.end_time = addMinutes(`${r.date}T${r.time}`, r.duration).slice(11);

  const chars = original.split('');
  for (const [a, b] of spans) for (let i = a; i < b; i++) chars[i] = ' ';
  return {
    date: r.date,
    time: r.time,
    end_time: r.end_time,
    duration: r.duration,
    repeat: r.repeat,
    reminder: r.reminder,
    found: spans.length > 0,
    date_given: dateGiven,
    rest: cleanText(chars.join('')),
  };
}

const LEAD = /^(?:y|e|el|la|los|las|de|del|para|a|al|en|con|que|por|sobre|desde|hasta)\s+/i;
const TRAIL = /\s+(?:y|e|el|la|los|las|de|del|para|a|al|en|con|que|por|desde|hasta)$/i;

/** Quita espacios, signos y palabras de enlace sueltas al inicio y al final. */
function cleanText(s) {
  let t = String(s).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  let prev;
  do {
    prev = t;
    t = t.replace(/^[\s,.;:¡!¿?\-–—"']+|[\s,.;:¡!¿?\-–—"']+$/g, '').replace(LEAD, '').replace(TRAIL, '');
  } while (t !== prev);
  return t;
}

module.exports = {
  DIAS, MESES, pad, toUTC, fmtDate, fmtWall, isDate, isTime, isWall, normWall, normDate, normTime,
  addDays, addMinutes, diffMinutes, daysBetween, weekday, daysInMonth, addMonths, monthsBetween, nextWeekday,
  nowWall, today, longDate, humanDate, humanTime, parseSpanish, cleanText,
};
