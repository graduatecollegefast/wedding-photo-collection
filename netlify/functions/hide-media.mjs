// POST /.netlify/functions/hide-media  { uploadId, hidden: true|false }
// Sets the Upload status to Hidden (or back to Active). Never deletes the Cloudinary file.

import { handler, json, requireMethod, readJson, ensureConfigured, HttpError } from '../lib/http.mjs';
import { requireSession } from '../lib/session.mjs';
import { findEventBySlug } from '../lib/events.mjs';
import { listRecords, updateRecord, formulaString } from '../lib/airtable.mjs';
import { config } from '../lib/config.mjs';

export default handler('hide-media', async (req) => {
  requireMethod(req, 'POST');
  ensureConfigured(['SESSION_SECRET', 'AIRTABLE_ACCESS_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_UPLOADS_TABLE_ID']);
  const session = requireSession(req);
  const { uploadId, hidden = true } = await readJson(req, 2000);
  if (typeof uploadId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(uploadId)) {
    throw new HttpError(400, 'bad_request', 'Please reload and try again.');
  }
  const event = await findEventBySlug(session.eventSlug);
  const { uploadsTable } = config().airtable;

  const found = await listRecords(uploadsTable, {
    filterByFormula: `AND({Upload ID} = ${formulaString(uploadId)}, {Event Key} = ${formulaString(event.eventId)})`,
    fields: ['Status'],
    maxRecords: 1,
    pageSize: 1,
  });
  const record = found.records[0];
  if (!record) throw new HttpError(404, 'not_found', 'That photo could not be found.');
  if (record.fields.Status === 'Deleted') throw new HttpError(409, 'deleted', 'That item was removed.');

  const status = hidden ? 'Hidden' : 'Active';
  await updateRecord(uploadsTable, record.id, { Status: status });
  return json({ ok: true, uploadId, status });
});
