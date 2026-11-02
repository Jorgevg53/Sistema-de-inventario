'use strict';
const fs = require('node:fs');
const path = require('node:path');

// node:sqlite está disponible sin opciones extra a partir de Node.js 22.13 / 23.4.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13) || (major === 23 && minor < 4)) {
  console.error(`\n  JARVIS necesita Node.js 22.13 o superior (tienes ${process.versions.node}).`);
  console.error('  Descarga la versión LTS más reciente en https://nodejs.org\n');
  process.exit(1);
}
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'jarvis.db');

// Las fechas se guardan como texto en hora LOCAL de pared: 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:MM'.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#22d3ee',
  status      TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','en_pausa','completado','cancelado')),
  priority    TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','baja')),
  start_date  TEXT,
  due_date    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  notes        TEXT,
  project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_progreso','hecha')),
  priority     TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','baja')),
  due_date     TEXT,
  due_time     TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  start        TEXT NOT NULL,
  end          TEXT NOT NULL,
  all_day      INTEGER NOT NULL DEFAULT 0,
  location     TEXT,
  notes        TEXT,
  category     TEXT NOT NULL DEFAULT 'general',
  reminder_min INTEGER,
  repeat       TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none','daily','weekdays','weekly','monthly','yearly')),
  repeat_until TEXT,
  exceptions   TEXT NOT NULL DEFAULT '[]',
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start);

CREATE TABLE IF NOT EXISTS project_notes (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Conversación con JARVIS. api_content guarda el mensaje tal como se envió a Claude (JSON) para repetirlo igual.
CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  text        TEXT NOT NULL,
  api_content TEXT,
  actions     TEXT,
  mode        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`;

const DEFAULT_SETTINGS = {
  user_name: '',
  user_title: 'señor',
  assistant_name: 'JARVIS',
  model: 'claude-opus-5-5',
  anthropic_api_key: '',
  password_hash: '',
  voice_enabled: '1',
  voice_name: '',
  voice_rate: '1',
  speech_lang: 'es-MX',
  work_start: '09:00',
  work_end: '19:00',
  default_duration: '60',
  default_reminder: '15',
  chat_start_id: '0',
};

let db = null;

function open() {
  if (db) return db;
  if (DB_FILE !== ':memory:') fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insert.run(k, v);
  return db;
}

function close() {
  if (db) db.close();
  db = null;
}

function conn() {
  if (!db) open();
  return db;
}

const all = (sql, ...params) => conn().prepare(sql).all(...params);
const get = (sql, ...params) => conn().prepare(sql).get(...params);
const run = (sql, ...params) => conn().prepare(sql).run(...params);

/** Ejecuta fn dentro de una transacción (todo o nada). */
function transaction(fn) {
  const c = conn();
  c.exec('BEGIN');
  try {
    const result = fn();
    c.exec('COMMIT');
    return result;
  } catch (e) {
    c.exec('ROLLBACK');
    throw e;
  }
}

function getSetting(key) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value ?? ''));
}

function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of all('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}

module.exports = { open, close, all, get, run, transaction, getSetting, setSetting, allSettings, DB_FILE, DATA_DIR, DEFAULT_SETTINGS };
