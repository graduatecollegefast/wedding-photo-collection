// POST /.netlify/functions/record-upload
// { slug, sessionId, uploadId, guestName, result: <Cloudinary upload response> }
// Creates exactly one Airtable Upload record per Cloudinary asset. Safe to call repeatedly.

import crypto from 'node:crypto';
import { handler, json, requireMethod, readJson, ensureConfigured, HttpError, SESSION_ID_RE, cleanText } from '../lib/http.mjs';
import { findEventBySlug, effectiveStatus, storageFolder } from '../lib/events.mjs';
import { verifyUploadResponse } from '../lib/cloudinary.mjs';
import { listRecords, createRecord, formulaString } from '../lib/airtable.mjs';
import { config, IMAGE_FORMATS, VIDEO_FORMATS } from '../lib/config.mjs';

const UPLOAD_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const ASSET_ID_RE = /^[a-f0-9]{16,64}$/;

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default handler('record-upload', async (req) => {
  requireMethod(req, 'POST');
  ensureConfigured([
    'AIRTABLE_ACCESS_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_EVENTS_TABLE_ID', 'AIRTABLE_UPLOADS_TABLE_ID',
    'CLOUDINARY_API_SECRET',
  ]);

  const body = await readJson(req);
  const r = body.result || {};

  const event = await findEventBySlug(body.slug);
  // Accept late registrations for uploads that started before uploads were closed,
  // but never for draft or expired events.
  const status = effectiveStatus(event);
  if (status === 'draft' || status === 'expired') {
    throw new HttpError(403, 'event_not_open', 'This wedding is not accepting photos.');
  }

  // 1. The metadata must really come from Cloudinary for an upload we signed.
  if (!verifyUploadResponse(r)) {
    throw new HttpError(400, 'invalid_upload', 'We could not confirm this upload.', 'Cloudinary response signature mismatch');
  }
  // 2. It must live in this event's folder.
  if (typeof r.public_id !== 'string' || !r.public_id.startsWith(`${storageFolder(event)}/`)) {
    throw new HttpError(400, 'invalid_upload', 'We could not confirm this upload.', `public_id outside event folder: ${r.public_id}`);
  }
  // 3. Basic shape checks.
  if (!ASSET_ID_RE.test(r.asset_id || '')) throw new HttpError(400, 'invalid_upload', 'We could not confirm this upload.', 'bad asset_id');
  const type = r.resource_type;
  const format = String(r.format || '').toLowerCase();
  const okFormat = (type === 'image' && IMAGE_FORMATS.includes(format)) || (type === 'video' && VIDEO_FORMATS.includes(format));
  if (!okFormat) throw new HttpError(400, 'unsupported_file', 'This file type is not supported.', `${type}/${format}`);

  const uploadId = UPLOAD_ID_RE.test(body.uploadId || '') ? body.uploadId : crypto.randomUUID();
  const sessionId = SESSION_ID_RE.test(body.sessionId || '') ? body.sessionId : '';

  // Idempotency: one record per Cloudinary asset (or per client upload id).
  const { uploadsTable } = config().airtable;
  const existing = await listRecords(uploadsTable, {
    filterByFormula: `OR({Cloudinary Asset ID} = ${formulaString(r.asset_id)}, {Upload ID} = ${formulaString(uploadId)})`,
    fields: ['Upload ID'],
    maxRecords: 1,
    pageSize: 1,
  });
  if (existing.records.length) {
    return json({ ok: true, uploadId: existing.records[0].fields['Upload ID'] || uploadId, duplicate: true });
  }

  const originalFilename = cleanText(body.originalFilename || r.original_filename || '', 200);
  const fields = {
    'Upload ID': uploadId,
    Event: [event.recordId],
    'Event Key': event.eventId,
    'Guest Name': cleanText(body.guestName, 80) || undefined,
    'Cloudinary Asset ID': r.asset_id,
    'Cloudinary Public ID': r.public_id,
    'Secure URL': typeof r.secure_url === 'string' && r.secure_url.startsWith('https://res.cloudinary.com/') ? r.secure_url : undefined,
    'Resource Type': type,
    Format: format,
    Version: numberOrNull(r.version),
    'Original Filename': originalFilename || undefined,
    'File Size': numberOrNull(r.bytes),
    Width: numberOrNull(r.width),
    Height: numberOrNull(r.height),
    Duration: type === 'video' ? numberOrNull(r.duration) : undefined,
    Status: 'Active',
    'Uploaded At': new Date().toISOString(),
    'Upload Session ID': sessionId || undefined,
    'User Agent': cleanText(req.headers.get('user-agent') || '', 300) || undefined,
  };
  for (const k of Object.keys(fields)) if (fields[k] === undefined || fields[k] === null) delete fields[k];

  await createRecord(uploadsTable, fields);
  return json({ ok: true, uploadId, duplicate: false });
});
