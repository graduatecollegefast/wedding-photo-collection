// POST /.netlify/functions/set-cover  (requires session)
// { result: <Cloudinary upload response> }  -> sets the couple's photo
// { remove: true }                          -> removes it (the file stays in Cloudinary)
// Saves a display-ready URL (cropped 4:3, compressed) so guests on weak signal load it fast.

import { handler, json, requireMethod, readJson, ensureConfigured, HttpError } from '../lib/http.mjs';
import { requireSession } from '../lib/session.mjs';
import { findEventBySlug, coverFolder, clearEventCache } from '../lib/events.mjs';
import { verifyUploadResponse } from '../lib/cloudinary.mjs';
import { updateRecord } from '../lib/airtable.mjs';
import { config } from '../lib/config.mjs';

export function coverDisplayUrl(cloudName, { public_id, version }) {
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,g_auto,w_1200,h_900,q_auto,f_auto/v${version}/${public_id}`;
}

export default handler('set-cover', async (req) => {
  requireMethod(req, 'POST');
  ensureConfigured(['SESSION_SECRET', 'AIRTABLE_ACCESS_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_EVENTS_TABLE_ID', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_SECRET']);
  const session = requireSession(req);
  const body = await readJson(req, 20000);
  const event = await findEventBySlug(session.eventSlug, { fresh: true });
  const { eventsTable } = config().airtable;

  if (body.remove === true) {
    await updateRecord(eventsTable, event.recordId, { 'Cover Image URL': null });
    clearEventCache(event.slug);
    return json({ ok: true, coverImageUrl: '' });
  }

  const r = body.result || {};
  if (!verifyUploadResponse(r)) {
    throw new HttpError(400, 'invalid_upload', 'We could not confirm this photo. Please try again.', 'cover signature mismatch');
  }
  if (r.resource_type !== 'image' || typeof r.public_id !== 'string' || !r.public_id.startsWith(`${coverFolder(event)}/`)) {
    throw new HttpError(400, 'invalid_upload', 'We could not confirm this photo. Please try again.', `bad cover upload ${r.public_id}`);
  }
  const url = coverDisplayUrl(config().cloudinary.cloudName, r);
  await updateRecord(eventsTable, event.recordId, { 'Cover Image URL': url });
  clearEventCache(event.slug);
  return json({ ok: true, coverImageUrl: url });
});
