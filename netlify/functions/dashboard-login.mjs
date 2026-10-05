// POST /.netlify/functions/dashboard-login  { password }
// Checks the password against DASHBOARD_PASSWORD_HASH and sets an HttpOnly session cookie.

import { handler, json, requireMethod, readJson, ensureConfigured, HttpError } from '../lib/http.mjs';
import { verifyPassword, createSessionToken, sessionCookie } from '../lib/session.mjs';
import { config } from '../lib/config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CODE_VERSION = 'login-v2';

// GET returns a non-secret health check of the password setting (shape and lengths only),
// so a broken DASHBOARD_PASSWORD_HASH can be diagnosed without exposing it.
function hashHealth(stored) {
  const raw = typeof stored === 'string' ? stored : '';
  const cleaned = raw.trim().replace(/^["']|["']$/g, '');
  const parts = cleaned.split(/[$:]/);
  return {
    codeVersion: CODE_VERSION,
    present: raw.length > 0,
    length: raw.length,
    hasOuterSpaceOrQuotes: raw !== cleaned,
    scheme: parts[0] === 'scrypt' ? 'scrypt' : 'other',
    parts: parts.length,
    saltChars: (parts[1] || '').length, // expected 22
    hashChars: (parts[2] || '').length, // expected 86
  };
}

export default handler('dashboard-login', async (req) => {
  if (req.method === 'GET') return json({ ok: true, check: hashHealth(config().dashboard.passwordHash) });
  requireMethod(req, 'POST');
  ensureConfigured(['DASHBOARD_PASSWORD_HASH', 'SESSION_SECRET', 'EVENT_SLUG']);
  const { password } = await readJson(req, 2000);
  const c = config().dashboard;

  if (!verifyPassword(password, c.passwordHash)) {
    await sleep(600); // slows down guessing
    throw new HttpError(401, 'wrong_password', 'That password is not right. Please try again.');
  }

  const ttl = c.sessionDays * 86400;
  // Future: { sub: customerId, role: 'owner', events: [...] }
  const token = createSessionToken({ sub: 'couple', eventSlug: c.eventSlug }, c.sessionSecret, ttl);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, ttl) });
});
