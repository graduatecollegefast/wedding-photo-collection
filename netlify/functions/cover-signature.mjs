// POST /.netlify/functions/cover-signature  (requires session)
// Short-lived signature that lets the couple upload ONE photo of themselves into the
// event's cover folder. Guests never get this signature.

import { handler, json, requireMethod, ensureConfigured } from '../lib/http.mjs';
import { requireSession } from '../lib/session.mjs';
import { findEventBySlug, coverFolder } from '../lib/events.mjs';
import { signParams } from '../lib/cloudinary.mjs';
import { config, IMAGE_FORMATS } from '../lib/config.mjs';

export default handler('cover-signature', async (req) => {
  requireMethod(req, 'POST');
  ensureConfigured(['SESSION_SECRET', 'AIRTABLE_ACCESS_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_EVENTS_TABLE_ID', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']);
  const session = requireSession(req);
  const event = await findEventBySlug(session.eventSlug);
  const { cloudName, apiKey } = config().cloudinary;
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    folder: coverFolder(event),
    tags: `event_${event.eventId},cover`,
    allowed_formats: IMAGE_FORMATS.join(','),
  };
  return json({
    ok: true,
    upload: {
      url: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      cloudName,
      apiKey,
      signature: signParams(params),
      params,
      expiresAt: (params.timestamp + 3000) * 1000,
    },
  });
});
