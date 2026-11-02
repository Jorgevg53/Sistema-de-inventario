/* Voz de JARVIS: lectura en voz alta (speechSynthesis) y dictado por micrófono (SpeechRecognition). */
(function () {
  'use strict';
  const store = App.store;
  const synth = window.speechSynthesis || null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const V = (App.voice = Vue.reactive({
    canSpeak: !!synth,
    // El micrófono solo funciona en contextos seguros: http://localhost o https://.
    canListen: !!SR && window.isSecureContext,
    srExists: !!SR,
    voices: [],
    listening: false,
    handsFree: false,
  }));

  function loadVoices() {
    V.voices = synth ? synth.getVoices().map((v) => ({ name: v.name, lang: v.lang, local: v.localService })) : [];
  }
  if (synth) {
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
  }

  V.spanishVoices = () => V.voices.filter((v) => /^es([-_]|$)/i.test(v.lang));

  function pickVoice() {
    if (!synth) return null;
    const all = synth.getVoices().filter((v) => /^es([-_]|$)/i.test(v.lang));
    const name = store.settings.voice_name;
    const lang = (store.settings.speech_lang || 'es-MX').toLowerCase();
    return all.find((v) => v.name === name)
      || all.find((v) => v.lang.replace('_', '-').toLowerCase() === lang && /natural|online|google|neural/i.test(v.name))
      || all.find((v) => v.lang.replace('_', '-').toLowerCase() === lang)
      || all.find((v) => /natural|online|google|neural/i.test(v.name))
      || all[0] || null;
  }

  /** Convierte el texto a algo que suene natural: "5:00 p. m." → "5 de la tarde", sin viñetas ni símbolos. */
  function speakable(text) {
    return String(text || '')
      .replace(/\*\*/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/(\d{1,2}):(\d{2})\s*([ap])\.\s?m\./gi, (_, h, m, ap) => {
        const hh = Number(h);
        const mm = m === '00' ? '' : m === '30' ? ' y media' : m === '15' ? ' y cuarto' : `:${m}`;
        let part = 'de la mañana';
        if (ap.toLowerCase() === 'p') part = hh === 12 ? 'del mediodía' : hh <= 7 ? 'de la tarde' : 'de la noche';
        return `${hh}${mm} ${part}`;
      })
      .replace(/[«»“”"]/g, '')
      .replace(/^\s*[•\-*]\s*/gm, '')
      .replace(/\n+/g, '. ')
      .replace(/\s*·\s*/g, ', ')
      .replace(/\(([^)]*)\)/g, ', $1,')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s+([,.])/g, '$1')
      .replace(/\.\s*\./g, '.')
      .trim();
  }

  /** Lee un texto en voz alta. Se divide en frases porque algunos navegadores cortan textos largos. */
  V.say = (text, { force = false } = {}) => {
    if (!synth || (!force && store.settings.voice_enabled !== '1')) return;
    synth.cancel();
    const voice = pickVoice();
    const chunks = speakable(text).match(/[^.!?;:]+[.!?;:]*/g) || [];
    if (!chunks.length) return;
    pauseHandsFree();
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk.trim());
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : store.settings.speech_lang || 'es-MX';
      u.rate = Number(store.settings.voice_rate) || 1;
      u.pitch = 0.95;
      if (i === 0) u.onstart = () => { store.voiceState = 'speaking'; };
      if (i === chunks.length - 1) {
        u.onend = u.onerror = () => {
          if (store.voiceState === 'speaking') store.voiceState = 'idle';
          resumeHandsFree();
        };
      }
      synth.speak(u);
    });
  };

  V.stop = () => {
    if (synth) synth.cancel();
    if (store.voiceState === 'speaking') store.voiceState = 'idle';
  };

  V.speaking = () => !!synth && synth.speaking;

  function micError(e) {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      App.toast('Permita el uso del micrófono en el navegador para hablar con JARVIS.', { type: 'error' });
    } else if (e.error === 'network') {
      App.toast('El dictado por voz de este navegador necesita internet.', { type: 'error' });
    } else if (e.error === 'audio-capture') {
      App.toast('No se encontró un micrófono.', { type: 'error' });
    }
  }

  function explainNoMic() {
    if (!V.srExists) App.toast('Este navegador no permite dictar por voz. Use Chrome o Edge.', { type: 'error' });
    else App.toast('El micrófono solo funciona en http://localhost o con HTTPS (ver la guía de JARVIS).', { type: 'error' });
  }

  // ---------------------------------------------------------------------------
  // Dictado (presionar para hablar)
  // ---------------------------------------------------------------------------
  let rec = null;
  V.listen = ({ onInterim, onFinal } = {}) => {
    if (!V.canListen) return explainNoMic();
    if (V.listening) return V.stopListening();
    V.stop();
    pauseHandsFree();
    rec = new SR();
    rec.lang = store.settings.speech_lang || 'es-MX';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (onInterim) onInterim(`${finalText} ${interim}`.trim());
    };
    rec.onerror = micError;
    rec.onend = () => {
      V.listening = false;
      if (store.voiceState === 'listening') store.voiceState = 'idle';
      rec = null;
      if (onFinal) onFinal(finalText.trim());
      resumeHandsFree();
    };
    try {
      rec.start();
      V.listening = true;
      store.voiceState = 'listening';
    } catch (e) {
      V.listening = false;
    }
  };

  V.stopListening = () => {
    if (rec) rec.stop();
  };

  // ---------------------------------------------------------------------------
  // Manos libres: escucha continuamente y responde cuando oye "Jarvis, …"
  // ---------------------------------------------------------------------------
  let hf = null;
  let hfHandler = null;
  let hfPaused = false;
  let awaiting = false;

  function wakeRegex() {
    const name = (store.settings.assistant_name || 'JARVIS').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/gi, '').trim();
    const alts = ['jarvis', 'yarvis', 'jarbis', 'harvis', 'yervis', name].filter(Boolean).map((s) => s.toLowerCase());
    return new RegExp(`(?:^|\\s)(?:oye\\s+|ok\\s+|hey\\s+)?(?:${[...new Set(alts)].join('|')})\\b[,.:!]?\\s*(.*)$`, 'i');
  }

  function startHF() {
    if (!V.handsFree || hf || hfPaused) return;
    hf = new SR();
    hf.lang = store.settings.speech_lang || 'es-MX';
    hf.continuous = true;
    hf.interimResults = false;
    hf.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const said = e.results[i][0].transcript.trim();
        const plain = said.normalize('NFD').replace(/[̀-ͯ]/g, '');
        const m = plain.match(wakeRegex());
        if (m) {
          const command = said.slice(said.length - m[1].length).trim();
          if (command) hfHandler && hfHandler(command);
          else {
            awaiting = true;
            V.say(`¿Sí${store.settings.user_title ? `, ${store.settings.user_title}` : ''}?`);
          }
        } else if (awaiting && said) {
          awaiting = false;
          hfHandler && hfHandler(said);
        }
      }
    };
    hf.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        V.handsFree = false;
        micError(e);
      }
    };
    hf.onend = () => {
      hf = null;
      if (V.handsFree && !hfPaused) setTimeout(startHF, 400);
    };
    try { hf.start(); } catch { hf = null; }
  }

  function pauseHandsFree() {
    if (!V.handsFree) return;
    hfPaused = true;
    if (hf) { try { hf.abort(); } catch { /* ya detenido */ } }
  }
  function resumeHandsFree() {
    if (!V.handsFree || V.listening || (synth && synth.speaking)) return;
    hfPaused = false;
    setTimeout(startHF, 300);
  }

  V.setHandsFree = (on, handler) => {
    if (on && !V.canListen) return explainNoMic();
    V.handsFree = !!on;
    hfHandler = handler || hfHandler;
    awaiting = false;
    if (on) {
      hfPaused = false;
      startHF();
    } else if (hf) {
      try { hf.abort(); } catch { /* ya detenido */ }
      hf = null;
    }
  };

  V.speakable = speakable;
})();
