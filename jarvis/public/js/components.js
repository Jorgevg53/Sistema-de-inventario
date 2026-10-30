/* Componentes reutilizables: ícono, ventana, reactor, anillo de avance y editores de evento, tarea y proyecto. */
(function () {
  'use strict';
  const { ref, reactive, computed, onMounted, onBeforeUnmount, watch } = Vue;
  const C = App.components;
  const D = App.dates;

  C.Icon = {
    props: { name: String, size: { type: [Number, String], default: 18 } },
    computed: { svg() { return (window.ICONS && window.ICONS[this.name]) || ''; } },
    template: `<svg class="icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="svg"></svg>`,
  };

  C.Modal = {
    props: { title: String, icon: String, wide: Boolean },
    emits: ['close'],
    setup(props, { emit }) {
      const onKey = (e) => { if (e.key === 'Escape') emit('close'); };
      onMounted(() => document.addEventListener('keydown', onKey));
      onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
      return {};
    },
    template: `
      <div class="modal-back" @mousedown.self="$emit('close')">
        <div class="modal panel" :class="{ wide }" role="dialog" aria-modal="true">
          <div class="panel-head">
            <icon v-if="icon" :name="icon" class="cyan" />
            <h2 class="grow">{{ title }}</h2>
            <button class="icon-btn sm" @click="$emit('close')" aria-label="Cerrar"><icon name="x" /></button>
          </div>
          <div class="panel-body"><slot /></div>
          <div class="modal-foot" v-if="$slots.foot"><slot name="foot" /></div>
        </div>
      </div>`,
  };

  C.Reactor = {
    props: { size: { type: Number, default: 150 } },
    emits: ['activate'],
    setup() { return { store: App.store }; },
    template: `
      <button class="reactor" :class="store.voiceState" :style="{ '--size': size + 'px' }" @click="$emit('activate')"
        :aria-label="store.voiceState === 'listening' ? 'Dejar de escuchar' : 'Hablar con JARVIS'">
        <span class="r r1"></span><span class="ticks"></span><span class="r r2"></span><span class="r r3"></span><span class="r r4"></span>
        <span class="core"></span>
        <span class="icon-mic"><icon name="mic" :size="Math.round(size / 6)" /></span>
      </button>`,
  };

  C.Ring = {
    props: { value: { type: Number, default: 0 }, size: { type: Number, default: 48 }, color: { type: String, default: '#22d3ee' } },
    computed: {
      r() { return this.size / 2 - 4; },
      c() { return 2 * Math.PI * this.r; },
    },
    template: `
      <span class="ring" :style="{ width: size + 'px', height: size + 'px' }">
        <svg :width="size" :height="size">
          <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="rgba(56,189,248,.14)" stroke-width="4" />
          <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" :stroke="color" stroke-width="4" stroke-linecap="round"
            :stroke-dasharray="c" :stroke-dashoffset="c * (1 - Math.min(100, Math.max(0, value)) / 100)"
            :style="{ filter: 'drop-shadow(0 0 4px ' + color + ')', transition: 'stroke-dashoffset .5s' }" />
        </svg>
        <span class="ring-label">{{ Math.round(value) }}%</span>
      </span>`,
  };

  C.Loading = { template: '<div class="loading"><div class="spinner"></div></div>' };

  /** Lista de proyectos abiertos para los selectores. */
  async function openProjects() {
    try { return await App.api.get('/projects', { status: 'abiertos' }); } catch { return []; }
  }

  const REMINDERS = [
    { v: '', label: 'Sin aviso' }, { v: '0', label: 'A la hora' }, { v: '5', label: '5 min antes' }, { v: '10', label: '10 min antes' },
    { v: '15', label: '15 min antes' }, { v: '30', label: '30 min antes' }, { v: '60', label: '1 hora antes' }, { v: '120', label: '2 horas antes' },
    { v: '1440', label: '1 día antes' },
  ];

  // ---------------------------------------------------------------------------
  // Editor de eventos
  // ---------------------------------------------------------------------------
  C.EventEditor = {
    props: { event: Object, date: String, time: String },
    emits: ['close', 'saved'],
    setup(props, { emit }) {
      const ev = props.event;
      const startWall = ev ? ev.series_start || ev.start : null;
      const endWall = ev ? D.addMinutes(startWall, D.diffMinutes(ev.start, ev.end)) : null;
      const defStart = props.time || '09:00';
      const defRem = App.store.settings.default_reminder ?? '15';
      const f = reactive({
        title: ev ? ev.title : '',
        all_day: ev ? !!ev.all_day : false,
        date: startWall ? startWall.slice(0, 10) : props.date || D.today(),
        end_date: endWall ? endWall.slice(0, 10) : props.date || D.today(),
        start: startWall && !ev.all_day ? startWall.slice(11) : defStart,
        end: endWall && !ev.all_day ? endWall.slice(11) : D.addMinutes(`2000-01-01T${defStart}`, Number(App.store.settings.default_duration) || 60).slice(11),
        location: ev ? ev.location || '' : '',
        category: ev ? ev.category || 'general' : 'general',
        reminder: ev ? (ev.reminder_min === null || ev.reminder_min === undefined ? '' : String(ev.reminder_min)) : String(defRem),
        repeat: ev ? ev.repeat || 'none' : 'none',
        repeat_until: ev ? ev.repeat_until || '' : '',
        project_id: ev && ev.project_id ? String(ev.project_id) : '',
        notes: ev ? ev.notes || '' : '',
      });
      const saving = ref(false);
      const projects = ref([]);
      onMounted(async () => { projects.value = await openProjects(); });
      const reminders = computed(() => REMINDERS.some((r) => r.v === f.reminder) ? REMINDERS : [...REMINDERS, { v: f.reminder, label: `${f.reminder} min antes` }]);

      // Al cambiar la hora de inicio se mueve la de fin para conservar la duración.
      watch(() => f.start, (now, before) => {
        if (!before || !now) return;
        const dur = D.diffMinutes(`2000-01-01T${before}`, `2000-01-01T${f.end}`);
        f.end = D.addMinutes(`2000-01-01T${now}`, dur > 0 ? dur : 60).slice(11);
      });
      watch(() => f.date, (now, before) => { if (f.end_date === before || f.end_date < now) f.end_date = now; });

      function payload() {
        const body = {
          title: f.title,
          all_day: f.all_day,
          location: f.location,
          category: f.category,
          reminder_min: f.reminder === '' ? null : Number(f.reminder),
          repeat: f.repeat,
          repeat_until: f.repeat !== 'none' ? f.repeat_until || null : null,
          project_id: f.project_id ? Number(f.project_id) : null,
          notes: f.notes,
        };
        if (f.all_day) {
          body.start = f.date;
          body.end = f.end_date < f.date ? f.date : f.end_date;
        } else {
          body.start = `${f.date}T${f.start}`;
          // Si la hora de fin es menor, termina al día siguiente (p. ej. 22:00 a 01:00).
          body.end = f.end > f.start ? `${f.date}T${f.end}` : `${D.addDays(f.date, 1)}T${f.end}`;
        }
        return body;
      }

      async function save() {
        if (!f.title.trim()) return App.toast('Escriba un título.', { type: 'error' });
        saving.value = true;
        try {
          const saved = ev ? await App.api.put(`/events/${ev.id}`, payload()) : await App.api.post('/events', payload());
          App.toast(ev ? 'Evento actualizado' : 'Evento agendado');
          App.refresh();
          emit('saved', saved);
          emit('close');
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }

      async function remove() {
        let date = null;
        if (ev.recurring || (ev.repeat && ev.repeat !== 'none')) {
          const choice = await App.choose({
            title: 'Eliminar evento repetido',
            message: `«${ev.title}» se repite. ¿Qué desea eliminar?`,
            icon: 'repeat',
            options: [
              { label: 'Cancelar', value: null },
              { label: `Solo ${App.fmt.human(ev.occurrence || ev.start)}`, value: 'one', kind: 'primary' },
              { label: 'Toda la serie', value: 'all', kind: 'danger' },
            ],
          });
          if (!choice) return;
          if (choice === 'one') date = ev.occurrence || ev.start.slice(0, 10);
        } else if (!(await App.confirm({ title: 'Eliminar evento', message: `¿Eliminar «${ev.title}»?`, confirmText: 'Eliminar', danger: true }))) return;
        try {
          await App.api.del(`/events/${ev.id}`, { date });
          App.toast('Evento eliminado');
          App.refresh();
          emit('close');
        } catch (e) { App.error(e); }
      }

      return { f, ev, saving, save, remove, projects, reminders, categories: App.CATEGORIES, repeats: App.REPEAT_NAMES };
    },
    template: `
      <modal :title="ev ? 'Editar evento' : 'Nuevo evento'" icon="calendar-plus" @close="$emit('close')">
        <form class="col gap-12" @submit.prevent="save">
          <div class="field"><label>Título</label><input class="input" v-model="f.title" placeholder="Reunión, cita, recordatorio…" autofocus maxlength="200" /></div>
          <label class="check"><input type="checkbox" v-model="f.all_day" /> Todo el día</label>
          <div class="row">
            <div class="field"><label>{{ f.all_day ? 'Desde' : 'Fecha' }}</label><input class="input" type="date" v-model="f.date" required /></div>
            <template v-if="!f.all_day">
              <div class="field"><label>Inicio</label><input class="input" type="time" v-model="f.start" required /></div>
              <div class="field"><label>Fin</label><input class="input" type="time" v-model="f.end" required /></div>
            </template>
            <div v-else class="field"><label>Hasta</label><input class="input" type="date" v-model="f.end_date" :min="f.date" /></div>
          </div>
          <div class="row">
            <div class="field"><label>Lugar</label><input class="input" v-model="f.location" placeholder="Opcional" maxlength="200" /></div>
            <div class="field"><label>Categoría</label>
              <select class="select" v-model="f.category"><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.label }}</option></select>
            </div>
          </div>
          <div class="row">
            <div class="field"><label>Aviso</label>
              <select class="select" v-model="f.reminder"><option v-for="r in reminders" :key="r.v" :value="r.v">{{ r.label }}</option></select>
            </div>
            <div class="field"><label>Repetir</label>
              <select class="select" v-model="f.repeat"><option v-for="(label, k) in repeats" :key="k" :value="k">{{ label }}</option></select>
            </div>
            <div class="field" v-if="f.repeat !== 'none'"><label>Repetir hasta</label><input class="input" type="date" v-model="f.repeat_until" :min="f.date" /></div>
          </div>
          <div class="field"><label>Proyecto</label>
            <select class="select" v-model="f.project_id"><option value="">Ninguno</option><option v-for="p in projects" :key="p.id" :value="String(p.id)">{{ p.name }}</option></select>
          </div>
          <div class="field"><label>Notas</label><textarea class="textarea" v-model="f.notes" maxlength="4000"></textarea></div>
          <p v-if="ev && ev.repeat && ev.repeat !== 'none'" class="small muted"><icon name="repeat" :size="14" /> Los cambios se aplican a toda la serie.</p>
          <button type="submit" hidden></button>
        </form>
        <template #foot>
          <button v-if="ev" class="btn btn-danger" style="margin-right:auto" @click="remove"><icon name="trash-2" /> Eliminar</button>
          <button class="btn btn-ghost" @click="$emit('close')">Cancelar</button>
          <button class="btn btn-primary" :disabled="saving" @click="save"><icon name="check" /> Guardar</button>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  // Editor de tareas
  // ---------------------------------------------------------------------------
  C.TaskEditor = {
    props: { task: Object, projectId: [Number, String], status: String },
    emits: ['close', 'saved'],
    setup(props, { emit }) {
      const t = props.task;
      const f = reactive({
        title: t ? t.title : '',
        project_id: t ? (t.project_id ? String(t.project_id) : '') : props.projectId ? String(props.projectId) : '',
        status: t ? t.status : props.status || 'pendiente',
        priority: t ? t.priority : 'media',
        due_date: t ? t.due_date || '' : '',
        due_time: t ? t.due_time || '' : '',
        notes: t ? t.notes || '' : '',
      });
      const projects = ref([]);
      const saving = ref(false);
      onMounted(async () => {
        projects.value = await openProjects();
        if (t && t.project_id && !projects.value.some((p) => p.id === t.project_id)) projects.value.push({ id: t.project_id, name: t.project_name });
      });
      async function save() {
        if (!f.title.trim()) return App.toast('Escriba la tarea.', { type: 'error' });
        saving.value = true;
        const body = { ...f, project_id: f.project_id ? Number(f.project_id) : null, due_date: f.due_date || null, due_time: f.due_time || null };
        try {
          const saved = t ? await App.api.put(`/tasks/${t.id}`, body) : await App.api.post('/tasks', body);
          App.toast(t ? 'Tarea actualizada' : 'Tarea agregada');
          App.refresh();
          emit('saved', saved);
          emit('close');
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      async function remove() {
        if (!(await App.confirm({ title: 'Eliminar tarea', message: `¿Eliminar «${t.title}»?`, confirmText: 'Eliminar', danger: true }))) return;
        try {
          await App.api.del(`/tasks/${t.id}`);
          App.toast('Tarea eliminada');
          App.refresh();
          emit('close');
        } catch (e) { App.error(e); }
      }
      return { f, t, projects, saving, save, remove, names: App.STATUS_NAMES };
    },
    template: `
      <modal :title="t ? 'Editar tarea' : 'Nueva tarea'" icon="list-checks" @close="$emit('close')">
        <form class="col gap-12" @submit.prevent="save">
          <div class="field"><label>Tarea</label><input class="input" v-model="f.title" placeholder="¿Qué hay que hacer?" autofocus maxlength="300" /></div>
          <div class="row">
            <div class="field"><label>Proyecto</label>
              <select class="select" v-model="f.project_id"><option value="">Sin proyecto</option><option v-for="p in projects" :key="p.id" :value="String(p.id)">{{ p.name }}</option></select>
            </div>
            <div class="field"><label>Estado</label>
              <select class="select" v-model="f.status"><option value="pendiente">Pendiente</option><option value="en_progreso">En progreso</option><option value="hecha">Hecha</option></select>
            </div>
          </div>
          <div class="row">
            <div class="field"><label>Prioridad</label>
              <select class="select" v-model="f.priority"><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select>
            </div>
            <div class="field"><label>Fecha límite</label><input class="input" type="date" v-model="f.due_date" /></div>
            <div class="field"><label>Hora (aviso)</label><input class="input" type="time" v-model="f.due_time" /></div>
          </div>
          <div class="field"><label>Notas</label><textarea class="textarea" v-model="f.notes" maxlength="4000"></textarea></div>
          <button type="submit" hidden></button>
        </form>
        <template #foot>
          <button v-if="t" class="btn btn-danger" style="margin-right:auto" @click="remove"><icon name="trash-2" /> Eliminar</button>
          <button class="btn btn-ghost" @click="$emit('close')">Cancelar</button>
          <button class="btn btn-primary" :disabled="saving" @click="save"><icon name="check" /> Guardar</button>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  // Editor de proyectos
  // ---------------------------------------------------------------------------
  const COLORS = ['#22d3ee', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#fb923c', '#4ade80', '#f87171', '#e2e8f0'];
  C.ProjectEditor = {
    props: { project: Object },
    emits: ['close', 'saved', 'deleted'],
    setup(props, { emit }) {
      const p = props.project;
      const f = reactive({
        name: p ? p.name : '',
        description: p ? p.description || '' : '',
        color: p ? p.color : COLORS[Math.floor(Math.random() * 8)],
        status: p ? p.status : 'activo',
        priority: p ? p.priority : 'media',
        start_date: p ? p.start_date || '' : D.today(),
        due_date: p ? p.due_date || '' : '',
      });
      const saving = ref(false);
      async function save() {
        if (!f.name.trim()) return App.toast('Escriba el nombre del proyecto.', { type: 'error' });
        saving.value = true;
        const body = { ...f, start_date: f.start_date || null, due_date: f.due_date || null };
        try {
          const saved = p ? await App.api.put(`/projects/${p.id}`, body) : await App.api.post('/projects', body);
          App.toast(p ? 'Proyecto actualizado' : 'Proyecto creado');
          App.refresh();
          emit('saved', saved);
          emit('close');
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      async function remove() {
        const ok = await App.confirm({
          title: 'Eliminar proyecto',
          message: `Se eliminará «${p.name}» con todas sus tareas y notas (${p.tasks_total || 0} tareas). Esto no se puede deshacer.\n\nSi solo terminó, mejor márquelo como «Completado».`,
          confirmText: 'Eliminar todo', danger: true,
        });
        if (!ok) return;
        try {
          await App.api.del(`/projects/${p.id}`);
          App.toast('Proyecto eliminado');
          App.refresh();
          emit('deleted');
          emit('close');
        } catch (e) { App.error(e); }
      }
      return { f, p, saving, save, remove, colors: COLORS };
    },
    template: `
      <modal :title="p ? 'Editar proyecto' : 'Nuevo proyecto'" icon="folder-kanban" @close="$emit('close')">
        <form class="col gap-12" @submit.prevent="save">
          <div class="field"><label>Nombre</label><input class="input" v-model="f.name" placeholder="Tienda en línea, Mudanza, Tesis…" autofocus maxlength="120" /></div>
          <div class="field"><label>Objetivo / descripción</label><textarea class="textarea" v-model="f.description" placeholder="¿Qué quiere lograr? Mientras más claro, mejor podrá ayudarle JARVIS a planearlo." maxlength="4000"></textarea></div>
          <div class="row">
            <div class="field"><label>Estado</label>
              <select class="select" v-model="f.status"><option value="activo">Activo</option><option value="en_pausa">En pausa</option><option value="completado">Completado</option><option value="cancelado">Cancelado</option></select>
            </div>
            <div class="field"><label>Prioridad</label>
              <select class="select" v-model="f.priority"><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select>
            </div>
          </div>
          <div class="row">
            <div class="field"><label>Inicio</label><input class="input" type="date" v-model="f.start_date" /></div>
            <div class="field"><label>Fecha límite</label><input class="input" type="date" v-model="f.due_date" :min="f.start_date" /></div>
          </div>
          <div class="field"><label>Color</label>
            <div class="flex flex-wrap">
              <button v-for="c in colors" :key="c" type="button" @click="f.color = c" :aria-label="'Color ' + c"
                :style="{ width: '30px', height: '30px', borderRadius: '8px', background: c, cursor: 'pointer', border: f.color === c ? '2px solid #fff' : '2px solid transparent', boxShadow: f.color === c ? '0 0 10px ' + c : 'none' }"></button>
            </div>
          </div>
          <button type="submit" hidden></button>
        </form>
        <template #foot>
          <button v-if="p" class="btn btn-danger" style="margin-right:auto" @click="remove"><icon name="trash-2" /> Eliminar</button>
          <button class="btn btn-ghost" @click="$emit('close')">Cancelar</button>
          <button class="btn btn-primary" :disabled="saving" @click="save"><icon name="check" /> Guardar</button>
        </template>
      </modal>`,
  };

  /** Fila de tarea con casilla para marcarla como hecha. */
  C.TaskRow = {
    props: { task: Object, showProject: { type: Boolean, default: true } },
    emits: ['open'],
    setup(props) {
      const busy = ref(false);
      async function toggle() {
        if (busy.value) return;
        busy.value = true;
        const t = props.task;
        const status = t.status === 'hecha' ? 'pendiente' : 'hecha';
        try {
          await App.api.put(`/tasks/${t.id}`, { status });
          t.status = status;
          if (status === 'hecha') App.toast(`«${t.title}» terminada`);
          App.refresh();
        } catch (e) { App.error(e); } finally { busy.value = false; }
      }
      const due = computed(() => App.fmt.due(props.task));
      return { toggle, due, busy };
    },
    template: `
      <div class="task-row" :class="{ done: task.status === 'hecha' }">
        <button class="tick" :class="{ on: task.status === 'hecha' }" @click="toggle" :aria-label="task.status === 'hecha' ? 'Marcar como pendiente' : 'Marcar como hecha'"><icon name="check" :size="14" /></button>
        <div class="t-main" @click="$emit('open', task)">
          <div class="t-title">{{ task.title }}</div>
          <div class="t-meta">
            <span v-if="task.status === 'en_progreso'" class="chip violet">En progreso</span>
            <span v-if="due" class="chip" :class="due.cls"><icon name="clock" :size="12" /> {{ due.text }}</span>
            <span v-if="showProject && task.project_name" class="chip" :style="{ color: task.project_color, borderColor: task.project_color + '66' }">{{ task.project_name }}</span>
            <span v-if="task.priority === 'alta'" class="chip danger"><icon name="flag" :size="12" /> Alta</span>
          </div>
        </div>
      </div>`,
  };
})();
