// POST /.netlify/functions/upload-signature  { slug, sessionId }
// Verifies the event is open, then returns a short-lived signature that lets the browser
// upload directly to this event's Cloudinary folder, and nowhere else.

import { handler, json, requireMethod, readJson, ensureConfigured, HttpError, SESSION_ID_RE } from '../lib/http.mjs';
import { findEventBySlug, effectiveStatus, allowedFormats, storageFolder } from '../lib/events.mjs';
import { signParams } from '../lib/cloudinary.mjs';
import { config } from '../lib/config.mjs';

const STATUS_ERRORS = {
  closed: [403, 'event_closed', 'Uploads for this wedding are now closed.'],
  expired: [403, 'event_expired', 'This wedding gallery has expired.'],
  draft: [403, 'event_not_open', 'This wedding is not accepting photos yet.'],
};

export default handler('upload-signature', async (req) => {
  requireMethod(req, 'POST');
  ensureConfigured([
    'AIRTABLE_ACCESS_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_EVENTS_TABLE_ID',
    'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  ]);

  const body = await readJson(req);
  const sessionId = SESSION_ID_RE.test(body.sessionId || '') ? body.sessionId : null;
  if (!sessionId) throw new HttpError(400, 'bad_session', 'Please refresh the page and try again.');

  const event = await findEventBySlug(body.slug);
  const status = effectiveStatus(event);
  if (status !== 'active') throw new HttpError(...STATUS_ERRORS[status]);

  const formats = allowedFormats(event);
  if (!formats.length) throw new HttpError(403, 'event_not_open', 'This wedding is not accepting photos yet.');

  const { cloudName, apiKey } = config().cloudinary;
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    folder: storageFolder(event),
    tags: `event_${event.eventId}`,
    allowed_formats: formats.join(','),
    context: `event=${event.eventId}|session=${sessionId}`,
  };
  const signature = signParams(params);

  return json({
    ok: true,
    upload: {
      url: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      cloudName,
      apiKey,
      signature,
      params,
      // Cloudinary accepts a signature for one hour; the browser refreshes well before that.
      expiresAt: (params.timestamp + 3000) * 1000,
    },
  });
});
