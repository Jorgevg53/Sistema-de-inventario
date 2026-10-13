'use strict';
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { HttpError, bad, notFound, str } = require('../util');

const publicRouter = express.Router();
const router = express.Router();

// Limitador simple de intentos de inicio de sesión (por usuario + IP).
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > 10 * 60 * 1000) return false;
  return rec.count >= 8;
}
function registerFail(key) {
  const now = Date.now();
  if (attempts.size > 1000) attempts.clear();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > 10 * 60 * 1000) attempts.set(key, { first: now, count: 1 });
  else rec.count++;
}

// Datos mínimos de la tienda para la pantalla de inicio de sesión.
publicRouter.get('/public/settings', (req, res) => {
  const s = db.getSettings();
  res.json({ store_name: s.store_name, store_slogan: s.store_slogan, currency_symbol: s.currency_symbol, locale: s.locale });
});

publicRouter.post('/auth/login', (req, res) => {
  const username = str(req.body.username);
  const password = String(req.body.password || '');
  if (!username || !password) throw bad('Escribe tu usuario y contraseña.');
  const key = `${username.toLowerCase()}|${req.ip}`;
  if (tooManyAttempts(key)) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');

  const user = db.get('SELECT * FROM users WHERE username = ? AND active = 1', username);
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    registerFail(key);
    throw new HttpError(401, 'Usuario o contraseña incorrectos.');
  }
  attempts.delete(key);
  const token = auth.createSession(user.id);
  auth.setSessionCookie(res, token);
  res.json({ user: auth.publicUser(user), token });
});

router.post('/auth/logout', (req, res) => {
  db.run('DELETE FROM sessions WHERE token = ?', req.token);
  auth.clearSessionCookie(res);
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
  db.run('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', name, role, active, user.id);
  if (req.body.password) {
    if (String(req.body.password).length < 6) throw bad('La contraseña debe tener al menos 6 caracteres.');
    db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', auth.hashPassword(req.body.password), user.id);
  }
  if (!active) db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
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
