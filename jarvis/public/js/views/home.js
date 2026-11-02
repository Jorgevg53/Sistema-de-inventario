/* Inicio: estado de JARVIS, reloj, conversación, agenda de hoy, tareas y proyectos. */
(function () {
  'use strict';
  const { ref, computed, onMounted, onBeforeUnmount, watch } = Vue;
  const D = App.dates;

  App.views.Home = {
    setup() {
      const store = App.store;
      const b = ref(null);
      const now = ref(new Date());
      const editing = ref(null); // { kind: 'event' | 'task', item }
      const quick = ref('');
      let clock = null;
      let reload = null;

      async function load() {
        try { b.value = await App.api.get('/briefing'); } catch (e) { App.error(e); }
      }
      onMounted(() => {
        load();
        clock = setInterval(() => { now.value = new Date(); }, 1000);
        reload = setInterval(load, 60000);
      });
      onBeforeUnmount(() => { clearInterval(clock); clearInterval(reload); });
      watch(() => store.tick, load);

      const hh = computed(() => String(now.value.getHours() % 12 || 12));
      const mm = computed(() => String(now.value.getMinutes()).padStart(2, '0'));
      const ampm = computed(() => (now.value.getHours() < 12 ? 'a. m.' : 'p. m.'));
      const longDate = computed(() => App.fmt.longDate(D.nowWall(now.value)));
      const wall = computed(() => D.nowWall(now.value));
      const tasks = computed(() => {
        if (!b.value) return [];
        const seen = new Set();
        return [...b.value.overdue, ...b.value.tasks_due, ...b.value.in_progress].filter((t) => !seen.has(t.id) && seen.add(t.id)).slice(0, 10);
      });

      function speakBriefing() {
        if (!b.value) return;
        App.chat.say(b.value.text);
        App.voice.say(b.value.text, { force: true });
      }
      function talk() {
        if (store.voiceState === 'speaking') return App.voice.stop();
        App.chat.listen();
      }
      async function addTask() {
        const text = quick.value.trim();
        if (!text) return;
        try {
          const t = await App.api.post('/tasks/quick', { text });
          quick.value = '';
          App.toast(`Tarea agregada${t.due_date ? ` para ${App.fmt.human(t.due_date)}` : ''}`);
          App.refresh();
        } catch (e) { App.error(e); }
      }
      const evState = (e) => (e.all_day ? '' : e.end <= wall.value ? 'past' : e.start <= wall.value ? 'now' : '');

      return { store, b, hh, mm, ampm, longDate, tasks, editing, quick, speakBriefing, talk, addTask, evState, fmt: App.fmt, color: App.categoryColor };
    },
    template: `
      <div class="hud">
        <div class="hud-left">
          <div class="panel status-card">
            <reactor :size="150" @activate="talk" />
            <div class="grow">
              <div class="clock">{{ hh }}:{{ mm }}<small>{{ ampm }}</small></div>
              <div class="muted small mt-4">{{ fmt.cap(longDate) }}</div>
              <div class="mt-8 flex flex-wrap" style="justify-content:center">
                <span class="chip" :class="store.settings.ai_enabled ? 'cyan' : 'warn'"><icon name="brain-circuit" :size="12" /> {{ store.settings.ai_enabled ? 'Claude en línea' : 'Modo básico' }}</span>
                <span v-if="store.voiceState !== 'idle'" class="chip violet">{{ { listening: 'Escuchando…', thinking: 'Pensando…', speaking: 'Hablando…' }[store.voiceState] }}</span>
              </div>
            </div>
            <div class="stats" v-if="b">
              <div class="stat"><b>{{ b.events.length }}</b><span>Eventos hoy</span></div>
              <div class="stat"><b>{{ b.tasks_due.length }}</b><span>Tareas hoy</span></div>
              <div class="stat" :class="{ alert: b.overdue.length }"><b>{{ b.overdue.length }}</b><span>Vencidas</span></div>
              <div class="stat"><b>{{ b.projects.length }}</b><span>Proyectos activos</span></div>
            </div>
            <button class="btn" style="width:100%" @click="speakBriefing" :disabled="!b"><icon name="sunrise" /> Resumen del día</button>
          </div>
        </div>

        <chat-panel embedded />

        <div class="hud-right" v-if="b">
          <div class="panel">
            <div class="panel-head">
              <icon name="calendar-days" class="cyan" /><span class="upper">Agenda de hoy</span>
              <button class="icon-btn sm ml-auto" @click="editing = { kind: 'event', item: null }" title="Nuevo evento"><icon name="plus" /></button>
            </div>
            <div class="panel-body tight">
              <div v-if="!b.events.length" class="empty">Sin eventos hoy. <a href="#/agenda">Abrir agenda</a></div>
              <div class="timeline" v-else>
                <div v-for="e in b.events" :key="e.id + e.start" class="tl-item" :class="evState(e)" @click="editing = { kind: 'event', item: e }">
                  <div class="tl-time">{{ e.all_day ? 'Todo el día' : fmt.time(e.start) }}</div>
                  <div class="grow">
                    <div class="tl-title"><span class="dot" :style="{ background: color(e), marginRight: '6px' }"></span>{{ e.title }}</div>
                    <div class="tl-meta">
                      <span v-if="!e.all_day">hasta {{ fmt.time(e.end) }}</span>
                      <span v-if="e.location"><icon name="map-pin" :size="11" /> {{ e.location }}</span>
                      <span v-if="e.recurring"><icon name="repeat" :size="11" /></span>
                      <span v-if="e.reminder_min !== null"><icon name="bell" :size="11" /></span>
                    </div>
                  </div>
                </div>
              </div>
              <template v-if="b.upcoming.length">
                <div class="upper dim" style="padding:10px 4px 4px">Próximos días</div>
                <div v-for="e in b.upcoming.slice(0, 5)" :key="'u' + e.id + e.start" class="tl-item" @click="editing = { kind: 'event', item: e }">
                  <div class="tl-time">{{ fmt.cap(fmt.human(e.start)) }}</div>
                  <div class="grow"><div class="tl-title">{{ e.title }}</div><div class="tl-meta" v-if="!e.all_day">{{ fmt.time(e.start) }}</div></div>
                </div>
              </template>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <icon name="list-checks" class="cyan" /><span class="upper">Tareas</span>
              <a href="#/tareas" class="small ml-auto">Ver todas</a>
            </div>
            <div class="panel-body tight">
              <form @submit.prevent="addTask" class="mb-8"><input class="input" v-model="quick" placeholder="Nueva tarea… (ej. pagar la luz el viernes)" /></form>
              <div v-if="!tasks.length" class="empty">Nada urgente. ¡Bien hecho!</div>
              <task-row v-for="t in tasks" :key="t.id" :task="t" @open="editing = { kind: 'task', item: t }" />
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <icon name="folder-kanban" class="cyan" /><span class="upper">Proyectos activos</span>
              <a href="#/proyectos" class="small ml-auto">Ver todos</a>
            </div>
            <div class="panel-body tight">
              <div v-if="!b.projects.length" class="empty">Sin proyectos activos. <a href="#/proyectos">Crear uno</a></div>
              <a v-for="p in b.projects.slice(0, 6)" :key="p.id" class="proj-mini" :href="'#/proyectos/' + p.id">
                <div class="flex">
                  <span class="dot" :style="{ background: p.color }"></span>
                  <span class="grow truncate">{{ p.name }}</span>
                  <span class="mono small cyan">{{ p.progress }}%</span>
                </div>
                <div class="bar mt-4"><span :style="{ width: p.progress + '%', background: p.color }"></span></div>
                <div class="tiny muted mt-4">
                  {{ p.tasks_done }}/{{ p.tasks_total }} tareas
                  <template v-if="p.days_left !== null"> · <span :class="{ danger: p.days_left < 0, warn: p.days_left >= 0 && p.days_left <= 7 }">{{ p.days_left < 0 ? 'vencido' : p.days_left === 0 ? 'vence hoy' : 'faltan ' + p.days_left + ' días' }}</span></template>
                  <template v-if="p.tasks_overdue"> · <span class="danger">{{ p.tasks_overdue }} vencidas</span></template>
                </div>
              </a>
            </div>
          </div>
        </div>

        <event-editor v-if="editing && editing.kind === 'event'" :event="editing.item" @close="editing = null" />
        <task-editor v-if="editing && editing.kind === 'task'" :task="editing.item" @close="editing = null" />
      </div>`,
  };
})();
