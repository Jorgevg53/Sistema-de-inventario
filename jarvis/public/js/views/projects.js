/* Proyectos: lista con avance y detalle con tablero (Kanban), bitácora y eventos. */
(function () {
  'use strict';
  const { ref, computed, watch, onMounted } = Vue;

  App.views.Projects = {
    setup() {
      const store = App.store;
      const tab = ref('activo');
      const list = ref([]);
      const loading = ref(true);
      const creating = ref(false);

      async function load() {
        try { list.value = await App.api.get('/projects', { status: tab.value === 'todos' ? null : tab.value }); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      onMounted(load);
      watch(tab, load);
      watch(() => store.tick, load);
      const tabs = [
        { id: 'activo', label: 'Activos' }, { id: 'en_pausa', label: 'En pausa' }, { id: 'completado', label: 'Completados' }, { id: 'todos', label: 'Todos' },
      ];
      const dueText = (p) => (p.days_left === null ? '' : p.days_left < 0 ? `Venció hace ${-p.days_left} d` : p.days_left === 0 ? 'Vence hoy' : `Faltan ${p.days_left} d`);
      const dueCls = (p) => (p.days_left === null || p.status !== 'activo' ? '' : p.days_left < 0 ? 'danger' : p.days_left <= 7 ? 'warn' : '');
      const opened = (p) => App.go(`/proyectos/${p.id}`);
      return { store, tab, tabs, list, loading, creating, dueText, dueCls, opened, names: App.STATUS_NAMES, fmt: App.fmt };
    },
    template: `
      <div>
        <div class="page-head">
          <div><h1>Proyectos</h1><div class="sub">Sus metas, divididas en tareas</div></div>
          <div class="ml-auto flex flex-wrap">
            <div class="tabs"><button v-for="t in tabs" :key="t.id" class="tab" :class="{ active: tab === t.id }" @click="tab = t.id">{{ t.label }}</button></div>
            <button class="btn btn-primary" @click="creating = true"><icon name="folder-plus" /> Proyecto</button>
          </div>
        </div>
        <loading v-if="loading" />
        <div v-else-if="!list.length" class="panel empty" style="padding:40px 16px">
          <icon name="folder-kanban" :size="40" class="cyan" />
          <p class="mt-8">No hay proyectos {{ tab === 'todos' ? '' : 'en esta lista' }}.</p>
          <p class="small mt-4">Cree uno con el botón «Proyecto» o pídaselo a JARVIS: «crea el proyecto Mudanza para el 15 de diciembre».</p>
        </div>
        <div v-else class="proj-grid">
          <a v-for="p in list" :key="p.id" class="panel proj-card" :href="'#/proyectos/' + p.id" :style="{ '--c': p.color }">
            <div class="flex">
              <h2 class="grow truncate">{{ p.name }}</h2>
              <ring :value="p.progress" :size="46" :color="p.color" />
            </div>
            <div class="desc" v-if="p.description">{{ p.description }}</div>
            <div class="bar"><span :style="{ width: p.progress + '%', background: p.color }"></span></div>
            <div class="flex flex-wrap small">
              <span class="chip" :class="{ cyan: p.status === 'activo', violet: p.status === 'en_pausa', ok: p.status === 'completado' }">{{ names[p.status] }}</span>
              <span class="chip"><icon name="list-checks" :size="12" /> {{ p.tasks_done }}/{{ p.tasks_total }}</span>
              <span v-if="p.tasks_doing" class="chip violet">{{ p.tasks_doing }} en progreso</span>
              <span v-if="p.tasks_overdue" class="chip danger">{{ p.tasks_overdue }} vencidas</span>
              <span v-if="p.due_date" class="chip" :class="dueCls(p)"><icon name="flag" :size="12" /> {{ fmt.shortDate(p.due_date) }} · {{ dueText(p) }}</span>
              <span v-if="p.priority === 'alta'" class="chip danger">Prioridad alta</span>
            </div>
          </a>
        </div>
        <project-editor v-if="creating" @close="creating = false" @saved="opened" />
      </div>`,
  };

  App.views.ProjectDetail = {
    props: { id: [String, Number] },
    setup(props) {
      const store = App.store;
      const p = ref(null);
      const loading = ref(true);
      const editing = ref(false);
      const editingTask = ref(null); // { task, status }
      const quick = ref('');
      const note = ref('');
      const dragId = ref(null);
      const dropCol = ref(null);

      async function load() {
        try { p.value = await App.api.get(`/projects/${props.id}`); } catch (e) { App.error(e); p.value = null; } finally { loading.value = false; }
      }
      onMounted(load);
      watch(() => [props.id, store.tick], load);

      const cols = [
        { id: 'pendiente', label: 'Pendiente', icon: 'circle' },
        { id: 'en_progreso', label: 'En progreso', icon: 'activity' },
        { id: 'hecha', label: 'Hecha', icon: 'circle-check' },
      ];
      const tasksBy = computed(() => {
        const out = { pendiente: [], en_progreso: [], hecha: [] };
        for (const t of (p.value && p.value.tasks) || []) out[t.status].push(t);
        return out;
      });

      async function addTask() {
        const text = quick.value.trim();
        if (!text) return;
        try {
          await App.api.post('/tasks/quick', { text, project_id: p.value.id });
          quick.value = '';
          App.refresh();
        } catch (e) { App.error(e); }
      }
      async function addNote() {
        if (!note.value.trim()) return;
        try {
          await App.api.post(`/projects/${p.value.id}/notes`, { text: note.value });
          note.value = '';
          App.refresh();
        } catch (e) { App.error(e); }
      }
      async function delNote(n) {
        if (!(await App.confirm({ title: 'Eliminar nota', message: '¿Eliminar esta nota de la bitácora?', confirmText: 'Eliminar', danger: true }))) return;
        try { await App.api.del(`/notes/${n.id}`); App.refresh(); } catch (e) { App.error(e); }
      }

      // Arrastrar y soltar entre columnas
      function dragStart(t, e) {
        dragId.value = t.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(t.id));
      }
      function dragEnd() { dragId.value = null; dropCol.value = null; }
      async function drop(col, beforeId = null) {
        const id = dragId.value;
        dragEnd();
        if (!id) return;
        const ids = tasksBy.value[col].map((t) => t.id).filter((x) => x !== id);
        const at = beforeId ? ids.indexOf(beforeId) : -1;
        if (at >= 0) ids.splice(at, 0, id); else ids.push(id);
        const t = p.value.tasks.find((x) => x.id === id);
        if (t) t.status = col; // movimiento inmediato en pantalla
        try {
          await App.api.post('/tasks/reorder', { ids, status: col });
          App.refresh();
        } catch (e) { App.error(e); load(); }
      }
      async function setStatus(status) {
        try { await App.api.put(`/projects/${p.value.id}`, { status }); App.refresh(); } catch (e) { App.error(e); }
      }
      function plan() {
        const due = p.value.due_date ? ` antes del ${App.fmt.longDate(p.value.due_date)}` : '';
        const has = p.value.tasks_total ? ' Revisa las tareas que ya tiene y agrega solo lo que falte.' : '';
        App.askJarvis(`Ayúdame a planear el proyecto «${p.value.name}» (id ${p.value.id}): propón las tareas necesarias con fechas realistas${due} y créalas.${has}`);
      }
      function status() {
        App.askJarvis(`¿Cómo va el proyecto «${p.value.name}» y cuál es el siguiente paso recomendado?`);
      }
      const due = (t) => App.fmt.due(t);
      return {
        store, p, loading, editing, editingTask, quick, note, cols, tasksBy, dragId, dropCol,
        addTask, addNote, delNote, dragStart, dragEnd, drop, setStatus, plan, status, due, fmt: App.fmt, names: App.STATUS_NAMES,
        back: () => App.go('/proyectos'),
      };
    },
    template: `
      <loading v-if="loading" />
      <div v-else-if="!p" class="panel empty">No se encontró el proyecto. <a href="#/proyectos">Volver</a></div>
      <div v-else>
        <div class="page-head">
          <a href="#/proyectos" class="icon-btn" aria-label="Volver"><icon name="arrow-left" /></a>
          <ring :value="p.progress" :size="56" :color="p.color" />
          <div class="grow" style="min-width:200px">
            <h1>{{ p.name }}</h1>
            <div class="flex flex-wrap mt-4">
              <select class="select" style="width:auto;min-height:30px;padding:3px 8px;font-size:.84rem" :value="p.status" @change="setStatus($event.target.value)">
                <option value="activo">Activo</option><option value="en_pausa">En pausa</option><option value="completado">Completado</option><option value="cancelado">Cancelado</option>
              </select>
              <span class="chip"><icon name="list-checks" :size="12" /> {{ p.tasks_done }}/{{ p.tasks_total }} tareas</span>
              <span v-if="p.due_date" class="chip" :class="{ danger: p.days_left < 0, warn: p.days_left >= 0 && p.days_left <= 7 }">
                <icon name="flag" :size="12" /> {{ fmt.longDate(p.due_date) }} · {{ p.days_left < 0 ? 'vencido' : p.days_left === 0 ? 'hoy' : 'faltan ' + p.days_left + ' días' }}
              </span>
              <span v-if="p.tasks_overdue" class="chip danger">{{ p.tasks_overdue }} vencidas</span>
              <span class="chip" :class="{ danger: p.priority === 'alta' }">Prioridad {{ p.priority }}</span>
            </div>
          </div>
          <div class="flex flex-wrap">
            <button class="btn" @click="status"><icon name="activity" /> <span class="hide-sm">¿Cómo va?</span></button>
            <button v-if="store.settings.ai_enabled" class="btn btn-primary" @click="plan"><icon name="sparkles" /> Planear con JARVIS</button>
            <button class="btn" @click="editing = true"><icon name="pencil" /> <span class="hide-sm">Editar</span></button>
          </div>
        </div>
        <p v-if="p.description" class="muted mb-16" style="white-space:pre-wrap;max-width:900px">{{ p.description }}</p>

        <div class="detail-grid">
          <div class="board">
            <div v-for="c in cols" :key="c.id" class="panel board-col" :class="{ drop: dropCol === c.id }"
              @dragover.prevent="dropCol = c.id" @dragleave.self="dropCol = null" @drop.prevent="drop(c.id)">
              <div class="panel-head">
                <icon :name="c.icon" :class="{ cyan: c.id === 'pendiente', violet: c.id === 'en_progreso', ok: c.id === 'hecha' }" />
                <span class="upper">{{ c.label }}</span>
                <span class="mono small dim ml-auto">{{ tasksBy[c.id].length }}</span>
                <button class="icon-btn sm" @click="editingTask = { task: null, status: c.id }" title="Nueva tarea"><icon name="plus" :size="16" /></button>
              </div>
              <div class="board-list">
                <form v-if="c.id === 'pendiente'" @submit.prevent="addTask"><input class="input" v-model="quick" placeholder="Nueva tarea… (ej. llamar al proveedor el lunes)" /></form>
                <div v-for="t in tasksBy[c.id]" :key="t.id" class="tcard" :class="{ dragging: dragId === t.id, done: t.status === 'hecha' }"
                  draggable="true" @dragstart="dragStart(t, $event)" @dragend="dragEnd" @drop.prevent.stop="drop(c.id, t.id)" @click="editingTask = { task: t }">
                  <div class="flex" style="align-items:flex-start">
                    <span class="dot mt-4" :class="'prio-' + t.priority" :title="'Prioridad ' + t.priority"></span>
                    <div class="t-title grow">{{ t.title }}</div>
                  </div>
                  <div class="flex flex-wrap mt-4" v-if="due(t) || t.notes">
                    <span v-if="due(t)" class="chip" :class="due(t).cls"><icon name="clock" :size="11" /> {{ due(t).text }}</span>
                    <span v-if="t.notes" class="chip" title="Tiene notas"><icon name="sticky-note" :size="11" /></span>
                  </div>
                </div>
                <div v-if="!tasksBy[c.id].length" class="tiny dim center" style="padding:12px">{{ c.id === 'hecha' ? 'Aún nada terminado' : 'Arrastre tareas aquí' }}</div>
              </div>
            </div>
          </div>

          <div class="col gap-16">
            <div class="panel">
              <div class="panel-head"><icon name="notebook-pen" class="cyan" /><span class="upper">Bitácora</span></div>
              <div class="panel-body col gap-12">
                <form @submit.prevent="addNote" class="col gap-4">
                  <textarea class="textarea" v-model="note" placeholder="Ideas, acuerdos, avances…" style="min-height:64px"></textarea>
                  <button class="btn btn-sm" style="align-self:flex-end" :disabled="!note.trim()"><icon name="plus" :size="14" /> Agregar nota</button>
                </form>
                <div v-if="!p.notes.length" class="tiny dim center">Sin notas todavía.</div>
                <div v-for="n in p.notes" :key="n.id" class="note">
                  <div class="flex"><span class="when grow">{{ fmt.dateTime(n.created_at.replace(' ', 'T')) }}</span><button class="icon-btn sm" @click="delNote(n)" aria-label="Eliminar nota"><icon name="trash-2" :size="14" /></button></div>
                  <p>{{ n.text }}</p>
                </div>
              </div>
            </div>
            <div class="panel" v-if="p.events.length">
              <div class="panel-head"><icon name="calendar-days" class="cyan" /><span class="upper">Eventos del proyecto</span></div>
              <div class="panel-body tight">
                <a v-for="e in p.events" :key="e.id" class="tl-item" :href="'#/agenda?date=' + e.start.slice(0, 10)">
                  <div class="tl-time">{{ fmt.shortDate(e.start) }}</div>
                  <div class="grow"><div class="tl-title">{{ e.title }}</div><div class="tl-meta" v-if="!e.all_day">{{ fmt.time(e.start) }}</div></div>
                </a>
              </div>
            </div>
          </div>
        </div>

        <project-editor v-if="editing" :project="p" @close="editing = false" @deleted="back" />
        <task-editor v-if="editingTask" :task="editingTask.task" :project-id="p.id" :status="editingTask.status" @close="editingTask = null" />
      </div>`,
  };
})();
