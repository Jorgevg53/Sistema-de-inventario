'use strict';
/* Conversación con JARVIS: usa Claude si hay clave y, si no (o si falla la conexión), el modo básico. */
const db = require('../db');
const claude = require('./claude');
const local = require('./local');
const { bad } = require('../util');

function persist(text, userContent, reply, actions, mode) {
  db.transaction(() => {
    db.run('INSERT INTO chat_messages (role, text, api_content, mode) VALUES (?, ?, ?, ?)', 'user', text, JSON.stringify(userContent), mode);
    db.run(
      'INSERT INTO chat_messages (role, text, api_content, actions, mode) VALUES (?, ?, ?, ?, ?)',
      'assistant', reply, JSON.stringify([{ type: 'text', text: reply }]), JSON.stringify(actions || []), mode,
    );
  });
}

/** Explica en español un error de la API de Claude (o null si no es un error de la API). */
function describe(e) {
  const A = claude.Anthropic;
  if (e instanceof A.AuthenticationError) return 'La clave de Claude no es válida. Revísela en Ajustes; mientras tanto respondo en modo básico.';
  if (e instanceof A.PermissionDeniedError) return 'Su clave de Claude no tiene permiso para usar este modelo. Revise su cuenta o elija otro modelo en Ajustes.';
  if (e instanceof A.NotFoundError) return `El modelo ${claude.model()} no está disponible para su cuenta. Elija otro en Ajustes.`;
  if (e instanceof A.RateLimitError) return 'Claude recibió demasiadas solicitudes; respondo en modo básico por ahora.';
  if (e instanceof A.APIConnectionError) return 'No hay conexión con Claude (revise el internet); respondo en modo básico.';
  if (e instanceof A.BadRequestError) return `Claude rechazó la solicitud: ${e.message}`;
  if (e instanceof A.APIError) return 'Claude no está disponible en este momento; respondo en modo básico.';
  return null;
}

async function chat(message) {
  const text = String(message ?? '').trim().slice(0, 4000);
  if (!text) throw bad('Escribe un mensaje.');
  let notice = null;
  if (claude.enabled()) {
    try {
      const r = await claude.respond(text);
      persist(text, r.userContent, r.reply, r.actions, 'ia');
      return { reply: r.reply, actions: r.actions, mode: 'ia', model: r.model };
    } catch (e) {
      notice = describe(e);
      if (!notice) {
        console.error(e);
        notice = 'Ocurrió un error con la inteligencia artificial; respondo en modo básico.';
      }
      // Si ya hizo cambios antes de fallar, no se repite la orden en modo básico (quedaría duplicada).
      if (e.actions && e.actions.length) {
        const reply = `Hice ${e.actions.length === 1 ? 'un cambio' : `${e.actions.length} cambios`}, pero se interrumpió la conexión antes de terminar. Revise el resultado.`;
        persist(text, [{ type: 'text', text: claude.contextBlock() }, { type: 'text', text }], reply, e.actions, 'ia');
        return { reply, actions: e.actions, mode: 'ia', notice };
      }
    }
  }
  const r = local.respond(text);
  persist(text, [{ type: 'text', text: claude.contextBlock() }, { type: 'text', text }], r.reply, r.actions, 'basico');
  return { reply: r.reply, actions: r.actions, mode: 'basico', notice };
}

function historyForUI(limit = 60) {
  const startId = Number(db.getSetting('chat_start_id')) || 0;
  return db
    .all('SELECT id, role, text, actions, mode, created_at FROM chat_messages WHERE id > ? ORDER BY id DESC LIMIT ?', startId, limit)
    .reverse()
    .map((m) => {
      let actions = [];
      try { actions = m.actions ? JSON.parse(m.actions) : []; } catch { /* sin acciones */ }
      return { ...m, actions };
    });
}

function newConversation() {
  const row = db.get('SELECT MAX(id) AS id FROM chat_messages');
  db.setSetting('chat_start_id', row.id || 0);
  local.resetPending();
}

module.exports = { chat, historyForUI, newConversation, describe };
