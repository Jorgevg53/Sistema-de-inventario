/* Agenda: vista de mes, semana y lista, con el detalle del día seleccionado. */
(function () {
  'use strict';
  const { ref, computed, watch, onMounted } = Vue;
  const D = App.dates;
  const MODE_KEY = 'jarvis.agendaMode';

  App.views.Agenda = {
    setup() {
      const store = App.store;
      let saved = 'mes';
      try { saved = localStorage.getItem(MODE_KEY) || 'mes'; } catch { /* sin almacenamiento */ }
      const mode = ref(saved);
      const sel = ref(/^\d{4}-\d{2}-\d{2}$/.test(store.route.query.date || '') ? store.route.query.date : D.today());
      const events = ref([]);
      const dayTasks = ref([]);
      const free = ref(null);
      const loading = ref(true);
      const editing = ref(null); // { event, date, time }
      const editingTask = ref(null);
      const quick = ref('');

      const range = computed(() => {
        if (mode.value === 'semana') {
          const mon = D.monday(sel.value);
          return { from: mon, to: D.addDays(mon, 6) };
        }
        if (mode.value === 'lista') return { from: sel.value, to: D.addDays(sel.value, 30) };
        const [y, m] = sel.value.split('-').map(Number);
        const grid = D.monthGrid(y, m - 1);
        return { from: grid[0], to: grid[41], grid, year: y, month0: m - 1 };
      });

      async function load() {
        try {
          events.value = await App.api.get('/events', { from: range.value.from, to: range.value.to });
        } catch (e) { App.error(e); } finally { loading.value = false; }
        loadDay();
      }
      async function loadDay() {
        free.value = null;
        try { dayTasks.value = await App.api.get('/tasks', { when: sel.value }); } catch { dayTasks.value = []; }
      }
      onMounted(load);
      watch(() => [range.value.from, range.value.to], load);
      watch(sel, loadDay);
      watch(() => store.tick, load);
      watch(mode, (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* sin almacenamiento */ } });
      watch(() => store.route.query.date, (d) => { if (/^\d{4}-\d{2}-\d{2}$/.test(d || '')) sel.value = d; });

      /** Eventos por día (un evento de varios días aparece en cada uno). */
      const byDay = computed(() => {
        const map = {};
        for (const e of events.value) {
          let d = e.start.slice(0, 10);
          // Un evento que termina justo a medianoche no ocupa el día siguiente.
          const last = e.end.slice(11) === '00:00' && e.end > e.start ? D.addDays(e.end, -1) : e.end.slice(0, 10);
          for (let i = 0; d <= last && i < 62; i++, d = D.addDays(d, 1)) (map[d] = map[d] || []).push(e);
        }
        return map;
      });
      const dayEvents = computed(() => byDay.value[sel.value] || []);
      const week = computed(() => Array.from({ length: 7 }, (_, i) => D.addDays(D.monday(sel.value), i)));
      const listDays = computed(() => Object.keys(byDay.value).filter((d) => d >= range.value.from && d <= range.value.to).sort());

      const title = computed(() => {
        if (mode.value === 'mes') return App.fmt.monthTitle(range.value.year, range.value.month0);
        if (mode.value === 'semana') return `${App.fmt.shortDate(range.value.from)} – ${App.fmt.shortDate(range.value.to)}`;
        return `Próximos 30 días`;
      });

      function move(dir) {
        if (mode.value === 'mes') {
          const [y, m] = sel.value.split('-').map(Number);
          const idx = m - 1 + dir;
          const ny = y + Math.floor(idx / 12);
          const nm = ((idx % 12) + 12) % 12;
          sel.value = `${ny}-${D.pad(nm + 1)}-01`;
        } else sel.value = D.addDays(sel.value, dir * (mode.value === 'semana' ? 7 : 30));
      }
      function pick(d) {
        sel.value = d;
      }
      async function addQuick() {
        const text = quick.value.trim();
        if (!text) return;
        try {
          // Si el texto no trae fecha se usa el día seleccionado.
          const ev = await App.api.post('/events/quick', { text, date: sel.value });
          quick.value = '';
          App.toast(`Agendado: ${ev.title} · ${App.fmt.human(ev.start)}${ev.all_day ? '' : ' ' + App.fmt.time(ev.start)}`);
          sel.value = ev.start.slice(0, 10);
          App.refresh();
        } catch (e) { App.error(e); }
      }
      async function findFree() {
        try { free.value = await App.api.get('/free-slots', { date: sel.value, duration: 60 }); } catch (e) { App.error(e); }
      }

      return {
        mode, sel, events, loading, range, byDay, dayEvents, dayTasks, week, listDays, title, editing, editingTask, quick, free,
        move, pick, addQuick, findFree, today: D.today, fmt: App.fmt, color: App.categoryColor, dows: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      };
    },
    template: `
      <div>
        <div class="page-head">
          <div><h1>Agenda</h1><div class="sub">Sus eventos, citas y recordatorios</div></div>
          <div class="ml-auto flex flex-wrap">
            <div class="tabs">
              <button class="tab" :class="{ active: mode === 'mes' }" @click="mode = 'mes'"><icon name="layout-grid" :size="14" /> Mes</button>
              <button class="tab" :class="{ active: mode === 'semana' }" @click="mode = 'semana'"><icon name="columns-3" :size="14" /> Semana</button>
              <button class="tab" :class="{ active: mode === 'lista' }" @click="mode = 'lista'"><icon name="list" :size="14" /> Lista</button>
            </div>
            <button class="btn btn-primary" @click="editing = { event: null, date: sel }"><icon name="calendar-plus" /> Evento</button>
          </div>
        </div>

        <div class="agenda-grid">
          <div class="panel">
            <div class="panel-head">
              <button class="icon-btn sm" @click="move(-1)" aria-label="Anterior"><icon name="chevron-left" /></button>
              <h2 class="grow center">{{ title }}</h2>
              <button class="icon-btn sm" @click="move(1)" aria-label="Siguiente"><icon name="chevron-right" /></button>
              <button class="btn btn-sm" @click="sel = today()">Hoy</button>
            </div>

            <loading v-if="loading" />
            <div v-else-if="mode === 'mes'" class="cal">
              <div v-for="d in dows" :key="d" class="cal-h">{{ d }}</div>
              <div v-for="d in range.grid" :key="d" class="cal-d"
                :class="{ other: Number(d.slice(5, 7)) !== range.month0 + 1, today: d === today(), sel: d === sel }"
                @click="pick(d)" @dblclick="editing = { event: null, date: d }">
                <span class="cal-n">{{ Number(d.slice(8)) }}</span>
                <div v-for="e in (byDay[d] || []).slice(0, 3)" :key="e.id + e.start" class="cal-ev" :class="{ allday: e.all_day }"
                  :style="{ '--c': color(e) }" @click.stop="editing = { event: e }" :title="e.title">
                  <span v-if="!e.all_day && e.start.slice(0, 10) === d" class="mono">{{ e.start.slice(11) }}</span> {{ e.title }}
                </div>
                <div v-if="(byDay[d] || []).length > 3" class="cal-more">+{{ byDay[d].length - 3 }} más</div>
                <div class="cal-dots"><i v-for="e in (byDay[d] || []).slice(0, 4)" :key="'d' + e.id + e.start" :style="{ '--c': color(e) }"></i></div>
              </div>
            </div>

            <div v-else-if="mode === 'semana'" class="panel-body">
              <div class="week">
                <div v-for="d in week" :key="d" class="week-day" :class="{ today: d === today() }" @click="pick(d)" @dblclick="editing = { event: null, date: d }">
                  <div class="flex"><b class="small">{{ fmt.cap(fmt.longDate(d).split(' ').slice(0, 2).join(' ')) }}</b></div>
                  <div v-for="e in byDay[d] || []" :key="e.id + e.start" class="week-ev" :style="{ '--c': color(e) }" @click.stop="editing = { event: e }">
                    <div class="mono">{{ e.all_day ? 'Todo el día' : fmt.time(e.start) }}</div>
                    <div>{{ e.title }}</div>
                  </div>
                  <div v-if="!(byDay[d] || []).length" class="tiny dim">Libre</div>
                </div>
              </div>
            </div>

            <div v-else class="panel-body">
              <div v-if="!listDays.length" class="empty">No hay eventos en los próximos 30 días.</div>
              <div v-for="d in listDays" :key="d" class="day-group">
                <h3>{{ fmt.cap(fmt.human(d)) }}<span v-if="fmt.human(d) !== fmt.longDate(d)" class="dim"> · {{ fmt.longDate(d) }}</span></h3>
                <div class="timeline">
                  <div v-for="e in byDay[d]" :key="e.id + e.start" class="tl-item" @click="editing = { event: e }">
                    <div class="tl-time">{{ e.all_day ? 'Todo el día' : fmt.time(e.start) }}</div>
                    <div class="grow">
                      <div class="tl-title"><span class="dot" :style="{ background: color(e), marginRight: '6px' }"></span>{{ e.title }}</div>
                      <div class="tl-meta"><span v-if="e.location"><icon name="map-pin" :size="11" /> {{ e.location }}</span><span v-if="e.recurring"><icon name="repeat" :size="11" /> {{ { daily: 'Diario', weekdays: 'Lun–Vie', weekly: 'Semanal', monthly: 'Mensual', yearly: 'Anual' }[e.repeat] }}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><icon name="calendar-check" class="cyan" /><h3 class="grow">{{ fmt.cap(fmt.longDate(sel)) }}</h3></div>
            <div class="panel-body">
              <form @submit.prevent="addQuick" class="flex mb-12">
                <input class="input" v-model="quick" placeholder="Ej. Dentista a las 5 (con aviso 30 minutos antes)" />
                <button class="btn" aria-label="Agregar"><icon name="plus" /></button>
              </form>
              <div v-if="!dayEvents.length" class="empty" style="padding:10px">Sin eventos este día.</div>
              <div class="timeline">
                <div v-for="e in dayEvents" :key="e.id + e.start" class="tl-item" @click="editing = { event: e }">
                  <div class="tl-time">{{ e.all_day ? 'Todo el día' : fmt.time(e.start) }}</div>
                  <div class="grow">
                    <div class="tl-title"><span class="dot" :style="{ background: color(e), marginRight: '6px' }"></span>{{ e.title }}</div>
                    <div class="tl-meta">
                      <span v-if="!e.all_day">hasta {{ fmt.time(e.end) }}</span>
                      <span v-if="e.location"><icon name="map-pin" :size="11" /> {{ e.location }}</span>
                      <span v-if="e.project_name">{{ e.project_name }}</span>
                      <span v-if="e.reminder_min !== null"><icon name="bell" :size="11" /> {{ e.reminder_min === 0 ? 'a la hora' : e.reminder_min + ' min' }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <template v-if="dayTasks.length">
                <div class="upper dim mt-12 mb-8">Tareas que vencen</div>
                <task-row v-for="t in dayTasks" :key="t.id" :task="t" @open="editingTask = t" />
              </template>
              <div class="mt-16 flex flex-wrap">
                <button class="btn btn-sm" @click="editing = { event: null, date: sel }"><icon name="plus" :size="14" /> Evento</button>
                <button class="btn btn-sm" @click="findFree"><icon name="hourglass" :size="14" /> Huecos libres</button>
              </div>
              <div v-if="free" class="mt-12 small">
                <div v-if="!free.slots.length" class="muted">No hay huecos de 1 hora entre {{ fmt.time(free.from) }} y {{ fmt.time(free.to) }}.</div>
                <div v-else>
                  <div class="muted mb-8">Libre entre {{ fmt.time(free.from) }} y {{ fmt.time(free.to) }}:</div>
                  <div class="flex flex-wrap">
                    <button v-for="s in free.slots" :key="s.start" class="chip cyan" style="cursor:pointer" @click="editing = { event: null, date: sel, time: s.start.slice(11) }">
                      {{ fmt.time(s.start) }} – {{ fmt.time(s.end) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <event-editor v-if="editing" :event="editing.event" :date="editing.date" :time="editing.time" @close="editing = null" />
        <task-editor v-if="editingTask" :task="editingTask" @close="editingTask = null" />
      </div>`,
  };
})();
