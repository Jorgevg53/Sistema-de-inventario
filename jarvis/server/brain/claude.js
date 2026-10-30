'use strict';
/* Inteligencia de JARVIS con Claude (Anthropic): conversación libre que usa las herramientas de agenda y proyectos. */
const Anthropic = require('@anthropic-ai/sdk').default;
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');
const { ToolError } = require('@anthropic-ai/sdk/lib/tools/ToolError');
const db = require('../db');
const D = require('../dates');
const summary = require('../summary');
const { TOOLS } = require('./tools');

const MODELS = {
  'claude-opus-5-5': 'Claude Opus 5.5 — el más inteligente (recomendado)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 — equilibrado y más económico',
  'claude-haiku-5-5': 'Claude Haiku 5.5 — el más rápido y económico',
};
const DEFAULT_MODEL = 'claude-opus-5-5';
// Si Claude rechaza una petición por sus filtros de seguridad, la API la repite en otro modelo adecuado.
// Haiku 5.5 no tiene esta opción.
const SERVER_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const HISTORY_MESSAGES = 16;
const MAX_ITERATIONS = 12;

function apiKey() {
  return (db.getSetting('anthropic_api_key') || '').trim() || process.env.ANTHROPIC_API_KEY || '';
}

const enabled = () => !!apiKey();

function model() {
  const m = db.getSetting('model');
  return MODELS[m] ? m : DEFAULT_MODEL;
}

let clientFactory = (key) => new Anthropic({ apiKey: key });
/** Solo para pruebas: permite usar un cliente que apunta a un servidor falso. */
function setClientFactory(fn) {
  clientFactory = fn || ((key) => new Anthropic({ apiKey: key }));
}

function systemPrompt() {
  const name = db.getSetting('assistant_name') || 'JARVIS';
  const userName = (db.getSetting('user_name') || '').trim();
  const title = (db.getSetting('user_title') || '').trim();
  const who = [userName && `Su nombre es ${userName}.`, title && `Llámalo «${title}».`].filter(Boolean).join(' ');
  return `Eres ${name}, el asistente personal del usuario: inteligente, eficiente, discreto y cortés, con un toque sutil de humor de mayordomo británico. Tu trabajo es gestionar su agenda (eventos, citas, recordatorios) y ayudarle a sacar adelante sus proyectos (proyectos, tareas y notas). ${who}

Cómo trabajas:
- Hablas siempre en español y tratas al usuario de «usted».
- Tus respuestas suelen leerse en voz alta: sé breve (de una a cuatro frases), sin tablas, encabezados ni bloques de código. Usa una lista corta solo si hay más de tres elementos. Di las horas en formato de 12 horas («5:00 p. m.») y las fechas de forma natural («mañana», «el viernes 6 de noviembre»).
- Todo lo que sabes de la agenda y los proyectos sale de tus herramientas. Consulta antes de afirmar qué tiene programado el usuario y nunca inventes ids, fechas ni datos.
- Cada mensaje del usuario empieza con un bloque <contexto> con la fecha y hora actuales: úsalo para interpretar «hoy», «mañana», «el lunes», «en dos horas», etc. Las herramientas usan fechas AAAA-MM-DD y horas AAAA-MM-DDTHH:MM en hora local.

Agenda:
- Para crear un evento necesitas al menos qué y cuándo. Si falta la hora de algo que normalmente la tiene, pregunta; si es de todo el día (cumpleaños, vacaciones, viajes), usa all_day. Si no dicen duración, omítela.
- «Recuérdame X a las Y» es un evento con reminder_min 0. «Recuérdame X» sin hora concreta es una tarea (con fecha si la dan).
- Si al crear o mover un evento la herramienta reporta conflictos de horario, menciónalos y ofrece una alternativa (find_free_time sirve para eso).
- Para modificar o eliminar algo, primero localízalo (get_agenda, search o list_tasks) para tener su id. Si hay varias coincidencias razonables, pregunta cuál. Si un evento se repite y el usuario habla de una sola ocasión («cancela la junta de este lunes»), usa occurrence_date.

Proyectos:
- Cuando pidan planear o desglosar un proyecto, propone tareas concretas y accionables con fechas realistas hasta la fecha límite y créalas (create_project con tasks, o create_tasks). Después resume el plan en pocas frases.
- Al informar el estado de un proyecto da el porcentaje de avance, lo vencido y el siguiente paso recomendado.
- Marca una tarea como terminada con update_task (status «hecha»); elimínala solo si el usuario lo pide.
- Antes de borrar varias cosas a la vez, confirma con el usuario.

Otros:
- No tienes acceso a internet, correo ni otras aplicaciones. Si te piden algo fuera de tu alcance, dilo en una frase y ofrece lo que sí puedes hacer.
- Después de actuar, confirma en una frase lo que hiciste, por ejemplo: «Listo: agendé “Dentista” para mañana a las 5:00 p. m., con aviso 15 minutos antes.»`;
}

/** Bloque de contexto que acompaña cada mensaje (fecha y hora actuales y preferencias). */
function contextBlock(now = new Date()) {
  const wall = D.nowWall(now);
  const start = db.getSetting('work_start');
  const end = db.getSetting('work_end');
  const rem = db.getSetting('default_reminder');
  return `<contexto>Ahora: ${D.longDate(wall)}, ${D.humanTime(wall.slice(11))} (${wall}). Horario laboral: ${start}–${end}. Aviso predeterminado de eventos: ${rem} min.</contexto>`;
}

/** Historial reciente (lo mismo que se envió antes, para aprovechar la caché de la API). */
function history() {
  const startId = Number(db.getSetting('chat_start_id')) || 0;
  const rows = db.all(
    'SELECT role, text, api_content FROM chat_messages WHERE id > ? ORDER BY id DESC LIMIT ?', startId, HISTORY_MESSAGES,
  ).reverse();
  while (rows.length && rows[0].role !== 'user') rows.shift();
  return rows.map((r) => {
    let content = null;
    try { content = r.api_content ? JSON.parse(r.api_content) : null; } catch { /* se usa el texto */ }
    return { role: r.role, content: content || r.text || '…' };
  });
}

function runnableTools(ctx) {
  return TOOLS.map((t) =>
    betaTool({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
      run: async (input) => {
        try {
          return JSON.stringify(await t.run(input || {}, ctx));
        } catch (e) {
          throw new ToolError(`Error: ${e.message}`);
        }
      },
    }),
  );
}

/**
 * Responde un mensaje del usuario. Devuelve { reply, actions, userContent, stopReason }.
 * Lanza los errores de la API (Anthropic.APIError y derivados) para que quien llama decida qué hacer.
 */
async function respond(message) {
  const ctx = { actions: [] };
  const userContent = [
    { type: 'text', text: contextBlock() },
    { type: 'text', text: message },
  ];
  const m = model();
  const params = {
    model: m,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    system: systemPrompt(),
    tools: runnableTools(ctx),
    messages: [...history(), { role: 'user', content: userContent }],
    max_iterations: MAX_ITERATIONS,
  };
  if (SERVER_FALLBACK.has(m)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  const client = clientFactory(apiKey());
  let final;
  try {
    final = await client.beta.messages.toolRunner(params);
  } catch (e) {
    e.actions = ctx.actions; // lo que alcanzó a hacer antes del error
    throw e;
  }

  const who = summary.address();
  let reply = (final.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (final.stop_reason === 'refusal') {
    reply = `Lo siento${who ? `, ${who}` : ''}, no puedo ayudarle con eso.`;
  } else if (final.stop_reason === 'max_tokens') {
    reply = `${reply}\n\n(La respuesta quedó incompleta.)`.trim();
  } else if (final.stop_reason === 'tool_use') {
    reply = reply || 'Realicé varias acciones pero no alcancé a terminar. ¿Quiere que continúe?';
  }
  if (!reply) reply = ctx.actions.length ? 'Listo.' : 'De acuerdo.';
  return { reply, actions: ctx.actions, userContent, stopReason: final.stop_reason, model: final.model || m };
}

module.exports = { MODELS, DEFAULT_MODEL, enabled, model, respond, systemPrompt, contextBlock, history, setClientFactory, Anthropic };
