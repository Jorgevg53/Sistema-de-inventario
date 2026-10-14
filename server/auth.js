'use strict';
const crypto = require('node:crypto');
const db = require('./db');
const { HttpError, nowLocal } = require('./util');

// La sesión expira tras 12 horas sin actividad (se renueva sola mientras se usa el sistema).
const SESSION_HOURS = 12;
const COOKIE_DAYS = 30;
const COOKIE = 'sid';

const ALL_PERMISSIONS = [
  'dashboard',
  'pos',
  'sales.view',
  'sales.cancel',
  'customers',
  'cash',
  'cash.all',
  'products.view',
  'products.edit',
  'inventory',
  'purchases',
  'suppliers',
  'reports',
  'settings',
];

const ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS,
  cajero: ['dashboard', 'pos', 'sales.view', 'customers', 'cash', 'products.view'],
  almacen: ['dashboard', 'products.view', 'products.edit', 'inventory', 'purchases', 'suppliers'],
};

const ROLE_NAMES = { admin: 'Administrador', cajero: 'Cajero', almacen: 'Almacén' };

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    role_name: ROLE_NAMES[u.role] || u.role,
    active: u.active,
    must_change_password: u.must_change_password,
    created_at: u.created_at,
    permissions: permissionsFor(u.role),
  };
}

/** Contraseña aleatoria fácil de dictar (sin 0/O, 1/l/I). */
function randomPassword(length = 12) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

/**
 * Crea el usuario admin si la base no tiene usuarios. Contraseña inicial: ADMIN_PASSWORD_INICIAL si está
 * definida; en servidores (NODE_ENV=production: Docker y Opción D) una aleatoria, para que nunca quede
 * publicada una contraseña conocida; en la PC de la tienda, admin123. Siempre pide cambiarla al entrar.
 * Devuelve la contraseña creada (o null si ya había usuarios).
 */
function ensureAdmin() {
  const { n } = db.get('SELECT COUNT(*) AS n FROM users');
  if (n !== 0) return null;
  const fromEnv = String(process.env.ADMIN_PASSWORD_INICIAL || '');
  if (fromEnv && fromEnv.length < 6) console.warn('  ADMIN_PASSWORD_INICIAL tiene menos de 6 caracteres; se ignoró.');
  let password = 'admin123';
  let shown = 'admin123';
  if (fromEnv.length >= 6) {
    password = fromEnv;
    shown = 'la de ADMIN_PASSWORD_INICIAL';
  } else if (process.env.NODE_ENV === 'production') {
    password = randomPassword();
    shown = password;
  }
  db.run(
    'INSERT INTO users (name, username, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)',
    'Administrador', 'admin', hashPassword(password), 'admin',
  );
  console.log(`  Usuario inicial creado → usuario: admin  contraseña: ${shown}`);
  return password;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = nowLocal(new Date(Date.now() + SESSION_HOURS * 3600 * 1000));
  db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires);
  db.run('DELETE FROM sessions WHERE expires_at < ?', nowLocal());
  return token;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function tokenFrom(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return parseCookies(req.headers.cookie)[COOKIE];
}

// Con HTTPS (directo o detrás de un proxy de confianza, ver TRUST_PROXY) la cookie se marca Secure.
function cookieAttrs(req) {
  return `HttpOnly; SameSite=Lax; Path=/${req && req.secure ? '; Secure' : ''}`;
}

function setSessionCookie(req, res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieAttrs(req)}; Max-Age=${COOKIE_DAYS * 86400}`);
}

function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieAttrs(req)}; Max-Age=0`);
}

/** Middleware: exige sesión válida y carga req.user. */
function requireAuth(req, res, next) {
  const token = tokenFrom(req);
  if (token) {
    const now = nowLocal();
    const row = db.get(
      `SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`,
      token, now,
    );
    if (row) {
      // Renovar la sesión como máximo una vez cada 10 minutos.
      const renewAt = nowLocal(new Date(Date.now() + (SESSION_HOURS * 3600 - 600) * 1000));
      if (row.session_expires < renewAt) {
        db.run('UPDATE sessions SET expires_at = ? WHERE token = ?', nowLocal(new Date(Date.now() + SESSION_HOURS * 3600 * 1000)), token);
      }
      req.user = publicUser(row);
      req.token = token;
      return next();
    }
  }
  next(new HttpError(401, 'Sesión expirada. Inicia sesión de nuevo.'));
}

/** Middleware: exige al menos uno de los permisos indicados. */
function can(...perms) {
  return (req, res, next) => {
    const mine = req.user ? req.user.permissions : [];
    if (perms.some((p) => mine.includes(p))) return next();
    next(new HttpError(403, 'No tienes permiso para realizar esta acción.'));
  };
}

function hasPerm(req, perm) {
  return !!req.user && req.user.permissions.includes(perm);
}

module.exports = {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_NAMES,
  hashPassword,
  verifyPassword,
  randomPassword,
  publicUser,
  ensureAdmin,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  can,
  hasPerm,
};
