/* Núcleo de la aplicación: API, estado global, formatos, rutas y diálogos. */
(function () {
  'use strict';
  const { reactive } = Vue;

  const App = (window.App = { views: {}, components: {} });

  // ---------------------------------------------------------------------------
  // Estado global
  // ---------------------------------------------------------------------------
  const store = reactive({
    ready: false,
    user: null,
    settings: {},
    categories: [],
    brands: [],
    cash: null,
    cashLoaded: false,
    toasts: [],
    dialog: null,
    route: { path: '/', params: {}, query: {}, nav: 0 },
  });
  App.store = store;

  App.can = (perm) => !!store.user && store.user.permissions.includes(perm);

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  async function request(method, url, body, opts = {}) {
    const init = { method, headers: {}, credentials: 'same-origin' };
    if (body instanceof Blob || body instanceof ArrayBuffer) {
      init.headers['Content-Type'] = 'application/octet-stream';
      init.body = body;
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch('/api' + url, init);
    } catch (e) {
      throw new Error('No hay conexión con el servidor. Verifica que el sistema esté encendido.');
    }
    if (res.status === 401 && !opts.allow401) {
      store.user = null;
      if (store.route.path !== '/login') App.go('/login');
      throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    }
    const type = res.headers.get('Content-Type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();
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
    post: (url, body = {}, opts) => request('POST', url, body, opts),
    put: (url, body = {}) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
    qs,
  };

  // ---------------------------------------------------------------------------
  // Formatos
  // ---------------------------------------------------------------------------
  const nf = {};
  function numberFormat(decimals) {
    const locale = store.settings.locale || 'es-MX';
    const key = locale + decimals;
    if (!nf[key]) nf[key] = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return nf[key];
  }

  App.fmt = {
    money(n) {
      const v = Number(n) || 0;
      const sym = store.settings.currency_symbol ?? '$';
      return (v < 0 ? '-' : '') + sym + numberFormat(2).format(Math.abs(v));
    },
    num(n, d = 0) {
      return numberFormat(d).format(Number(n) || 0);
    },
    pct(n, d = 1) {
      return numberFormat(d).format(Number(n) || 0) + '%';
    },
    date(s) {
      if (!s) return '';
      const [y, m, d] = String(s).slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    },
    datetime(s) {
      if (!s) return '';
      return `${App.fmt.date(s)} ${String(s).slice(11, 16)}`;
    },
    time(s) {
      return s ? String(s).slice(11, 16) : '';
    },
    relative(s) {
      if (!s) return '';
      const d = new Date(String(s).replace(' ', 'T'));
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return 'hace un momento';
      if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
      if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
      const days = Math.floor(diff / 86400);
      if (days === 1) return 'ayer';
      if (days < 30) return `hace ${days} días`;
      return App.fmt.date(s);
    },
    longDate(s) {
      const d = s ? new Date(String(s).slice(0, 10) + 'T12:00:00') : new Date();
      const t = d.toLocaleDateString(store.settings.locale || 'es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return t.charAt(0).toUpperCase() + t.slice(1);
    },
    method(m) {
      return { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' }[m] || m;
    },
    variant(v) {
      return [v.size, v.color].filter(Boolean).join(' / ');
    },
    initials(name) {
      return String(name || '?').split(/\s+/).filter((w) => w.length > 2 || /^[A-Z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    },
  };

  App.round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  /** Fecha local en formato YYYY-MM-DD. */
  App.today = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  /** Fecha y hora local en formato YYYY-MM-DD HH:MM:SS. */
  App.nowLocal = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${App.today()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  /** Rangos de fecha predefinidos para filtros y reportes. */
  App.ranges = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    const iso = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const prevMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0);
    return [
      { key: 'today', label: 'Hoy', from: App.today(), to: App.today() },
      { key: 'yesterday', label: 'Ayer', from: App.today(-1), to: App.today(-1) },
      { key: 'week', label: 'Esta semana', from: iso(monday), to: App.today() },
      { key: '7d', label: 'Últimos 7 días', from: App.today(-6), to: App.today() },
      { key: 'month', label: 'Este mes', from: iso(monthStart), to: App.today() },
      { key: 'prev_month', label: 'Mes anterior', from: iso(prevMonthStart), to: iso(prevMonthEnd) },
      { key: '30d', label: 'Últimos 30 días', from: App.today(-29), to: App.today() },
      { key: 'year', label: 'Este año', from: `${d.getFullYear()}-01-01`, to: App.today() },
    ];
  };

  // ---------------------------------------------------------------------------
  // Notificaciones y diálogos
  // ---------------------------------------------------------------------------
  let toastId = 0;
  App.toast = (message, type = 'success', ms = 3200) => {
    const id = ++toastId;
    store.toasts.push({ id, message, type });
    setTimeout(() => App.dismissToast(id), ms);
  };
  App.dismissToast = (id) => {
    const i = store.toasts.findIndex((t) => t.id === id);
    if (i >= 0) store.toasts.splice(i, 1);
  };
  App.error = (err) => App.toast(err && err.message ? err.message : String(err), 'error', 5000);

  /** Diálogo de confirmación. Devuelve una promesa con true/false. */
  App.confirm = (opts) => new Promise((resolve) => {
    store.dialog = {
      kind: 'confirm',
      title: opts.title || '¿Estás seguro?',
      message: opts.message || '',
      confirmText: opts.confirmText || 'Aceptar',
      cancelText: opts.cancelText || 'Cancelar',
      danger: !!opts.danger,
      icon: opts.icon || (opts.danger ? 'triangle-alert' : 'circle-alert'),
      resolve,
    };
  });

  /** Diálogo para capturar un valor. Devuelve el texto o null si se cancela. */
  App.prompt = (opts) => new Promise((resolve) => {
    store.dialog = {
      kind: 'prompt',
      title: opts.title || '',
      message: opts.message || '',
      label: opts.label || '',
      value: opts.value ?? '',
      type: opts.type || 'text',
      placeholder: opts.placeholder || '',
      required: opts.required !== false,
      confirmText: opts.confirmText || 'Aceptar',
      danger: !!opts.danger,
      options: opts.options || null,
      resolve,
    };
  });

  App.closeDialog = (value) => {
    const d = store.dialog;
    store.dialog = null;
    if (d) d.resolve(value);
  };

  // ---------------------------------------------------------------------------
  // Rutas (hash)
  // ---------------------------------------------------------------------------
  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query] = raw.split('?');
    const q = {};
    new URLSearchParams(query || '').forEach((v, k) => { q[k] = v; });
    return { path: path || '/', query: q };
  }

  App.routes = [];
  App.route = (pattern, view, meta = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    App.routes.push({ pattern, re, keys, view, meta });
  };

  App.resolveRoute = () => {
    const { path, query } = parseHash();
    for (const r of App.routes) {
      const m = r.re.exec(path);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { path, query, params, view: r.view, meta: r.meta };
      }
    }
    return { path, query, params: {}, view: 'NotFound', meta: {} };
  };

  App.go = (path) => {
    if (location.hash === '#' + path) {
      Object.assign(store.route, App.resolveRoute(), { nav: store.route.nav + 1 });
    } else {
      location.hash = path;
    }
  };

  App.setQuery = (query) => {
    const { path } = parseHash();
    const s = qs(query);
    history.replaceState(null, '', '#' + path + s);
    store.route.query = { ...query };
  };

  // Cada navegación real incrementa `nav` para volver a montar la vista (setQuery no lo hace).
  window.addEventListener('hashchange', () => {
    Object.assign(store.route, App.resolveRoute(), { nav: store.route.nav + 1 });
  });

  // ---------------------------------------------------------------------------
  // Datos compartidos
  // ---------------------------------------------------------------------------
  App.loadCatalogs = async () => {
    const [cats, brands] = await Promise.all([App.api.get('/categories'), App.api.get('/brands')]);
    store.categories = cats;
    store.brands = brands;
  };

  App.refreshCash = async () => {
    if (!App.can('pos') && !App.can('cash')) return null;
    try {
      store.cash = await App.api.get('/cash/current');
    } catch (e) {
      store.cash = null;
    }
    store.cashLoaded = true;
    return store.cash;
  };

  App.productImage = (p) => (p && p.has_image ? `/api/products/${p.id || p.product_id}/image?v=${encodeURIComponent(p.updated_at || '')}` : null);

  const PALETTE = ['#0284c7', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#2563eb', '#4f46e5', '#16a34a', '#c026d3', '#0891b2'];
  App.colorFor = (key) => {
    const cat = store.categories.find((c) => c.id === key);
    if (cat) return cat.color;
    let h = 0;
    for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };

  /** Descarga un archivo de texto (CSV) generado en el navegador. */
  App.downloadCsv = (filename, headers, rows) => {
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /** Reduce una imagen a máx. `size` px y la devuelve como dataURL JPEG. */
  App.resizeImage = (file, size = 600) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  /** Debounce simple. */
  App.debounce = (fn, ms = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };
})();
