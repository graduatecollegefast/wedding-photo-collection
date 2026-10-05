// Stateless signed-cookie sessions plus scrypt password checks.
// The session payload carries a subject and the event it grants access to, so the same
// shape can later hold a customer account id without changing the dashboard endpoints.

import crypto from 'node:crypto';
import { config } from './config.mjs';
import { HttpError } from './http.mjs';

export const COOKIE_NAME = 'wp_session';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function hmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(payload, secret = config().dashboard.sessionSecret, ttlSeconds) {
  const ttl = ttlSeconds ?? config().dashboard.sessionDays * 86400;
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttl }));
  return `${body}.${hmac(body, secret)}`;
}

export function verifySessionToken(token, secret = config().dashboard.sessionSecret) {
  if (!token || typeof token !== 'string' || !token.includes('.') || !secret) return null;
  const [body, sig] = token.split('.');
  const expected = hmac(body, secret);
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(req, name = COOKIE_NAME) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export function sessionCookie(token, maxAgeSeconds) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function requireSession(req) {
  const session = verifySessionToken(readCookie(req));
  if (!session) throw new HttpError(401, 'session_expired', 'Please sign in again.');
  return session;
}

// Password hash format: scrypt$<salt base64url>$<hash base64url>  (made by scripts/hash-password.mjs)
export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${b64(salt)}$${b64(hash)}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !password || typeof stored !== 'string') return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}
