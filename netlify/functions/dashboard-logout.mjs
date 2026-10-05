// POST /.netlify/functions/dashboard-logout  -> clears the session cookie.

import { handler, json, requireMethod } from '../lib/http.mjs';
import { clearedCookie } from '../lib/session.mjs';

export default handler('dashboard-logout', async (req) => {
  requireMethod(req, 'POST');
  return json({ ok: true }, 200, { 'Set-Cookie': clearedCookie() });
});
