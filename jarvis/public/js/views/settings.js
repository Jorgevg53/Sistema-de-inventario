/* Ajustes: perfil, inteligencia (Claude), voz, agenda, seguridad y respaldos. */
(function () {
  'use strict';
  const { ref, reactive, computed, onMounted } = Vue;

  const TITLES = ['señor', 'señora', 'señorita', 'jefe', 'jefa', 'doctor', 'doctora', 'ingeniero', 'ingeniera', 'licenciado', 'licenciada'];
  const LANGS = [
    { id: 'es-MX', label: 'Español (México)' }, { id: 'es-US', label: 'Español (Estados Unidos)' }, { id: 'es-ES', label: 'Español (España)' },
    { id: 'es-AR', label: 'Español (Argentina)' }, { id: 'es-CO', label: 'Español (Colombia)' }, { id: 'es-CL', label: 'Español (Chile)' },
    { id: 'es-PE', label: 'Español (Perú)' }, { id: 'es-VE', label: 'Español (Venezuela)' },
  ];

  App.views.Settings = {
    setup() {
      const store = App.store;
      const s = store.settings;
      const f = reactive({
        user_name: s.user_name || '',
        title_mode: !s.user_title ? 'nombre' : TITLES.includes(s.user_title) ? s.user_title : 'otro',
        title_other: TITLES.includes(s.user_title) ? '' : s.user_title || '',
        assistant_name: s.assistant_name || 'JARVIS',
        model: s.model,
        voice_name: s.voice_name || '',
        voice_rate: Number(s.voice_rate) || 1,
        speech_lang: s.speech_lang || 'es-MX',
        work_start: s.work_start, work_end: s.work_end,
        default_duration: s.default_duration, default_reminder: s.default_reminder,
      });
      const key = ref('');
      const pwd = reactive({ current: '', next: '', again: '' });
      const busy = ref('');
      const testResult = ref(null);
      const notif = ref('Notification' in window ? Notification.permission : 'unsupported');
      const fileInput = ref(null);

      async function put(body, msg = 'Ajustes guardados') {
        const r = await App.api.put('/settings', body);
        store.settings = r;
        if (msg) App.toast(msg);
        return r;
      }
      async function saveProfile() {
        busy.value = 'profile';
        const title = f.title_mode === 'nombre' ? '' : f.title_mode === 'otro' ? f.title_other.trim() : f.title_mode;
        try { await put({ user_name: f.user_name, user_title: title, assistant_name: f.assistant_name }); } catch (e) { App.error(e); } finally { busy.value = ''; }
      }
      async function saveKey() {
        busy.value = 'key';
        try {
          await put({ api_key: key.value.trim() }, key.value.trim() ? 'Clave guardada: la inteligencia de Claude está activa' : 'Clave eliminada');
          key.value = '';
          testResult.value = null;
          if (store.settings.ai_enabled) test();
        } catch (e) { App.error(e); } finally { busy.value = ''; }
      }
      async function removeKey() {
        if (!(await App.confirm({ title: 'Quitar clave de Claude', message: 'JARVIS volverá al modo básico (entiende solo órdenes sencillas).', confirmText: 'Quitar', danger: true }))) return;
        key.value = '';
        saveKey();
      }
      async function saveModel() {
        try { await put({ model: f.model }, 'Modelo actualizado'); } catch (e) { App.error(e); }
      }
      async function test() {
        busy.value = 'test';
        testResult.value = null;
        try {
          const r = await App.api.post('/settings/test-ai');
          testResult.value = { ok: true, text: `Conexión correcta con ${r.name || r.model}.` };
        } catch (e) { testResult.value = { ok: false, text: e.message }; } finally { busy.value = ''; }
      }
      async function saveVoice() {
        busy.value = 'voice';
        try { await put({ voice_name: f.voice_name, voice_rate: f.voice_rate, speech_lang: f.speech_lang }); } catch (e) { App.error(e); } finally { busy.value = ''; }
      }
      async function toggleVoice(on) {
        try { await put({ voice_enabled: on }, on ? 'JARVIS leerá sus respuestas' : 'Voz desactivada'); } catch (e) { App.error(e); }
      }
      async function testVoice() {
        await saveVoice();
        const who = store.settings.user_title || (store.settings.user_name || '').split(' ')[0];
        App.voice.say(`A sus órdenes${who ? `, ${who}` : ''}. Todos los sistemas funcionan correctamente.`, { force: true });
      }
      async function askNotif() {
        if (!('Notification' in window)) return;
        notif.value = await Notification.requestPermission();
        if (notif.value === 'granted') new Notification('JARVIS', { body: 'Así le avisaré de sus recordatorios.' });
      }
      async function saveAgenda() {
        busy.value = 'agenda';
        try { await put({ work_start: f.work_start, work_end: f.work_end, default_duration: f.default_duration, default_reminder: f.default_reminder }); } catch (e) { App.error(e); } finally { busy.value = ''; }
      }
      async function savePassword(remove = false) {
        if (!remove && pwd.next !== pwd.again) return App.toast('Las contraseñas no coinciden.', { type: 'error' });
        if (remove && !(await App.confirm({ title: 'Quitar contraseña', message: 'JARVIS solo podrá usarse desde este equipo (ya no desde el celular u otras computadoras).', confirmText: 'Quitar', danger: true }))) return;
        busy.value = 'pwd';
        try {
          await put({ current_password: pwd.current, new_password: remove ? '' : pwd.next }, remove ? 'Contraseña eliminada' : 'Contraseña guardada');
          pwd.current = pwd.next = pwd.again = '';
          await App.loadStatus();
        } catch (e) { App.error(e); } finally { busy.value = ''; }
      }
      async function logout() {
        try { await App.api.post('/logout'); } catch { /* ya sin sesión */ }
        location.reload();
      }
      function download() {
        location.href = '/api/backup';
      }
      async function restore(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        let data;
        try { data = JSON.parse(await file.text()); } catch { return App.toast('El archivo no es un respaldo válido.', { type: 'error' }); }
        const ok = await App.confirm({
          title: 'Restaurar respaldo',
          message: `Se reemplazarán TODOS sus proyectos, tareas y eventos actuales por los del respaldo (${(data.projects || []).length} proyectos, ${(data.tasks || []).length} tareas, ${(data.events || []).length} eventos).\n\nLe recomendamos descargar primero un respaldo de lo actual.`,
          confirmText: 'Restaurar', danger: true,
        });
        if (!ok) return;
        try {
          await App.api.post('/backup', data);
          App.toast('Respaldo restaurado');
          await App.loadStatus();
          App.refresh();
        } catch (err) { App.error(err); }
      }
      async function clearChat() {
        if (!(await App.confirm({ title: 'Nueva conversación', message: 'JARVIS olvidará la conversación actual (sus datos no se borran).', confirmText: 'Empezar de nuevo' }))) return;
        await App.chat.clear();
        App.toast('Conversación reiniciada');
      }

      const voices = computed(() => App.voice.spanishVoices());
      const local = computed(() => store.status && store.status.auth && store.status.auth.local);
      return {
        store, f, key, pwd, busy, testResult, notif, fileInput, voices, local, titles: TITLES, langs: LANGS, voice: App.voice, secure: window.isSecureContext,
        saveProfile, saveKey, removeKey, saveModel, test, saveVoice, toggleVoice, testVoice, askNotif, saveAgenda, savePassword, logout, download, restore, clearChat,
      };
    },
    template: `
      <div>
        <div class="page-head"><div><h1>Ajustes</h1><div class="sub">Personalice a su asistente</div></div></div>
        <div class="settings-grid">
          <div class="panel">
            <div class="panel-head"><icon name="user" class="cyan" /><span class="upper">Perfil</span></div>
            <form class="panel-body col gap-12" @submit.prevent="saveProfile">
              <div class="field"><label>Su nombre</label><input class="input" v-model="f.user_name" placeholder="Ej. Jorge" maxlength="60" /></div>
              <div class="row">
                <div class="field"><label>¿Cómo quiere que le llame?</label>
                  <select class="select" v-model="f.title_mode">
                    <option v-for="t in titles" :key="t" :value="t">{{ t.charAt(0).toUpperCase() + t.slice(1) }}</option>
                    <option value="nombre">Por mi nombre</option><option value="otro">Otro…</option>
                  </select>
                </div>
                <div class="field" v-if="f.title_mode === 'otro'"><label>Tratamiento</label><input class="input" v-model="f.title_other" placeholder="Ej. capitán" maxlength="60" /></div>
              </div>
              <div class="field"><label>Nombre del asistente</label><input class="input" v-model="f.assistant_name" maxlength="60" /><span class="hint">También es la palabra para activarlo en modo manos libres.</span></div>
              <button class="btn btn-primary" style="align-self:flex-start" :disabled="busy === 'profile'"><icon name="check" /> Guardar</button>
            </form>
          </div>

          <div class="panel">
            <div class="panel-head"><icon name="brain-circuit" class="cyan" /><span class="upper">Inteligencia (Claude)</span>
              <span class="chip ml-auto" :class="store.settings.ai_enabled ? 'ok' : 'warn'">{{ store.settings.ai_enabled ? 'Activa' : 'Modo básico' }}</span>
            </div>
            <div class="panel-body col gap-12">
              <p class="small muted">Con una clave de la API de Claude, JARVIS conversa con libertad, entiende peticiones complejas («mueve todas mis citas del viernes al lunes») y planea proyectos completos. Sin clave funciona en modo básico, sin internet.</p>
              <div v-if="store.settings.api_key_from_env" class="small ok"><icon name="key-round" :size="14" /> Usando la clave de la variable ANTHROPIC_API_KEY.</div>
              <div v-else-if="store.settings.api_key_set" class="flex small"><icon name="key-round" :size="14" class="ok" /> Clave guardada <span class="mono dim">{{ store.settings.api_key_hint }}</span>
                <button class="btn btn-sm btn-ghost ml-auto" @click="removeKey">Quitar</button></div>
              <form class="field" @submit.prevent="saveKey">
                <label>{{ store.settings.api_key_set ? 'Reemplazar clave' : 'Clave de la API' }}</label>
                <div class="flex"><input class="input mono" type="password" v-model="key" placeholder="sk-ant-…" autocomplete="off" /><button class="btn" :disabled="!key.trim() || busy === 'key'">Guardar</button></div>
                <span class="hint">Consígala en <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Se guarda solo en este equipo. El uso de la API tiene costo según su consumo.</span>
              </form>
              <div class="field"><label>Modelo</label>
                <select class="select" v-model="f.model" @change="saveModel"><option v-for="m in store.settings.models" :key="m.id" :value="m.id">{{ m.label }}</option></select>
              </div>
              <div class="flex flex-wrap" v-if="store.settings.ai_enabled">
                <button class="btn btn-sm" @click="test" :disabled="busy === 'test'"><icon name="zap" :size="14" /> Probar conexión</button>
                <span v-if="testResult" class="small" :class="testResult.ok ? 'ok' : 'danger'">{{ testResult.text }}</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><icon name="volume-2" class="cyan" /><span class="upper">Voz y avisos</span></div>
            <div class="panel-body col gap-12">
              <label class="check"><input type="checkbox" :checked="store.settings.voice_enabled === '1'" @change="toggleVoice($event.target.checked)" :disabled="!voice.canSpeak" /> JARVIS lee sus respuestas en voz alta</label>
              <div class="row">
                <div class="field"><label>Voz</label>
                  <select class="select" v-model="f.voice_name"><option value="">Automática</option><option v-for="v in voices" :key="v.name" :value="v.name">{{ v.name }} ({{ v.lang }})</option></select>
                </div>
                <div class="field"><label>Velocidad: {{ f.voice_rate.toFixed(1) }}×</label><input type="range" min="0.6" max="1.6" step="0.1" v-model.number="f.voice_rate" /></div>
              </div>
              <div class="field"><label>Idioma del micrófono</label>
                <select class="select" v-model="f.speech_lang"><option v-for="l in langs" :key="l.id" :value="l.id">{{ l.label }}</option></select>
                <span class="hint" v-if="!voice.srExists">Este navegador no permite dictar por voz: use Chrome o Edge.</span>
                <span class="hint warn" v-else-if="!secure">El micrófono solo funciona en http://localhost o con HTTPS (vea la guía de JARVIS para usarlo desde el celular).</span>
              </div>
              <div class="flex flex-wrap">
                <button class="btn btn-sm" @click="saveVoice" :disabled="busy === 'voice'"><icon name="check" :size="14" /> Guardar</button>
                <button class="btn btn-sm" @click="testVoice" :disabled="!voice.canSpeak"><icon name="play" :size="14" /> Probar voz</button>
                <button class="btn btn-sm" v-if="notif !== 'unsupported' && notif !== 'granted'" @click="askNotif"><icon name="bell" :size="14" /> Permitir notificaciones</button>
                <span v-if="notif === 'granted'" class="small ok"><icon name="bell-ring" :size="14" /> Notificaciones activas</span>
              </div>
              <p class="tiny dim">Los recordatorios suenan mientras JARVIS esté abierto en el navegador (puede dejarlo en una pestaña).</p>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><icon name="calendar" class="cyan" /><span class="upper">Agenda</span></div>
            <form class="panel-body col gap-12" @submit.prevent="saveAgenda">
              <div class="row">
                <div class="field"><label>Inicio de jornada</label><input class="input" type="time" v-model="f.work_start" /></div>
                <div class="field"><label>Fin de jornada</label><input class="input" type="time" v-model="f.work_end" /></div>
              </div>
              <div class="row">
                <div class="field"><label>Duración de eventos</label>
                  <select class="select" v-model="f.default_duration"><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 hora</option><option value="90">1 h 30 min</option><option value="120">2 horas</option></select>
                </div>
                <div class="field"><label>Aviso predeterminado</label>
                  <select class="select" v-model="f.default_reminder"><option value="">Sin aviso</option><option value="0">A la hora</option><option value="5">5 min antes</option><option value="10">10 min antes</option><option value="15">15 min antes</option><option value="30">30 min antes</option><option value="60">1 hora antes</option></select>
                </div>
              </div>
              <span class="hint small dim">La jornada se usa para buscar huecos libres.</span>
              <button class="btn btn-primary" style="align-self:flex-start" :disabled="busy === 'agenda'"><icon name="check" /> Guardar</button>
            </form>
          </div>

          <div class="panel">
            <div class="panel-head"><icon name="shield" class="cyan" /><span class="upper">Seguridad y acceso</span></div>
            <div class="panel-body col gap-12">
              <p class="small muted" v-if="!store.settings.password_set">Sin contraseña, JARVIS solo se puede usar desde este equipo. Defina una para entrar desde su celular u otra computadora de la misma red.</p>
              <p class="small muted" v-else>JARVIS pide contraseña para entrar. Puede usarlo desde otros dispositivos de su red.</p>
              <p v-if="store.settings.password_from_env" class="small warn">La contraseña está definida con la variable JARVIS_CLAVE.</p>
              <form v-else class="col gap-12" @submit.prevent="savePassword(false)">
                <div class="field" v-if="store.settings.password_set"><label>Contraseña actual</label><input class="input" type="password" v-model="pwd.current" autocomplete="current-password" /></div>
                <div class="row">
                  <div class="field"><label>Nueva contraseña</label><input class="input" type="password" v-model="pwd.next" minlength="6" autocomplete="new-password" /></div>
                  <div class="field"><label>Repetir</label><input class="input" type="password" v-model="pwd.again" autocomplete="new-password" /></div>
                </div>
                <div class="flex flex-wrap">
                  <button class="btn btn-primary" :disabled="pwd.next.length < 6 || busy === 'pwd'"><icon name="lock" /> {{ store.settings.password_set ? 'Cambiar' : 'Definir' }} contraseña</button>
                  <button v-if="store.settings.password_set && local" type="button" class="btn btn-ghost" @click="savePassword(true)">Quitar contraseña</button>
                </div>
              </form>
              <button v-if="store.settings.password_set" class="btn btn-sm" style="align-self:flex-start" @click="logout"><icon name="log-out" :size="14" /> Cerrar sesión</button>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><icon name="download" class="cyan" /><span class="upper">Respaldo</span></div>
            <div class="panel-body col gap-12">
              <p class="small muted">Descargue un archivo con todos sus proyectos, tareas, notas y eventos. Guárdelo en una USB o en la nube. (La clave de Claude y la contraseña no se incluyen.)</p>
              <div class="flex flex-wrap">
                <button class="btn" @click="download"><icon name="download" /> Descargar respaldo</button>
                <button class="btn" @click="fileInput.click()"><icon name="upload" /> Restaurar…</button>
                <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="restore" />
              </div>
              <button class="btn btn-sm btn-ghost" style="align-self:flex-start" @click="clearChat"><icon name="rotate-ccw" :size="14" /> Reiniciar conversación con JARVIS</button>
            </div>
          </div>
        </div>
      </div>`,
  };
})();
