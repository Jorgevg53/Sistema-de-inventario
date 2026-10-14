'use strict';
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { HttpError, bad, notFound, str, nowLocal } = require('../util');
const { version } = require('../../package.json');

const publicRouter = express.Router();
const router = express.Router();

// Limitador de intentos fallidos de inicio de sesión, en ventanas de 10 minutos:
// 8 por usuario desde la misma IP y 30 por IP con cualquier usuario (así no se pueden probar
// muchos usuarios ni llenar la tabla para borrar los bloqueos).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_USER = 8;
const MAX_PER_IP = 30;
const MAX_ENTRIES = 10000;
const attempts = new Map(); // clave → { first, count, limit }

function failures(key, now) {
  const rec = attempts.get(key);
  return rec && now - rec.first <= WINDOW_MS ? rec.count : 0;
}

function tooManyAttempts(userKey, ipKey) {
  const now = Date.now();
  return failures(userKey, now) >= MAX_PER_USER || failures(ipKey, now) >= MAX_PER_IP;
}

// Mantiene la tabla acotada sin soltar los bloqueos vigentes: primero quita lo vencido, luego lo más
// antiguo que no esté bloqueando y, solo si aún no alcanza, lo más antiguo (el Map guarda el orden).
function makeRoom(now) {
  if (attempts.size < MAX_ENTRIES) return;
  for (const [k, r] of attempts) if (now - r.first > WINDOW_MS) attempts.delete(k);
  for (const [k, r] of attempts) {
    if (attempts.size < MAX_ENTRIES) return;
    if (r.count < r.limit) attempts.delete(k);
  }
  for (const k of attempts.keys()) {
    if (attempts.size < MAX_ENTRIES) return;
    attempts.delete(k);
  }
}

function registerFail(userKey, ipKey) {
  const now = Date.now();
  makeRoom(now);
  for (const [key, limit] of [[userKey, MAX_PER_USER], [ipKey, MAX_PER_IP]]) {
    const rec = attempts.get(key);
    if (rec && now - rec.first <= WINDOW_MS) rec.count++;
    else {
      attempts.delete(key);
      attempts.set(key, { first: now, count: 1, limit });
    }
  }
}

// Estado del servicio para monitoreo (Docker, balanceadores, uptime). No requiere sesión.
publicRouter.get('/health', (req, res) => {
  try {
    db.get('SELECT 1 AS ok');
  } catch {
    return res.status(503).json({ ok: false });
  }
  res.json({ ok: true, version, time: nowLocal() });
});

// Datos mínimos de la tienda para la pantalla de inicio de sesión.
publicRouter.get('/public/settings', (req, res) => {
  const s = db.getSettings();
  res.json({ store_name: s.store_name, store_slogan: s.store_slogan, currency_symbol: s.currency_symbol, locale: s.locale });
});

// Sin sesión solo se aceptan cuerpos pequeños; el JSON grande (imágenes, CSV) se lee después de requireAuth.
publicRouter.post('/auth/login', express.json({ limit: '10kb' }), (req, res) => {
  const body = req.body || {};
  const username = str(body.username);
  const password = String(body.password || '');
  if (!username || !password) throw bad('Escribe tu usuario y contraseña.');
  const userKey = `u|${username.toLowerCase().slice(0, 64)}|${req.ip}`;
  const ipKey = `ip|${req.ip}`;
  if (tooManyAttempts(userKey, ipKey)) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');

  const user = db.get('SELECT * FROM users WHERE username = ? AND active = 1', username);
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    registerFail(userKey, ipKey);
    throw new HttpError(401, 'Usuario o contraseña incorrectos.');
  }
  attempts.delete(userKey);
  const token = auth.createSession(user.id);
  auth.setSessionCookie(req, res, token);
  res.json({ user: auth.publicUser(user), token });
});

router.post('/auth/logout', (req, res) => {
  db.run('DELETE FROM sessions WHERE token = ?', req.token);
  auth.clearSessionCookie(req, res);
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  res.json({ user: req.user, settings: db.getSettings() });
});

router.post('/auth/password', (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.password || '');
  if (next.length < 6) throw bad('La nueva contraseña debe tener al menos 6 caracteres.');
  const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!auth.verifyPassword(current, user.password_hash)) throw bad('La contraseña actual no es correcta.');
  db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', auth.hashPassword(next), user.id);
  db.run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', user.id, req.token);
  res.json({ ok: true });
});

// ---------- Usuarios (solo administrador) ----------

router.get('/users', auth.can('settings', 'cash.all', 'reports'), (req, res) => {
  const rows = db.all('SELECT * FROM users ORDER BY active DESC, name');
  res.json(rows.map(auth.publicUser));
});

function validateRole(role) {
  if (!auth.ROLE_PERMISSIONS[role]) throw bad('Rol no válido.');
  return role;
}

router.post('/users', auth.can('settings'), (req, res) => {
  const name = str(req.body.name);
  const username = str(req.body.username);
  const password = String(req.body.password || '');
  const role = validateRole(req.body.role || 'cajero');
  if (!name || !username) throw bad('Nombre y usuario son obligatorios.');
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) throw bad('El usuario debe tener 3 a 30 caracteres (letras, números, punto o guion).');
  if (password.length < 6) throw bad('La contraseña debe tener al menos 6 caracteres.');
  if (db.get('SELECT id FROM users WHERE username = ?', username)) throw bad('Ese nombre de usuario ya existe.');
  const r = db.run(
    'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)',
    name, username, auth.hashPassword(password), role,
  );
  res.status(201).json(auth.publicUser(db.get('SELECT * FROM users WHERE id = ?', r.lastInsertRowid)));
});

router.put('/users/:id', auth.can('settings'), (req, res) => {
  const user = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!user) throw notFound('Usuario no encontrado.');
  const name = str(req.body.name) || user.name;
  const role = req.body.role ? validateRole(req.body.role) : user.role;
  const active = req.body.active === undefined ? user.active : (req.body.active ? 1 : 0);

  if (user.role === 'admin' && (role !== 'admin' || !active)) {
    const { n } = db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", user.id);
    if (n === 0) throw bad('Debe existir al menos un administrador activo.');
  }
  if (req.body.password && String(req.body.password).length < 6) throw bad('La contraseña debe tener al menos 6 caracteres.');
  db.tx(() => {
    db.run('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', name, role, active, user.id);
    if (req.body.password) {
      db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', auth.hashPassword(req.body.password), user.id);
    }
    if (!active) db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
  });
  res.json(auth.publicUser(db.get('SELECT * FROM users WHERE id = ?', user.id)));
});

// ---------- Configuración ----------

const EDITABLE_SETTINGS = Object.keys(db.DEFAULT_SETTINGS);

router.get('/settings', (req, res) => {
  res.json(db.getSettings());
});

router.put('/settings', auth.can('settings'), (req, res) => {
  db.tx(() => {
    for (const key of EDITABLE_SETTINGS) {
      if (req.body[key] !== undefined) {
        db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(req.body[key] ?? ''));
      }
    }
  });
  res.json(db.getSettings());
});

module.exports = { publicRouter, router };
