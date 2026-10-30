/* Núcleo: estado global, API, fechas, formatos, rutas, avisos y recordatorios. */
(function () {
  'use strict';
  const { reactive } = Vue;

  const App = (window.App = { views: {}, components: {} });

  const store = reactive({
    ready: false,
    status: null,
    settings: {},
    route: { path: '/', params: {}, query: {} },
    toasts: [],
    dialog: null,
    tick: 0,
    chatOpen: false,
    chatPrefill: '',
    voiceState: 'idle',
    overdue: 0,
  });
  App.store = store;

  /** Avisa a las pantallas que los datos cambiaron (por el chat o por otra pantalla). */
  App.refresh = () => { store.tick++; };

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  async function request(method, url, body) {
    const init = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch('/api' + url, init);
    } catch (e) {
      throw new Error('No hay conexión con JARVIS. Verifique que el programa esté abierto.');
    }
    const type = res.headers.get('Content-Type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();
    if (res.status === 401 && url !== '/login') {
      store.status = { ...(store.status || {}), auth: { ...(store.status?.auth || {}), authenticated: false } };
      throw new Error((data && data.error) || 'Inicie sesión para continuar.');
    }
    if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
    return data;
  }

  function qs(params) {
    if (!params) return '';
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.append(k, v);
    const s = p.toString();
    return s ? '?' + s : '';
  }

  App.api = {
    get: (url, params) => request('GET', url + qs(params)),
    post: (url, body = {}) => request('POST', url, body),
    put: (url, body = {}) => request('PUT', url, body),
    del: (url, params) => request('DELETE', url + qs(params)),
  };

  // ---------------------------------------------------------------------------
  // Fechas (hora local "de pared", igual que el servidor: AAAA-MM-DD y AAAA-MM-DDTHH:MM)
  // ---------------------------------------------------------------------------
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const pad = (n) => String(n).padStart(2, '0');
  const toUTC = (s) => {
    const [d, t = '00:00'] = String(s).split('T');
    const [y, m, day] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, day, h || 0, mi || 0));
  };
  const fmtDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

  const D = (App.dates = {
    DIAS, MESES, pad,
    nowWall(d = new Date()) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    today: () => D.nowWall().slice(0, 10),
    addDays(date, n) {
      const d = toUTC(String(date).slice(0, 10));
      d.setUTCDate(d.getUTCDate() + n);
      return fmtDate(d);
    },
    addMinutes(wall, n) {
      const d = new Date(toUTC(wall).getTime() + n * 60000);
      return `${fmtDate(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    },
    diffMinutes: (a, b) => Math.round((toUTC(b) - toUTC(a)) / 60000),
    daysBetween: (a, b) => Math.round((toUTC(String(b).slice(0, 10)) - toUTC(String(a).slice(0, 10))) / 86400000),
    weekday: (date) => toUTC(String(date).slice(0, 10)).getUTCDay(),
    /** Lunes de la semana de una fecha. */
    monday(date) {
      const wd = D.weekday(date);
      return D.addDays(date, wd === 0 ? -6 : 1 - wd);
    },
    /** 42 días (6 semanas, de lunes a domingo) que muestran un mes. */
    monthGrid(year, month0) {
      const first = `${year}-${pad(month0 + 1)}-01`;
      const start = D.monday(first);
      return Array.from({ length: 42 }, (_, i) => D.addDays(start, i));
    },
  });

  App.fmt = {
    cap: (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : ''),
    time(s) {
      if (!s) return '';
      const t = String(s).length > 5 ? String(s).slice(11, 16) : String(s);
      const [h, m] = t.split(':').map(Number);
      return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'a. m.' : 'p. m.'}`;
    },
    /** "viernes 30 de octubre" (con año si no es el actual). */
    longDate(s) {
      const d = toUTC(String(s).slice(0, 10));
      const y = d.getUTCFullYear() !== new Date().getFullYear() ? ` de ${d.getUTCFullYear()}` : '';
      return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${y}`;
    },
    shortDate(s) {
      const d = toUTC(String(s).slice(0, 10));
      return `${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`;
    },
    /** "hoy", "mañana", "ayer", "el lunes 2 de noviembre". */
    human(s) {
      const diff = D.daysBetween(D.today(), s);
      if (diff === 0) return 'hoy';
      if (diff === 1) return 'mañana';
      if (diff === -1) return 'ayer';
      if (diff > 1 && diff < 7) return DIAS[D.weekday(s)];
      return App.fmt.longDate(s);
    },
    monthTitle: (year, month0) => `${MESES[month0].charAt(0).toUpperCase()}${MESES[month0].slice(1)} ${year}`,
    /** Texto y estilo de la fecha límite de una tarea. */
    due(t) {
      if (!t.due_date) return null;
      const diff = D.daysBetween(D.today(), t.due_date);
      const time = t.due_time ? ` ${App.fmt.time(t.due_time)}` : '';
      const done = t.status === 'hecha';
      if (!done && (diff < 0 || (diff === 0 && t.due_time && t.due_time < D.nowWall().slice(11)))) return { text: `Venció ${App.fmt.human(t.due_date)}${time}`, cls: 'danger' };
      if (diff === 0) return { text: `Hoy${time}`, cls: done ? '' : 'warn' };
      if (diff === 1) return { text: `Mañana${time}`, cls: done ? '' : 'cyan' };
      return { text: `${App.fmt.shortDate(t.due_date)}${time}`, cls: '' };
    },
    dateTime(s) {
      if (!s) return '';
      return `${App.fmt.shortDate(s)} ${String(s).slice(11, 16)}`;
    },
    /** Texto del chat: escapa HTML y convierte **negritas**, viñetas y saltos de línea. */
    rich(text) {
      const esc = String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const lines = esc.split('\n');
      let html = '';
      let inList = false;
      for (const line of lines) {
        const li = line.match(/^\s*(?:[•\-*]|\d+[.)])\s+(.*)$/);
        if (li) {
          if (!inList) { html += '<ul>'; inList = true; }
          html += `<li>${li[1]}</li>`;
          continue;
        }
        if (inList) { html += '</ul>'; inList = false; }
        html += line ? `${line}<br>` : '<br>';
      }
      if (inList) html += '</ul>';
      return html.replace(/(<br>)+$/, '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    },
  };

  App.CATEGORIES = [
    { id: 'general', label: 'General', color: '#22d3ee' },
    { id: 'trabajo', label: 'Trabajo', color: '#38bdf8' },
    { id: 'personal', label: 'Personal', color: '#a78bfa' },
    { id: 'salud', label: 'Salud', color: '#34d399' },
    { id: 'familia', label: 'Familia', color: '#f472b6' },
    { id: 'estudio', label: 'Estudio', color: '#fbbf24' },
    { id: 'finanzas', label: 'Finanzas', color: '#4ade80' },
    { id: 'viaje', label: 'Viaje', color: '#fb923c' },
  ];
  App.categoryColor = (ev) => ev.project_color || (App.CATEGORIES.find((c) => c.id === ev.category) || App.CATEGORIES[0]).color;
  App.STATUS_NAMES = { pendiente: 'Pendiente', en_progreso: 'En progreso', hecha: 'Hecha', activo: 'Activo', en_pausa: 'En pausa', completado: 'Completado', cancelado: 'Cancelado' };
  App.REPEAT_NAMES = { none: 'No se repite', daily: 'Todos los días', weekdays: 'De lunes a viernes', weekly: 'Cada semana', monthly: 'Cada mes', yearly: 'Cada año' };

  // ---------------------------------------------------------------------------
  // Rutas (#/agenda, #/proyectos/3…)
  // ---------------------------------------------------------------------------
  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    store.route = { path, query: Object.fromEntries(new URLSearchParams(query)), params: {} };
  }
  App.go = (path) => {
    if (location.hash !== '#' + path) location.hash = path;
    else parseHash();
  };
  window.addEventListener('hashchange', parseHash);
  parseHash();

  // ---------------------------------------------------------------------------
  // Avisos y diálogos
  // ---------------------------------------------------------------------------
  let toastId = 0;
  App.toast = (text, opts = {}) => {
    const t = { id: ++toastId, text, title: opts.title || '', type: opts.type || 'info', icon: opts.icon || (opts.type === 'error' ? 'triangle-alert' : 'check') };
    store.toasts.push(t);
    if (!opts.sticky) setTimeout(() => App.closeToast(t.id), opts.ms || (opts.type === 'error' ? 6000 : 3200));
    return t.id;
  };
  App.closeToast = (id) => {
    const i = store.toasts.findIndex((t) => t.id === id);
    if (i >= 0) store.toasts.splice(i, 1);
  };
  App.error = (e) => App.toast(e && e.message ? e.message : String(e), { type: 'error' });

  /** Diálogo con opciones. Devuelve el valor elegido o null. */
  App.choose = ({ title, message = '', options, icon = 'info' }) =>
    new Promise((resolve) => {
      store.dialog = {
        title, message, icon, options,
        resolve: (v) => {
          store.dialog = null;
          resolve(v);
        },
      };
    });
  App.confirm = async ({ title, message = '', confirmText = 'Aceptar', danger = false, icon }) =>
    (await App.choose({
      title, message, icon: icon || (danger ? 'triangle-alert' : 'info'),
      options: [{ label: 'Cancelar', value: false }, { label: confirmText, value: true, kind: danger ? 'danger' : 'primary' }],
    })) === true;

  /** Abre el chat flotante con un mensaje ya escrito (por ejemplo, "planea este proyecto"). */
  App.askJarvis = (text = '') => {
    store.chatPrefill = text;
    store.chatOpen = true;
  };

  // ---------------------------------------------------------------------------
  // Recordatorios: consulta los avisos próximos y los muestra a su hora (aviso, notificación y voz)
  // ---------------------------------------------------------------------------
  const FIRED_KEY = 'jarvis.fired';
  function loadFired() {
    try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}'); } catch { return {}; }
  }
  function saveFired(f) {
    try { localStorage.setItem(FIRED_KEY, JSON.stringify(f)); } catch { /* sin almacenamiento */ }
  }
  let upcoming = [];
  let lastFetch = 0;

  function reminderText(r) {
    const who = (store.settings.user_title || '').trim();
    const lead = who ? `${who.charAt(0).toUpperCase()}${who.slice(1)}, ` : '';
    if (r.kind === 'task') return `${lead}vence la tarea «${r.title}».`;
    const mins = r.minutes_before;
    const when = mins === 0 ? 'ahora' : mins < 60 ? `en ${mins} minutos` : mins % 60 === 0 && mins < 1440 ? `en ${mins / 60} hora${mins === 60 ? '' : 's'}` : `a las ${App.fmt.time(r.start)} (${App.fmt.human(r.start)})`;
    return `${lead}${when}: ${r.title}${r.location ? `, en ${r.location}` : ''}.`;
  }

  function fire(r) {
    const text = reminderText(r);
    App.toast(text, { title: r.kind === 'task' ? 'Tarea' : 'Recordatorio', type: 'reminder', icon: 'bell-ring', sticky: true });
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('JARVIS · ' + (r.kind === 'task' ? 'Tarea' : 'Recordatorio'), { body: text, tag: r.key });
      }
    } catch { /* algunos navegadores solo permiten notificaciones desde un service worker */ }
    if (App.voice && store.settings.voice_enabled === '1') App.voice.say(text);
  }

  async function checkReminders() {
    if (!store.status || !store.status.auth || !store.status.auth.authenticated) return;
    const now = D.nowWall();
    if (Date.now() - lastFetch > 4 * 60000) {
      try {
        upcoming = await App.api.get('/reminders', { from: D.addMinutes(now, -10), to: D.addMinutes(now, 30) });
        lastFetch = Date.now();
      } catch { return; }
    }
    const fired = loadFired();
    const min = D.addMinutes(now, -10);
    for (const r of upcoming) {
      if (r.remind_at <= now && r.remind_at >= min && !fired[r.key]) {
        fired[r.key] = now;
        fire(r);
      }
    }
    const old = D.addMinutes(now, -3 * 1440);
    for (const k of Object.keys(fired)) if (fired[k] < old) delete fired[k];
    saveFired(fired);
  }
  let remindersOn = false;
  App.startReminders = () => {
    if (remindersOn) return;
    remindersOn = true;
    checkReminders();
    setInterval(checkReminders, 20000);
  };
  // Al cambiar los datos se vuelven a pedir los avisos.
  Vue.watch(() => store.tick, () => { lastFetch = 0; });

  App.loadStatus = async () => {
    store.status = await App.api.get('/status');
    if (store.status.auth.authenticated) store.settings = await App.api.get('/settings');
    return store.status;
  };
})();
