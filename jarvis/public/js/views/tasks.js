/* Tareas: todas las tareas (sueltas y de proyectos) con filtros por fecha y estado. */
(function () {
  'use strict';
  const { ref, computed, watch, onMounted } = Vue;

  const TABS = [
    { id: 'today', label: 'Hoy', icon: 'sunrise', params: { when: 'today' } },
    { id: 'week', label: 'Próximos 7 días', icon: 'calendar-days', params: { when: 'week' } },
    { id: 'overdue', label: 'Vencidas', icon: 'triangle-alert', params: { when: 'overdue' } },
    { id: 'nodate', label: 'Sin fecha', icon: 'list-todo', params: { when: 'nodate' } },
    { id: 'open', label: 'Todas', icon: 'list', params: { status: 'abiertas' } },
    { id: 'done', label: 'Hechas', icon: 'circle-check', params: { status: 'hecha', limit: 100 } },
  ];

  App.views.Tasks = {
    setup() {
      const store = App.store;
      const tab = ref(TABS.some((t) => t.id === store.route.query.tab) ? store.route.query.tab : 'open');
      const list = ref([]);
      const counts = ref({});
      const loading = ref(true);
      const q = ref('');
      const quick = ref('');
      const editing = ref(null); // { task }

      async function load() {
        const t = TABS.find((x) => x.id === tab.value);
        try { list.value = await App.api.get('/tasks', t.params); } catch (e) { App.error(e); } finally { loading.value = false; }
        loadCounts();
      }
      async function loadCounts() {
        const out = {};
        await Promise.all(TABS.filter((t) => t.id !== 'done').map(async (t) => {
          try { out[t.id] = (await App.api.get('/tasks', t.params)).length; } catch { /* sin conteo */ }
        }));
        counts.value = out;
        store.overdue = out.overdue || 0;
      }
      onMounted(load);
      watch(tab, () => { loading.value = true; load(); });
      watch(() => store.tick, load);

      const shown = computed(() => {
        const needle = q.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (!needle) return list.value;
        return list.value.filter((t) => `${t.title} ${t.notes || ''} ${t.project_name || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(needle));
      });

      async function addQuick() {
        const text = quick.value.trim();
        if (!text) return;
        try {
          const t = await App.api.post('/tasks/quick', { text });
          quick.value = '';
          App.toast(`Tarea agregada${t.due_date ? ` para ${App.fmt.human(t.due_date)}` : ''}`);
          App.refresh();
        } catch (e) { App.error(e); }
      }
      return { tab, tabs: TABS, list, counts, loading, q, quick, editing, shown, addQuick };
    },
    template: `
      <div>
        <div class="page-head">
          <div><h1>Tareas</h1><div class="sub">Pendientes sueltos y de todos sus proyectos</div></div>
          <button class="btn btn-primary ml-auto" @click="editing = { task: null }"><icon name="plus" /> Tarea</button>
        </div>
        <div class="tabs mb-16">
          <button v-for="t in tabs" :key="t.id" class="tab" :class="{ active: tab === t.id }" @click="tab = t.id">
            <icon :name="t.icon" :size="14" /> {{ t.label }} <span v-if="counts[t.id] !== undefined" class="count" :class="{ danger: t.id === 'overdue' && counts[t.id] }">{{ counts[t.id] }}</span>
          </button>
        </div>
        <div class="panel">
          <div class="panel-body">
            <div class="flex flex-wrap mb-12">
              <form class="grow flex" style="min-width:240px" @submit.prevent="addQuick">
                <input class="input" v-model="quick" placeholder="Agregar rápido: «Pagar la luz el viernes», «Llamar a Ana mañana a las 10»" />
                <button class="btn" aria-label="Agregar"><icon name="plus" /></button>
              </form>
              <div class="flex" style="min-width:200px"><icon name="search" class="dim" /><input class="input" v-model="q" placeholder="Buscar…" /></div>
            </div>
            <loading v-if="loading" />
            <div v-else-if="!shown.length" class="empty">{{ q ? 'Ninguna tarea coincide con la búsqueda.' : tab === 'overdue' ? 'No hay tareas vencidas. ¡Excelente!' : 'No hay tareas en esta lista.' }}</div>
            <task-row v-for="t in shown" :key="t.id" :task="t" @open="editing = { task: t }" />
          </div>
        </div>
        <task-editor v-if="editing" :task="editing.task" @close="editing = null" />
      </div>`,
  };
})();
