/* Aplicación principal: inicio de sesión, estructura (menú lateral) y montaje de vistas. */
(function () {
  'use strict';
  const { createApp, ref, computed, watch, onMounted, nextTick } = Vue;
  const store = App.store;

  // ---------------------------------------------------------------------------
  // Rutas
  // ---------------------------------------------------------------------------
  App.route('/login', 'Login', { public: true });
  App.route('/', 'Dashboard', { title: 'Inicio', icon: 'layout-dashboard', perm: 'dashboard' });
  App.route('/pos', 'Pos', { title: 'Punto de venta', icon: 'shopping-cart', perm: 'pos', full: true });
  App.route('/ventas', 'Sales', { title: 'Ventas', icon: 'receipt', perm: 'sales.view' });
  App.route('/caja', 'Cash', { title: 'Caja y cortes', icon: 'wallet', perm: 'cash' });
  App.route('/clientes', 'Customers', { title: 'Clientes', icon: 'users', perm: 'customers' });
  App.route('/productos', 'Products', { title: 'Productos', icon: 'package', perm: 'products.view' });
  App.route('/productos/nuevo', 'ProductForm', { title: 'Nuevo producto', icon: 'package-plus', perm: 'products.edit' });
  App.route('/productos/:id', 'ProductForm', { title: 'Ficha del producto', icon: 'package', perm: 'products.view' });
  App.route('/inventario', 'Inventory', { title: 'Inventario', icon: 'boxes', perm: 'inventory' });
  App.route('/compras', 'Purchases', { title: 'Compras y entradas', icon: 'truck', perm: 'purchases' });
  App.route('/compras/nueva', 'PurchaseForm', { title: 'Nueva entrada de mercancía', icon: 'package-plus', perm: 'purchases' });
  App.route('/proveedores', 'Suppliers', { title: 'Proveedores', icon: 'contact', perm: 'suppliers' });
  App.route('/etiquetas', 'Labels', { title: 'Etiquetas de código de barras', icon: 'tag', perm: 'products.view' });
  App.route('/reportes', 'Reports', { title: 'Reportes', icon: 'chart-column', perm: 'reports' });
  App.route('/configuracion', 'Settings', { title: 'Configuración', icon: 'settings', perm: 'settings' });

  const NAV = [
    { items: [{ to: '/', label: 'Inicio', icon: 'layout-dashboard', perm: 'dashboard' }] },
    { group: 'Ventas', items: [
      { to: '/ventas', label: 'Historial de ventas', icon: 'receipt', perm: 'sales.view' },
      { to: '/caja', label: 'Caja y cortes', icon: 'wallet', perm: 'cash' },
      { to: '/clientes', label: 'Clientes', icon: 'users', perm: 'customers' },
    ] },
    { group: 'Inventario', items: [
      { to: '/productos', label: 'Productos', icon: 'package', perm: 'products.view' },
      { to: '/inventario', label: 'Ajustes y kardex', icon: 'boxes', perm: 'inventory' },
      { to: '/compras', label: 'Compras / entradas', icon: 'truck', perm: 'purchases' },
      { to: '/proveedores', label: 'Proveedores', icon: 'contact', perm: 'suppliers' },
      { to: '/etiquetas', label: 'Etiquetas', icon: 'tag', perm: 'products.view' },
    ] },
    { group: 'Administración', items: [
      { to: '/reportes', label: 'Reportes', icon: 'chart-column', perm: 'reports' },
      { to: '/configuracion', label: 'Configuración', icon: 'settings', perm: 'settings' },
    ] },
  ];

  // ---------------------------------------------------------------------------
  // Inicio de sesión
  // ---------------------------------------------------------------------------
  App.views.Login = {
    setup() {
      const username = ref('');
      const password = ref('');
      const loading = ref(false);
      const error = ref('');
      const show = ref(false);
      async function login() {
        error.value = '';
        loading.value = true;
        try {
          const r = await App.api.post('/auth/login', { username: username.value, password: password.value }, { allow401: true });
          await App.boot(r.user);
          App.go(App.can('pos') && r.user.role === 'cajero' ? '/pos' : '/');
        } catch (e) {
          error.value = e.message;
        } finally {
          loading.value = false;
        }
      }
      return { username, password, loading, error, show, login, store };
    },
    template: `
      <div class="login-page">
        <form class="login-card" @submit.prevent="login">
          <div class="brand-logo"><icon name="waves" :size="30" /></div>
          <h1>{{ store.settings.store_name || 'Punto de Venta' }}</h1>
          <div class="sub">Sistema de ventas e inventario</div>
          <div class="flex-col gap-12">
            <div class="form-group">
              <label>Usuario</label>
              <div class="input-group"><icon name="user" /><input class="input input-lg" v-model="username" autocomplete="username" autofocus placeholder="Tu usuario" /></div>
            </div>
            <div class="form-group">
              <label>Contraseña</label>
              <div class="input-group">
                <icon name="lock-keyhole" />
                <input class="input input-lg" :type="show ? 'text' : 'password'" v-model="password" autocomplete="current-password" placeholder="••••••••" />
                <button type="button" class="btn btn-ghost btn-icon btn-sm addon" @click="show = !show" :title="show ? 'Ocultar' : 'Mostrar'"><icon name="eye" /></button>
              </div>
            </div>
            <div v-if="error" class="alert alert-danger"><icon name="circle-alert" />{{ error }}</div>
            <button class="btn btn-primary btn-lg btn-block" :disabled="loading || !username || !password">
              <div v-if="loading" class="spinner" style="width:18px;height:18px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></div>
              <icon v-else name="log-in" /> Entrar
            </button>
          </div>
        </form>
      </div>`,
  };

  App.views.NotFound = {
    template: `<empty icon="circle-alert" title="Página no encontrada" text="La sección que buscas no existe."><a class="btn btn-primary" href="#/">Ir al inicio</a></empty>`,
  };

  App.views.Forbidden = {
    template: `<empty icon="lock" title="Acceso restringido" text="Tu usuario no tiene permiso para ver esta sección. Pide acceso a un administrador."><a class="btn btn-primary" href="#/">Ir al inicio</a></empty>`,
  };

  // ---------------------------------------------------------------------------
  // Cambio de contraseña
  // ---------------------------------------------------------------------------
  const PasswordModal = {
    emits: ['close'],
    setup(props, { emit }) {
      const form = ref({ current: '', password: '', confirm: '' });
      const saving = ref(false);
      async function save() {
        if (form.value.password !== form.value.confirm) return App.toast('Las contraseñas no coinciden', 'error');
        saving.value = true;
        try {
          await App.api.post('/auth/password', { current: form.value.current, password: form.value.password });
          store.user.must_change_password = 0;
          App.toast('Contraseña actualizada');
          emit('close');
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      return { form, saving, save, emit };
    },
    template: `
      <modal title="Cambiar contraseña" icon="key-round" size="sm" @close="emit('close')">
        <div class="flex-col gap-12">
          <div class="form-group"><label>Contraseña actual</label><input class="input" type="password" v-model="form.current" autofocus /></div>
          <div class="form-group"><label>Nueva contraseña</label><input class="input" type="password" v-model="form.password" /><span class="hint">Mínimo 6 caracteres.</span></div>
          <div class="form-group"><label>Confirmar nueva contraseña</label><input class="input" type="password" v-model="form.confirm" @keydown.enter="save" /></div>
        </div>
        <template #footer>
          <button class="btn" @click="emit('close')">Cancelar</button>
          <button class="btn btn-primary" :disabled="saving || form.password.length < 6" @click="save"><icon name="save" /> Guardar</button>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  // Diálogos globales (confirmar / capturar)
  // ---------------------------------------------------------------------------
  const GlobalDialog = {
    setup() {
      const value = ref('');
      const input = ref(null);
      watch(() => store.dialog, (d) => {
        if (d && d.kind === 'prompt') {
          value.value = d.value;
          nextTick(() => input.value && (input.value.focus(), input.value.select && input.value.select()));
        }
      }, { immediate: true });
      function ok() {
        const d = store.dialog;
        if (d.kind === 'prompt') {
          if (d.required && !String(value.value).trim()) return;
          App.closeDialog(value.value);
        } else App.closeDialog(true);
      }
      function cancel() { App.closeDialog(store.dialog.kind === 'prompt' ? null : false); }
      return { store, value, input, ok, cancel };
    },
    template: `
      <modal v-if="store.dialog" :title="store.dialog.title" :icon="store.dialog.icon || (store.dialog.kind === 'prompt' ? 'square-pen' : 'circle-alert')" size="sm" @close="cancel">
        <p v-if="store.dialog.message" style="white-space: pre-line">{{ store.dialog.message }}</p>
        <div v-if="store.dialog.kind === 'prompt'" class="form-group mt-8">
          <label v-if="store.dialog.label">{{ store.dialog.label }}</label>
          <select v-if="store.dialog.options" ref="input" class="select" v-model="value">
            <option v-for="o in store.dialog.options" :key="o" :value="o">{{ o }}</option>
          </select>
          <textarea v-else-if="store.dialog.type === 'textarea'" ref="input" class="textarea" v-model="value" :placeholder="store.dialog.placeholder"></textarea>
          <input v-else ref="input" class="input" :type="store.dialog.type" v-model="value" :placeholder="store.dialog.placeholder" @keydown.enter="ok" />
        </div>
        <template #footer>
          <button class="btn" @click="cancel">{{ store.dialog.cancelText || 'Cancelar' }}</button>
          <button class="btn" :class="store.dialog.danger ? 'btn-danger' : 'btn-primary'" @click="ok">{{ store.dialog.confirmText }}</button>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  // Raíz
  // ---------------------------------------------------------------------------
  const Root = {
    components: { PasswordModal, GlobalDialog },
    setup() {
      const collapsed = ref(localStorage.getItem('sidebar') === 'collapsed');
      const menuOpen = ref(false);
      const showPassword = ref(false);
      const route = computed(() => store.route);
      const nav = computed(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => App.can(i.perm)) })).filter((g) => g.items.length));
      const viewName = computed(() => {
        const r = store.route;
        if (!store.user) return 'Login';
        if (r.meta && r.meta.perm && !App.can(r.meta.perm)) return 'Forbidden';
        return r.view;
      });
      const view = computed(() => App.views[viewName.value] || App.views.NotFound);
      const viewKey = computed(() => store.route.path + '#' + store.route.nav);
      const isActive = (to) => (to === '/' ? store.route.path === '/' : store.route.path === to || store.route.path.startsWith(to + '/'));
      const autoCollapsed = computed(() => !!(store.route.meta && store.route.meta.full));

      function toggleSidebar() {
        if (window.innerWidth <= 960) { menuOpen.value = !menuOpen.value; return; }
        collapsed.value = !collapsed.value;
        try { localStorage.setItem('sidebar', collapsed.value ? 'collapsed' : 'open'); } catch (e) { /* sin almacenamiento */ }
      }
      watch(() => store.route.path, () => { menuOpen.value = false; });

      async function logout() {
        if (!(await App.confirm({ title: 'Cerrar sesión', message: '¿Deseas salir del sistema?', confirmText: 'Salir', icon: 'log-out' }))) return;
        try { await App.api.post('/auth/logout'); } catch (e) { /* ignorar */ }
        store.user = null;
        store.cash = null;
        App.go('/login');
      }
      return { store, route, nav, view, viewKey, viewName, isActive, collapsed, menuOpen, toggleSidebar, autoCollapsed, logout, showPassword, fmt: App.fmt };
    },
    template: `
      <template v-if="!store.ready"><loading text="Iniciando sistema…" /></template>
      <component v-else-if="!store.user" :is="view" />
      <div v-else class="shell" :class="{ collapsed: collapsed || autoCollapsed, 'menu-open': menuOpen }">
        <div class="menu-backdrop mobile-only" v-if="menuOpen" @click="menuOpen = false"></div>
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-logo"><icon name="waves" :size="22" /></div>
            <div class="hide-collapsed" style="min-width:0">
              <div class="brand-name ellipsis">{{ store.settings.store_name }}</div>
              <div class="brand-sub ellipsis">{{ store.settings.store_slogan || 'Punto de venta' }}</div>
            </div>
          </div>
          <nav>
            <a v-if="store.user.permissions.includes('pos')" href="#/pos" class="nav-link pos-link" :class="{ active: isActive('/pos') }" title="Punto de venta">
              <icon name="shopping-cart" :size="19" /><span class="hide-collapsed">Punto de venta</span>
            </a>
            <template v-for="g in nav" :key="g.group || 'main'">
              <div class="nav-group" v-if="g.group">{{ g.group }}</div>
              <a v-for="i in g.items" :key="i.to" :href="'#' + i.to" class="nav-link" :class="{ active: isActive(i.to) }" :title="i.label">
                <icon :name="i.icon" :size="19" /><span class="hide-collapsed">{{ i.label }}</span>
              </a>
            </template>
          </nav>
          <div class="user-box">
            <div class="avatar" :title="store.user.name">{{ fmt.initials(store.user.name) }}</div>
            <div class="flex-1 hide-collapsed" style="min-width:0">
              <div class="user-name ellipsis">{{ store.user.name }}</div>
              <div class="user-role">{{ store.user.role_name }}</div>
            </div>
            <button class="btn btn-ghost btn-icon btn-sm" title="Cambiar contraseña" @click="showPassword = true"><icon name="key-round" /></button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Cerrar sesión" @click="logout"><icon name="log-out" /></button>
          </div>
        </aside>
        <main class="main">
          <header class="topbar">
            <button class="btn btn-ghost btn-icon" @click="toggleSidebar" title="Menú"><icon name="menu" /></button>
            <div class="page-title" v-if="route.meta && route.meta.title"><icon :name="route.meta.icon" :size="20" />{{ route.meta.title }}</div>
            <div class="ml-auto flex">
              <span class="muted small desktop-only">{{ fmt.longDate() }}</span>
              <a v-if="store.user.permissions.includes('pos') && store.cashLoaded" href="#/caja" class="cash-chip" :class="store.cash ? 'open' : 'closed'"
                :title="store.cash ? 'Tu caja está abierta' : 'Abre la caja para empezar a vender'">
                <span class="dot"></span>{{ store.cash ? 'Caja abierta' : 'Caja cerrada' }}
              </a>
            </div>
          </header>
          <div v-if="store.user.must_change_password && viewName !== 'Pos'" class="alert alert-warning" style="border-radius:0;border-width:0 0 1px">
            <icon name="triangle-alert" />
            <div class="flex-1">Estás usando la contraseña inicial. Por seguridad, cámbiala ahora.</div>
            <button class="btn btn-sm" @click="showPassword = true">Cambiar contraseña</button>
          </div>
          <div class="content" :class="{ 'no-pad': route.meta && route.meta.full }">
            <component :is="view" :key="viewKey" />
          </div>
        </main>
      </div>
      <password-modal v-if="showPassword" @close="showPassword = false" />
      <global-dialog />
      <div class="toasts">
        <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.type" @click="App.dismissToast(t.id)">
          <icon :name="t.type === 'error' ? 'circle-x' : t.type === 'warning' ? 'triangle-alert' : 'circle-check'" />
          <div>{{ t.message }}</div>
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------
  App.boot = async (user) => {
    store.user = user;
    const me = await App.api.get('/auth/me');
    store.user = me.user;
    store.settings = me.settings;
    await App.loadCatalogs();
    App.refreshCash();
  };

  async function init() {
    Object.assign(store.route, App.resolveRoute());
    try {
      const me = await App.api.get('/auth/me', undefined);
      await App.boot(me.user);
      if (store.route.path === '/login') App.go('/');
    } catch (e) {
      store.user = null;
      try { store.settings = await (await fetch('/api/public/settings')).json(); } catch (_) { /* sin conexión */ }
      if (store.route.path !== '/login') App.go('/login');
    }
    store.ready = true;
  }

  const app = createApp(Root);
  app.config.globalProperties.App = App;
  app.config.globalProperties.fmt = App.fmt;
  app.config.errorHandler = (err) => { console.error(err); App.error(err); };
  App.registerComponents(app);
  app.mount('#app');
  init();
})();
