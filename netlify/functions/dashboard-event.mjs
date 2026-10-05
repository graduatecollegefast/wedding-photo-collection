// GET /.netlify/functions/dashboard-event  (requires session)
// Event details and counts for the couple. Counts come from Airtable rollup fields,
// so this never scans the Uploads table.

import { handler, json, requireMethod, ensureConfigured } from '../lib/http.mjs';
import { requireSession } from '../lib/session.mjs';
import { findEventBySlug, effectiveStatus } from '../lib/events.mjs';
import { config } from '../lib/config.mjs';

export default handler('dashboard-event', async (req) => {
  requireMethod(req, 'GET');
  ensureConfigured(['SESSION_SECRET', 'AIRTABLE_ACCESS_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_EVENTS_TABLE_ID']);
  const session = requireSession(req);
  const event = await findEventBySlug(session.eventSlug, { fresh: true });
  const { limits } = config();

  return json({
    ok: true,
    event: {
      name: event.name,
      slug: event.slug,
      weddingDate: event.weddingDate,
      expirationDate: event.expirationDate,
      status: effectiveStatus(event),
      headline: event.headline,
      coverImageUrl: event.coverImageUrl,
      allowPhotos: event.allowPhotos,
      allowVideos: event.allowVideos,
      maxFilesPerUpload: event.maxFilesPerUpload,
      limits,
      counts: {
        media: event.counts.photos + event.counts.videos,
        photos: event.counts.photos,
        videos: event.counts.videos,
        hidden: event.counts.hidden,
        contributors: event.counts.contributors,
      },
    },
  });
});
