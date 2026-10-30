/* Aplicación: inicio de sesión, estructura (menú), rutas, chat flotante, avisos y diálogos. */
(function () {
  'use strict';
  const { createApp, ref, computed, onMounted, watch } = Vue;
  const store = App.store;

  const NAV = [
    { to: '/', icon: 'house', label: 'Inicio' },
    { to: '/agenda', icon: 'calendar-days', label: 'Agenda' },
    { to: '/proyectos', icon: 'folder-kanban', label: 'Proyectos' },
    { to: '/tareas', icon: 'list-checks', label: 'Tareas' },
    { to: '/ajustes', icon: 'settings', label: 'Ajustes' },
  ];

  const Login = {
    setup() {
      const password = ref('');
      const busy = ref(false);
      const error = ref('');
      const st = computed(() => store.status);
      async function submit() {
        busy.value = true;
        error.value = '';
        try {
          await App.api.post('/login', { password: password.value });
          await App.loadStatus();
          App.startReminders();
        } catch (e) { error.value = e.message; } finally { busy.value = false; }
      }
      return { password, busy, error, st, submit };
    },
    template: `
      <div class="login">
        <div class="panel">
          <reactor :size="120" />
          <div><div class="brand-name" style="font-size:1.3rem">J.A.R.V.I.S.</div><div class="brand-sub mt-4">Asistente personal</div></div>
          <form v-if="st.auth.password_set" class="col gap-12" style="width:100%" @submit.prevent="submit">
            <input class="input" type="password" v-model="password" placeholder="Contraseña" autofocus autocomplete="current-password" />
            <button class="btn btn-primary" :disabled="!password || busy"><icon name="lock" /> Entrar</button>
            <div v-if="error" class="small danger">{{ error }}</div>
          </form>
          <p v-else class="small muted">
            Por seguridad, JARVIS solo se puede usar desde el equipo donde está instalado hasta que defina una contraseña.
            Ábralo en ese equipo (<span class="mono">http://localhost:3100</span>) y vaya a <b>Ajustes → Seguridad y acceso</b>.
          </p>
        </div>
      </div>`,
  };

  const Root = {
    setup() {
      const loadError = ref('');
      onMounted(async () => {
        try {
          await App.loadStatus();
          if (store.status.auth.authenticated) App.startReminders();
        } catch (e) { loadError.value = e.message; } finally { store.ready = true; }
      });
      // Si la sesión vence mientras se usa, se vuelve a la pantalla de entrada.
      const authed = computed(() => !!(store.status && store.status.auth && store.status.auth.authenticated));

      const view = computed(() => {
        const p = store.route.path;
        if (p === '/' || p === '') return { c: App.views.Home };
        if (p === '/agenda') return { c: App.views.Agenda };
        if (p === '/proyectos') return { c: App.views.Projects };
        const m = p.match(/^\/proyectos\/(\d+)$/);
        if (m) return { c: App.views.ProjectDetail, props: { id: m[1] }, key: 'p' + m[1] };
        if (p === '/tareas') return { c: App.views.Tasks };
        if (p === '/ajustes') return { c: App.views.Settings };
        return { c: App.views.Home };
      });
      const active = (to) => (to === '/' ? store.route.path === '/' || store.route.path === '' : store.route.path.startsWith(to));
      const onHome = computed(() => store.route.path === '/' || store.route.path === '');
      watch(() => store.route.path, () => { store.chatOpen = false; window.scrollTo(0, 0); });

      // Atajo: Ctrl + Espacio para hablar con JARVIS.
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.code === 'Space') {
          e.preventDefault();
          if (!onHome.value) store.chatOpen = true;
          App.chat.listen();
        }
      });

      function fab() {
        store.chatOpen = !store.chatOpen;
      }
      async function overdueCount() {
        if (!authed.value) return;
        try { store.overdue = (await App.api.get('/tasks', { when: 'overdue' })).length; } catch { /* sin conteo */ }
      }
      watch(() => [store.tick, authed.value], overdueCount, { immediate: true });

      return { store, view, nav: NAV, active, onHome, authed, fab, loadError };
    },
    template: `
      <div v-if="!store.ready" class="loading" style="min-height:100vh"><div class="spinner"></div></div>
      <div v-else-if="loadError" class="login"><div class="panel"><icon name="wifi-off" :size="36" class="danger" /><p>{{ loadError }}</p><button class="btn" onclick="location.reload()">Reintentar</button></div></div>
      <login-view v-else-if="!authed" />
      <div v-else class="shell">
        <aside class="side">
          <div class="brand">
            <reactor :size="40" />
            <div><div class="brand-name">{{ (store.settings.assistant_name || 'JARVIS').toUpperCase() }}</div><div class="brand-sub">Asistente personal</div></div>
          </div>
          <a v-for="n in nav" :key="n.to" :href="'#' + n.to" class="nav-link" :class="{ active: active(n.to) }">
            <icon :name="n.icon" /> {{ n.label }}
            <span v-if="n.to === '/tareas' && store.overdue" class="nav-badge" title="Tareas vencidas">{{ store.overdue }}</span>
          </a>
          <div class="side-foot">
            <div class="flex"><span class="dot" :style="{ background: store.settings.ai_enabled ? 'var(--ok)' : 'var(--warn)', boxShadow: '0 0 8px currentColor' }"></span>{{ store.settings.ai_enabled ? 'Claude en línea' : 'Modo básico' }}</div>
            <div class="mt-4"><span class="kbd">Ctrl</span> + <span class="kbd">Espacio</span> para hablar</div>
          </div>
        </aside>
        <main class="main">
          <component :is="view.c" v-bind="view.props || {}" :key="view.key || store.route.path" />
        </main>
        <nav class="bottom-nav">
          <a v-for="n in nav" :key="n.to" :href="'#' + n.to" :class="{ active: active(n.to) }"><icon :name="n.icon" :size="20" />{{ n.label }}</a>
        </nav>
        <template v-if="!onHome">
          <chat-panel v-if="store.chatOpen" @close="store.chatOpen = false" />
          <reactor v-else class="fab" :size="64" @activate="fab" title="Hablar con JARVIS" />
        </template>
      </div>

      <div class="toasts">
        <div v-for="t in store.toasts" :key="t.id" class="toast panel" :class="t.type">
          <icon :name="t.icon" :class="t.type === 'error' ? 'danger' : t.type === 'reminder' ? 'warn' : 'ok'" />
          <div class="grow"><b v-if="t.title" class="small">{{ t.title }}</b><div class="small">{{ t.text }}</div></div>
          <button class="icon-btn sm" @click="$root.closeToast(t.id)" aria-label="Cerrar"><icon name="x" :size="14" /></button>
        </div>
      </div>

      <div v-if="store.dialog" class="modal-back" @mousedown.self="store.dialog.resolve(null)">
        <div class="modal panel" style="width:min(440px,100%)">
          <div class="panel-head"><icon :name="store.dialog.icon" class="cyan" /><h2>{{ store.dialog.title }}</h2></div>
          <div class="panel-body" style="white-space:pre-wrap">{{ store.dialog.message }}</div>
          <div class="modal-foot">
            <button v-for="o in store.dialog.options" :key="String(o.value)" class="btn" :class="o.kind === 'danger' ? 'btn-danger' : o.kind === 'primary' ? 'btn-primary' : 'btn-ghost'"
              @click="store.dialog.resolve(o.value)">{{ o.label }}</button>
          </div>
        </div>
      </div>`,
    methods: { closeToast: (id) => App.closeToast(id) },
  };

  const app = createApp(Root);
  const C = App.components;
  app.component('icon', C.Icon);
  app.component('modal', C.Modal);
  app.component('reactor', C.Reactor);
  app.component('ring', C.Ring);
  app.component('loading', C.Loading);
  app.component('event-editor', C.EventEditor);
  app.component('task-editor', C.TaskEditor);
  app.component('project-editor', C.ProjectEditor);
  app.component('task-row', C.TaskRow);
  app.component('chat-panel', C.ChatPanel);
  app.component('login-view', Login);
  app.mount('#app');
})();
