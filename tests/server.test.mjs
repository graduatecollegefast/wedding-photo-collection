// Server-side tests. Airtable is replaced by an in-memory fake so these run offline:
//   npm test

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.AIRTABLE_ACCESS_TOKEN = 'test-token';
process.env.AIRTABLE_BASE_ID = 'appTEST';
process.env.AIRTABLE_EVENTS_TABLE_ID = 'tblEvents';
process.env.AIRTABLE_UPLOADS_TABLE_ID = 'tblUploads';
process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
process.env.CLOUDINARY_API_KEY = '123456';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
process.env.SESSION_SECRET = 'session-secret-for-tests-only';
process.env.EVENT_SLUG = 'jordan-and-taylor';

const { signParams, verifyUploadResponse, archiveDownloadUrl } = await import('../netlify/lib/cloudinary.mjs');
const { hashPassword, verifyPassword, createSessionToken, verifySessionToken } = await import('../netlify/lib/session.mjs');
const { effectiveStatus, addDays } = await import('../netlify/lib/events.mjs');
process.env.DASHBOARD_PASSWORD_HASH = hashPassword('correct horse battery');

const getEvent = (await import('../netlify/functions/get-event.mjs')).default;
const uploadSignature = (await import('../netlify/functions/upload-signature.mjs')).default;
const recordUpload = (await import('../netlify/functions/record-upload.mjs')).default;
const login = (await import('../netlify/functions/dashboard-login.mjs')).default;
const dashboardEvent = (await import('../netlify/functions/dashboard-event.mjs')).default;
const dashboardMedia = (await import('../netlify/functions/dashboard-media.mjs')).default;
const hideMedia = (await import('../netlify/functions/hide-media.mjs')).default;
const prepareDownload = (await import('../netlify/functions/prepare-download.mjs')).default;

// ---------- Fake Airtable ----------
const db = { tblEvents: [], tblUploads: [] };
let airtableDown = false;
let created = 0;

function evalFormula(formula, fields) {
  // Supports the formulas this app uses: {Field} = 'value', AND(...), OR(...)
  const eq = [...formula.matchAll(/\{([^}]+)\} = '((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1], m[2].replace(/\\'/g, "'")]);
  const results = eq.map(([f, v]) => String(fields[f] ?? '') === v);
  if (formula.startsWith('OR(')) return results.some(Boolean);
  return results.every(Boolean);
}

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname !== 'api.airtable.com') throw new Error(`unexpected fetch ${url}`);
  if (airtableDown) return new Response('down', { status: 503 });
  const [, , , tableRaw, recId] = u.pathname.split('/');
  const table = decodeURIComponent(tableRaw);
  const rows = db[table];
  if (opts.method === 'POST') {
    const body = JSON.parse(opts.body);
    const recs = body.records.map((r) => ({ id: `rec${++created}`, fields: r.fields }));
    rows.push(...recs);
    return Response.json({ records: recs });
  }
  if (opts.method === 'PATCH') {
    const row = rows.find((r) => r.id === recId);
    Object.assign(row.fields, JSON.parse(opts.body).fields);
    return Response.json(row);
  }
  const formula = u.searchParams.get('filterByFormula');
  let found = formula ? rows.filter((r) => evalFormula(formula, r.fields)) : rows;
  const pageSize = Number(u.searchParams.get('pageSize') || 100);
  const offset = Number(u.searchParams.get('offset') || 0);
  const page = found.slice(offset, offset + pageSize);
  const next = offset + pageSize < found.length ? String(offset + pageSize) : undefined;
  return Response.json({ records: page, offset: next });
};

function seedEvent(slug, overrides = {}) {
  db.tblEvents.push({
    id: `recEvt${slug}`,
    fields: {
      'Event ID': `evt-${slug}`,
      'Event Name': 'Jordan & Taylor',
      'Event Slug': slug,
      'Wedding Date': '2026-10-17',
      'Expiration Date': '2099-01-15',
      Status: 'Active',
      'Allow Photos': true,
      'Allow Videos': true,
      'Maximum Files Per Upload': 50,
      'Photo Count': 3,
      'Video Count': 1,
      'Hidden Count': 1,
      'Contributor Count': 2,
      ...overrides,
    },
  });
}

function cloudinaryResult(slug, overrides = {}) {
  const public_id = `wedding-events/evt-${slug}/originals/abc123`;
  const version = 1760000000;
  return {
    asset_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    public_id,
    version,
    signature: signParams({ public_id, version }),
    resource_type: 'image',
    format: 'jpg',
    bytes: 2048000,
    width: 4032,
    height: 3024,
    secure_url: `https://res.cloudinary.com/demo-cloud/image/upload/v${version}/${public_id}.jpg`,
    original_filename: 'IMG_2031',
    ...overrides,
  };
}

const req = (url, init = {}) => new Request(`https://site.test/.netlify/functions/${url}`, init);
const post = (url, body, headers = {}) =>
  req(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  airtableDown = false;
});

// ---------- Unit tests ----------
test('Cloudinary signature matches the documented example', () => {
  const sig = signParams(
    { eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 },
    'abcd'
  );
  assert.equal(sig, 'bfd09f95f331f558cbd1320e67aa8d488770583e');
});

test('upload response verification rejects tampering', () => {
  const r = cloudinaryResult('x');
  assert.equal(verifyUploadResponse(r), true);
  assert.equal(verifyUploadResponse({ ...r, public_id: 'other/folder/abc' }), false);
  assert.equal(verifyUploadResponse({ ...r, signature: 'deadbeef' }), false);
});

test('archive link is signed and lists each file', () => {
  const url = new URL(archiveDownloadUrl({ resourceType: 'image', publicIds: ['a/1', 'a/2'], name: 'x-photos-1' }));
  assert.equal(url.pathname, '/v1_1/demo-cloud/image/generate_archive');
  assert.deepEqual(url.searchParams.getAll('public_ids[]'), ['a/1', 'a/2']);
  assert.ok(url.searchParams.get('signature'));
  assert.equal(url.searchParams.get('api_key'), '123456');
  assert.ok(!url.toString().includes('test-secret'));
});

test('passwords hash and verify', () => {
  const h = hashPassword('a long password');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(verifyPassword('a long password', h), true);
  assert.equal(verifyPassword('wrong password', h), false);
});

test('session tokens reject tampering and expiry', () => {
  const t = createSessionToken({ sub: 'couple', eventSlug: 'x' });
  assert.equal(verifySessionToken(t).eventSlug, 'x');
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'couple', eventSlug: 'other', exp: 9999999999 })).toString('base64url');
  assert.equal(verifySessionToken(`${forged}.${sig}`), null);
  assert.equal(verifySessionToken(createSessionToken({ sub: 'c' }, undefined, -10)), null);
  assert.equal(verifySessionToken(`${body}.${sig}x`), null);
});

test('expiration is wedding date + 90 days and overrides Active', () => {
  assert.equal(addDays('2026-10-17', 90), '2027-01-15');
  const ev = { rawStatus: 'Active', expirationDate: '2027-01-15' };
  assert.equal(effectiveStatus(ev, new Date('2027-01-15T18:00:00Z')), 'active');
  assert.equal(effectiveStatus(ev, new Date('2027-01-16T18:00:00Z')), 'expired');
  assert.equal(effectiveStatus({ rawStatus: 'Closed', expirationDate: '2099-01-01' }), 'closed');
  assert.equal(effectiveStatus({ rawStatus: 'Draft', expirationDate: '2099-01-01' }), 'draft');
});

// ---------- Endpoint tests ----------
test('get-event returns only public fields', async () => {
  seedEvent('pub-event');
  const res = await getEvent(req('get-event?slug=pub-event'));
  assert.equal(res.status, 200);
  const { event } = await res.json();
  assert.equal(event.name, 'Jordan & Taylor');
  assert.equal(event.status, 'active');
  assert.equal(event.recordId, undefined);
  assert.equal(event.eventId, undefined);
  assert.equal(event.counts, undefined);
  assert.ok(!JSON.stringify(event).includes('recEvt'));
});

test('get-event: invalid and unknown slugs return 404', async () => {
  assert.equal((await getEvent(req("get-event?slug=bad'slug"))).status, 404);
  assert.equal((await getEvent(req('get-event?slug=nope'))).status, 404);
});

test('get-event: draft events reveal nothing', async () => {
  seedEvent('draft-event', { Status: 'Draft' });
  const { event } = await (await getEvent(req('get-event?slug=draft-event'))).json();
  assert.deepEqual(event, { slug: 'draft-event', status: 'draft' });
});

test('upload-signature: active event gets a scoped signature without the secret', async () => {
  seedEvent('sig-event', { 'Allow Videos': false });
  const res = await uploadSignature(post('upload-signature', { slug: 'sig-event', sessionId: 'session-1234' }));
  assert.equal(res.status, 200);
  const { upload } = await res.json();
  assert.equal(upload.params.folder, 'wedding-events/evt-sig-event/originals');
  assert.equal(upload.params.allowed_formats, 'jpg,jpeg,png,webp,heic,heif');
  assert.equal(upload.signature, signParams(upload.params));
  assert.ok(!JSON.stringify(upload).includes('test-secret'));
});

test('upload-signature: closed, expired and draft events are refused server-side', async () => {
  seedEvent('closed-event', { Status: 'Closed' });
  seedEvent('expired-event', { 'Expiration Date': '2020-01-01' });
  seedEvent('draft2-event', { Status: 'Draft' });
  for (const [slug, code] of [['closed-event', 'event_closed'], ['expired-event', 'event_expired'], ['draft2-event', 'event_not_open']]) {
    const res = await uploadSignature(post('upload-signature', { slug, sessionId: 'session-1234' }));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, code);
  }
});

test('record-upload creates exactly one record and is idempotent', async () => {
  seedEvent('rec-event');
  const before = db.tblUploads.length;
  const body = { slug: 'rec-event', sessionId: 'session-1234', uploadId: 'upload-0001', guestName: '  Tanya  ', result: cloudinaryResult('rec-event') };
  const r1 = await (await recordUpload(post('record-upload', body))).json();
  assert.equal(r1.ok, true);
  assert.equal(r1.duplicate, false);
  const r2 = await (await recordUpload(post('record-upload', body))).json();
  assert.equal(r2.duplicate, true);
  // Same asset, different client upload id: still no duplicate.
  const r3 = await (await recordUpload(post('record-upload', { ...body, uploadId: 'upload-0002' }))).json();
  assert.equal(r3.duplicate, true);
  assert.equal(db.tblUploads.length, before + 1);
  const row = db.tblUploads.at(-1).fields;
  assert.equal(row['Guest Name'], 'Tanya');
  assert.equal(row['Event Key'], 'evt-rec-event');
  assert.deepEqual(row.Event, ['recEvtrec-event']);
  assert.equal(row.Status, 'Active');
});

test('record-upload rejects forged or foreign uploads', async () => {
  seedEvent('forge-event');
  const forged = cloudinaryResult('forge-event', { signature: 'f'.repeat(40) });
  let res = await recordUpload(post('record-upload', { slug: 'forge-event', result: forged }));
  assert.equal(res.status, 400);
  // Valid Cloudinary signature but stored under another event's folder.
  const other = cloudinaryResult('someone-else');
  res = await recordUpload(post('record-upload', { slug: 'forge-event', result: other }));
  assert.equal(res.status, 400);
});

test('Airtable outage returns a friendly error, not a stack trace', async () => {
  seedEvent('down-event');
  await getEvent(req('get-event?slug=down-event')); // warm cache
  airtableDown = true;
  const res = await recordUpload(post('record-upload', { slug: 'down-event', uploadId: 'upload-0099', result: cloudinaryResult('down-event', { asset_id: 'ffffffffffffffffffffffffffffffff' }) }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, 'database_error');
  assert.ok(!/airtable|stack/i.test(body.message));
});

test('dashboard: wrong password rejected, right password sets HttpOnly cookie', async () => {
  const bad = await login(post('dashboard-login', { password: 'nope nope nope' }));
  assert.equal(bad.status, 401);
  const good = await login(post('dashboard-login', { password: 'correct horse battery' }));
  assert.equal(good.status, 200);
  const cookie = good.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
});

test('dashboard endpoints require a session', async () => {
  assert.equal((await dashboardEvent(req('dashboard-event'))).status, 401);
  assert.equal((await dashboardMedia(req('dashboard-media'))).status, 401);
  assert.equal((await hideMedia(post('hide-media', { uploadId: 'upload-0001' }))).status, 401);
  assert.equal((await prepareDownload(post('prepare-download', {}))).status, 401);
});

test('dashboard: counts, paginated media, hide, and download links', async () => {
  seedEvent('jordan-and-taylor');
  const cookie = `wp_session=${createSessionToken({ sub: 'couple', eventSlug: 'jordan-and-taylor' })}`;
  for (let i = 0; i < 60; i++) {
    db.tblUploads.push({
      id: `recU${i}`,
      fields: {
        'Upload ID': `dash-upload-${String(i).padStart(4, '0')}`,
        'Event Key': 'evt-jordan-and-taylor',
        'Cloudinary Public ID': `wedding-events/evt-jordan-and-taylor/originals/p${i}`,
        'Resource Type': i % 10 === 0 ? 'video' : 'image',
        Format: i % 10 === 0 ? 'mov' : 'heic',
        Version: 1,
        Status: 'Active',
        'Uploaded At': new Date(Date.now() - i * 1000).toISOString(),
      },
    });
  }
  const ev = await (await dashboardEvent(req('dashboard-event', { headers: { cookie } }))).json();
  assert.deepEqual(ev.event.counts, { media: 4, photos: 3, videos: 1, hidden: 1, contributors: 2 });

  const p1 = await (await dashboardMedia(req('dashboard-media', { headers: { cookie } }))).json();
  assert.equal(p1.items.length, 50);
  assert.ok(p1.nextCursor);
  const p2 = await (await dashboardMedia(req(`dashboard-media?cursor=${p1.nextCursor}`, { headers: { cookie } }))).json();
  assert.equal(p2.items.length, 10);
  assert.equal(p2.nextCursor, null);

  const img = p1.items.find((i) => i.type === 'image');
  assert.match(img.thumbUrl, /c_limit,w_600,q_auto,f_auto/);
  assert.match(img.downloadUrl, /fl_attachment/);
  assert.match(img.downloadUrl, /\.heic$/);

  const h = await hideMedia(post('hide-media', { uploadId: img.id }, { cookie }));
  assert.equal(h.status, 200);
  const stillVisible = await (await dashboardMedia(req('dashboard-media?status=Active', { headers: { cookie } }))).json();
  assert.ok(!stillVisible.items.some((i) => i.id === img.id));
  const hidden = await (await dashboardMedia(req('dashboard-media?status=Hidden', { headers: { cookie } }))).json();
  assert.equal(hidden.items[0].id, img.id);

  const dl = await (await prepareDownload(post('prepare-download', {}, { cookie }))).json();
  assert.equal(dl.totals.photos, 53); // 54 photos minus the hidden one
  assert.equal(dl.totals.videos, 6);
  assert.equal(dl.parts.filter((p) => p.type === 'image').length, 2);
});
