// POST /.netlify/functions/prepare-download  (requires session)
// Builds signed Cloudinary archive links for every visible (Active) photo and video,
// split into parts so each ZIP stays a manageable size. Cloudinary builds each ZIP
// when its link is opened; no media passes through Netlify.
// Isolated on purpose: swapping in a different bulk-download mechanism only touches this file.

import { handler, json, requireMethod, ensureConfigured } from '../lib/http.mjs';
import { requireSession } from '../lib/session.mjs';
import { findEventBySlug } from '../lib/events.mjs';
import { listAll, formulaString } from '../lib/airtable.mjs';
import { archiveDownloadUrl } from '../lib/cloudinary.mjs';
import { config } from '../lib/config.mjs';

const PER_PART = { image: 40, video: 4 };

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export default handler('prepare-download', async (req) => {
  requireMethod(req, 'POST');
  ensureConfigured(['SESSION_SECRET', 'AIRTABLE_ACCESS_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_UPLOADS_TABLE_ID', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']);
  const session = requireSession(req);
  const event = await findEventBySlug(session.eventSlug);

  const records = await listAll(config().airtable.uploadsTable, {
    filterByFormula: `AND({Event Key} = ${formulaString(event.eventId)}, {Status} = 'Active')`,
    fields: ['Cloudinary Public ID', 'Resource Type', 'Uploaded At'],
    sort: [{ field: 'Uploaded At', direction: 'asc' }],
  });

  const byType = { image: [], video: [] };
  for (const rec of records) {
    const pid = rec.fields['Cloudinary Public ID'];
    const type = rec.fields['Resource Type'] === 'video' ? 'video' : 'image';
    if (pid) byType[type].push(pid);
  }

  const parts = [];
  for (const type of ['image', 'video']) {
    const groups = chunk(byType[type], PER_PART[type]);
    groups.forEach((ids, i) => {
      const label = type === 'image' ? 'Photos' : 'Videos';
      parts.push({
        type,
        label: groups.length > 1 ? `${label} — part ${i + 1} of ${groups.length}` : label,
        count: ids.length,
        url: archiveDownloadUrl({
          resourceType: type,
          publicIds: ids,
          name: `${event.slug}-${type === 'image' ? 'photos' : 'videos'}-${i + 1}`,
        }),
      });
    });
  }

  return json({
    ok: true,
    totals: { photos: byType.image.length, videos: byType.video.length },
    expiresInMinutes: 55,
    parts,
  });
});
