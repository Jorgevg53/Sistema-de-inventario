/* Conversación con JARVIS (compartida entre el inicio y la ventana flotante). */
(function () {
  'use strict';
  const { ref, computed, watch, nextTick, onMounted } = Vue;
  const store = App.store;

  const chat = (App.chat = Vue.reactive({ messages: [], loaded: false, sending: false, draft: '' }));
  let localId = 0;

  chat.load = async () => {
    try {
      chat.messages = await App.api.get('/chat');
      chat.loaded = true;
    } catch (e) { App.error(e); }
  };

  /** Envía un mensaje. Si llegó por voz (o la voz está activada) JARVIS lee la respuesta. */
  chat.send = async (text) => {
    text = String(text || '').trim();
    if (!text || chat.sending) return;
    chat.messages.push({ id: `l${++localId}`, role: 'user', text });
    chat.sending = true;
    store.voiceState = 'thinking';
    try {
      const r = await App.api.post('/chat', { message: text });
      chat.messages.push({ id: `l${++localId}`, role: 'assistant', text: r.reply, actions: r.actions, mode: r.mode, notice: r.notice });
      if (r.actions && r.actions.length) App.refresh();
      if (store.status && store.status.ai && r.mode) store.status.ai.active = r.mode === 'ia';
      store.voiceState = 'idle';
      if (store.settings.voice_enabled === '1') App.voice.say(r.reply);
    } catch (e) {
      store.voiceState = 'idle';
      chat.messages.push({ id: `l${++localId}`, role: 'assistant', text: e.message, notice: 'No se pudo completar la solicitud.' });
    } finally {
      chat.sending = false;
    }
  };

  /** Dictado: lo que se escucha aparece en la caja y al terminar se envía. */
  chat.listen = () => {
    App.voice.listen({
      onInterim: (t) => { chat.draft = t; },
      onFinal: (t) => {
        if (t) {
          chat.draft = '';
          chat.send(t);
        }
      },
    });
  };

  chat.clear = async () => {
    try {
      await App.api.del('/chat');
      chat.messages = [];
    } catch (e) { App.error(e); }
  };

  chat.say = (text) => {
    chat.messages.push({ id: `l${++localId}`, role: 'assistant', text });
  };

  const ICONS = {
    event_created: 'calendar-plus', event_updated: 'calendar-check', event_deleted: 'trash-2', project_created: 'folder-plus',
    project_updated: 'folder-kanban', task_created: 'list-checks', task_updated: 'square-check-big', task_deleted: 'trash-2', note_added: 'notebook-pen',
  };

  App.components.ChatPanel = {
    props: { embedded: Boolean },
    emits: ['close'],
    setup(props, { emit }) {
      const log = ref(null);
      const box = ref(null);
      const voice = App.voice;
      onMounted(async () => {
        if (!chat.loaded) await chat.load();
        scroll();
        if (store.chatPrefill) usePrefill();
        else if (!props.embedded && box.value) box.value.focus();
      });
      function scroll() {
        nextTick(() => { if (log.value) log.value.scrollTop = log.value.scrollHeight; });
      }
      watch(() => [chat.messages.length, chat.sending], scroll);
      function usePrefill() {
        chat.draft = store.chatPrefill;
        store.chatPrefill = '';
        nextTick(() => { if (box.value) { box.value.focus(); autosize(); } });
      }
      watch(() => store.chatPrefill, (v) => { if (v) usePrefill(); });
      watch(() => chat.draft, () => nextTick(autosize));

      function autosize() {
        const el = box.value;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 140) + 'px';
      }
      function submit() {
        const t = chat.draft;
        chat.draft = '';
        chat.send(t);
      }
      async function toggleVoice() {
        const on = store.settings.voice_enabled === '1' ? '0' : '1';
        try {
          store.settings = await App.api.put('/settings', { voice_enabled: on === '1' });
          if (on === '0') voice.stop();
          else voice.say('Voz activada.');
        } catch (e) { App.error(e); }
      }
      function toggleHandsFree() {
        voice.setHandsFree(!voice.handsFree, (cmd) => chat.send(cmd));
        if (voice.handsFree) App.toast(`Manos libres activado: diga «${store.settings.assistant_name || 'Jarvis'}, …»`, { icon: 'headphones' });
      }
      function openRef(a) {
        const r = a.ref || {};
        if (/deleted/.test(a.type)) return;
        if (r.kind === 'event') App.go(`/agenda?date=${r.date || ''}`);
        else if (r.kind === 'project') App.go(`/proyectos/${r.id}`);
        else if (r.kind === 'task') App.go(r.project_id ? `/proyectos/${r.project_id}` : '/tareas');
        if (!props.embedded) emit('close');
      }
      const ai = computed(() => !!(store.settings && store.settings.ai_enabled));
      const name = computed(() => (store.settings.assistant_name || 'JARVIS').toUpperCase());
      const greeting = computed(() => {
        const h = new Date().getHours();
        const g = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
        const who = store.settings.user_title || (store.settings.user_name || '').split(' ')[0];
        return `${g}${who ? `, ${who}` : ''}.`;
      });
      const suggestions = computed(() => [
        '¿Qué tengo hoy?',
        'Agenda dentista mañana a las 5',
        'Recuérdame llamar a mamá en 1 hora',
        '¿Cómo van mis proyectos?',
        ...(ai.value ? ['Ayúdame a planear un proyecto nuevo', 'Organiza mi semana'] : ['Mis tareas pendientes', 'Ayuda']),
      ]);
      return {
        chat, store, voice, log, box, submit, autosize, toggleVoice, toggleHandsFree, openRef, ai, name, greeting, suggestions,
        rich: App.fmt.rich, actIcon: (a) => ICONS[a.type] || 'check',
      };
    },
    template: `
      <div class="chat panel" :class="{ embedded, drawer: !embedded }">
        <div class="panel-head">
          <icon name="message-square" class="cyan" />
          <span class="upper hide-sm">Canal de comunicación</span>
          <span class="chip" :class="ai ? 'cyan' : 'warn'" :title="ai ? 'Inteligencia de Claude activa' : 'Sin clave de Claude: entiende órdenes básicas'">
            <icon name="brain-circuit" :size="12" /> {{ ai ? 'IA activa' : 'Modo básico' }}
          </span>
          <div class="ml-auto flex gap-4">
            <button v-if="voice.srExists" class="icon-btn sm" :class="{ on: voice.handsFree }" @click="toggleHandsFree" title="Manos libres: diga «Jarvis, …»"><icon name="headphones" :size="16" /></button>
            <button v-if="voice.canSpeak" class="icon-btn sm" :class="{ on: store.settings.voice_enabled === '1' }" @click="toggleVoice"
              :title="store.settings.voice_enabled === '1' ? 'Silenciar a JARVIS' : 'Que JARVIS lea sus respuestas'">
              <icon :name="store.settings.voice_enabled === '1' ? 'volume-2' : 'volume-x'" :size="16" />
            </button>
            <button class="icon-btn sm" @click="chat.clear" title="Nueva conversación"><icon name="message-circle-plus" :size="16" /></button>
            <button v-if="!embedded" class="icon-btn sm" @click="$emit('close')" aria-label="Cerrar"><icon name="x" :size="16" /></button>
          </div>
        </div>
        <div class="chat-log" ref="log">
          <div v-if="!chat.messages.length && !chat.sending" class="chat-hello">
            <reactor v-if="!embedded" :size="96" @activate="chat.listen" />
            <div>
              <h2>{{ greeting }}</h2>
              <p class="muted small mt-4">Pídame lo que necesite: agendar, recordar, consultar su día o planear proyectos.</p>
            </div>
            <div class="suggest"><button v-for="s in suggestions" :key="s" @click="chat.send(s)">{{ s }}</button></div>
          </div>
          <div v-for="m in chat.messages" :key="m.id" class="msg" :class="m.role">
            <div v-if="m.role === 'assistant'" class="who"><icon name="circle-dot" :size="10" /> {{ name }}</div>
            <div class="bubble" v-html="rich(m.text)"></div>
            <div v-if="m.actions && m.actions.length" class="msg-actions">
              <span v-for="(a, i) in m.actions" :key="i" class="act" :class="{ del: /deleted/.test(a.type) }" @click="openRef(a)">
                <icon :name="actIcon(a)" :size="13" /> {{ a.label }}
              </span>
            </div>
            <div v-if="m.notice" class="notice"><icon name="info" :size="14" /> {{ m.notice }}</div>
          </div>
          <div v-if="chat.sending" class="msg assistant">
            <div class="who"><icon name="circle-dot" :size="10" /> {{ name }}</div>
            <div class="bubble typing"><i></i><i></i><i></i></div>
          </div>
        </div>
        <form class="chat-bar" @submit.prevent="submit">
          <button type="button" class="mic" :class="{ on: voice.listening }" @click="chat.listen" :title="voice.listening ? 'Escuchando… (toque para terminar)' : 'Hablar'" aria-label="Hablar">
            <icon :name="voice.canListen ? 'mic' : 'mic-off'" />
          </button>
          <textarea ref="box" class="textarea" rows="1" v-model="chat.draft" @keydown.enter.exact.prevent="submit" @input="autosize"
            :placeholder="voice.listening ? 'Escuchando…' : 'Escriba o hable con ' + name + '…'" maxlength="4000"></textarea>
          <button class="btn btn-primary" style="min-height:42px" :disabled="!chat.draft.trim() || chat.sending" aria-label="Enviar"><icon name="send" /></button>
        </form>
      </div>`,
  };
})();
