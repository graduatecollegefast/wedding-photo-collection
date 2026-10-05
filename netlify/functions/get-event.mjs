// GET /.netlify/functions/get-event?slug=jordan-and-taylor
// Returns only public event information.

import { handler, json, requireMethod, ensureConfigured } from '../lib/http.mjs';
import { findEventBySlug, toPublicEvent } from '../lib/events.mjs';

export default handler('get-event', async (req) => {
  requireMethod(req, 'GET');
  ensureConfigured(['AIRTABLE_ACCESS_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_EVENTS_TABLE_ID']);
  const slug = new URL(req.url).searchParams.get('slug');
  const event = await findEventBySlug(slug);
  return json({ ok: true, event: toPublicEvent(event) });
});
