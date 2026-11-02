'use strict';
/**
 * Acceso a JARVIS.
 * - Sin contraseña: solo se puede usar desde este mismo equipo (localhost).
 * - Con contraseña (Ajustes o variable JARVIS_CLAVE): se puede usar desde el celular u otra PC iniciando sesión.
 */
const crypto = require('node:crypto');
const db = require('./db');
const D = require('./dates');
const { HttpError } = require('./util');

const COOKIE = 'jarvis_sid';
const SESSION_DAYS = 30;
const LOCAL_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i;

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

const envPassword = () => process.env.JARVIS_CLAVE || '';
const passwordRequired = () => !!(envPassword() || db.getSetting('password_hash'));

function checkPassword(password) {
  const env = envPassword();
  if (env) {
    const a = crypto.createHash('sha256').update(String(password)).digest();
    const b = crypto.createHash('sha256').update(env).digest();
    return crypto.timingSafeEqual(a, b);
  }
  return verifyPassword(password, db.getSetting('password_hash'));
}

function cookieToken(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

function validSession(req) {
  const token = cookieToken(req);
  if (!token) return false;
  const row = db.get('SELECT expires_at FROM sessions WHERE token = ?', token);
  return !!row && row.expires_at > D.nowWall();
}

function createSession(res, secure) {
  const token = crypto.randomBytes(32).toString('hex');
  db.run('DELETE FROM sessions WHERE expires_at < ?', D.nowWall());
  db.run('INSERT INTO sessions (token, expires_at) VALUES (?, ?)', token, D.addMinutes(D.nowWall(), SESSION_DAYS * 1440));
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}

function destroySession(req, res) {
  const token = cookieToken(req);
  if (token) db.run('DELETE FROM sessions WHERE token = ?', token);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

const isLoopback = (ip) => /^(127\.|::1$|::ffff:127\.)/.test(String(ip || ''));

// Encabezados que agregan los proxies (Caddy, Tailscale, Cloudflare…): lo que llega por ellos no es "este equipo".
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'via', 'cf-connecting-ip', 'tailscale-user-login'];

/** ¿La petición viene de este mismo equipo (y no de una página web ajena ni a través de un proxy)? */
function isLocalRequest(req) {
  return isLoopback(req.socket.remoteAddress) && isLoopback(req.ip) && LOCAL_HOSTS.test(req.headers.host || '')
    && !PROXY_HEADERS.some((h) => h in req.headers);
}

function status(req) {
  const required = passwordRequired();
  return {
    password_set: required,
    authenticated: required ? validSession(req) : isLocalRequest(req),
    local: isLocalRequest(req),
  };
}

/**
 * ¿La petición viene de la propia página de JARVIS? Se compara el Origin con el Host o, detrás de un proxy de
 * confianza (Caddy, Tailscale, Cloudflare…) que cambia el Host, con el X-Forwarded-Host que envía (req.hostname).
 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let url;
  try { url = new URL(origin); } catch { return false; }
  return url.host === req.headers.host || url.hostname === req.hostname;
}

/** Protege la API. Además rechaza peticiones enviadas desde otros sitios web. */
function requireAuth(req, res, next) {
  if (!sameOrigin(req)) return next(new HttpError(403, 'Petición rechazada: viene de otro sitio.'));
  if (req.method === 'POST' && req.headers['content-length'] !== '0' && !req.is('application/json')) {
    return next(new HttpError(415, 'Las peticiones deben enviarse en formato JSON.'));
  }
  if (passwordRequired()) {
    if (validSession(req)) return next();
    return next(new HttpError(401, 'Inicia sesión para continuar.'));
  }
  if (isLocalRequest(req)) return next();
  return next(new HttpError(403, 'Para usar JARVIS desde otro dispositivo primero define una contraseña en Ajustes (desde este equipo).'));
}

module.exports = {
  hashPassword, verifyPassword, checkPassword, passwordRequired, createSession, destroySession, validSession, isLocalRequest, status, requireAuth,
};
