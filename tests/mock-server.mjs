// Local UI test server: serves the built app (dist/) and fakes the Netlify Functions and
// Cloudinary so the full guest flow can be exercised in a real browser without credentials.
//   npm run build && node tests/mock-server.mjs   -> http://localhost:4599/event/jordan-and-taylor
// Files whose name contains FAIL fail their first 3 Cloudinary attempts (so the guest sees a
// failure and retries). Files containing REGFAIL fail record-upload 4 times.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const PORT = Number(process.env.PORT || 4599);
export const stats = { cloudinary: {}, registered: {}, regAttempts: {} };
let authed = false;
let hidden = new Set();

const EVENTS = {
  'jordan-and-taylor': 'active',
  'closed-wedding': 'closed',
  'expired-wedding': 'expired',
  'draft-wedding': 'draft',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function eventFor(slug) {
  const status = EVENTS[slug];
  if (!status) return null;
  if (status === 'draft') return { slug, status };
  return {
    slug, status, name: 'Shaun & Shatoya', weddingDate: '2026-10-10', expirationDate: '2027-01-08',
    headline: 'Help us remember the day through your eyes.', welcomeMessage: '', coverImageUrl: '',
    allowPhotos: true, allowVideos: true, maxFilesPerUpload: 50, limits: { maxImageMB: 10, maxVideoMB: 100 },
  };
}

const items = Array.from({ length: 64 }, (_, i) => ({
  id: `item-${String(i).padStart(4, '0')}`,
  type: i % 9 === 0 ? 'video' : 'image',
  format: i % 9 === 0 ? 'mov' : 'jpg',
  status: 'Active',
  guestName: ['Tanya', 'Marcus', '', 'Aunt Rose'][i % 4],
  uploadedAt: new Date(Date.now() - i * 60000).toISOString(),
  width: [4, 3, 2][i % 3] * 100, height: [3, 4, 3][i % 3] * 100,
  duration: i % 9 === 0 ? 42 : null,
  thumbUrl: `/mock-img/${i}.svg`, displayUrl: `/mock-img/${i}.svg`, posterUrl: `/mock-img/${i}.svg`,
  originalUrl: `/mock-img/${i}.svg`, downloadUrl: `/mock-img/${i}.svg`,
}));

function svg(i) {
  const hues = [20, 35, 200, 140, 340, 260];
  const [w, h] = [[400, 300], [300, 400], [200, 300]][i % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hues[i % 6]},35%,${55 + (i % 4) * 6}%)"/><text x="50%" y="50%" font-size="40" text-anchor="middle" fill="#fff" font-family="Georgia">${i}</text></svg>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const fn = url.pathname.replace('/.netlify/functions/', '');
  await new Promise((r) => setTimeout(r, 120));

  if (url.pathname.startsWith('/.netlify/functions/')) {
    if (fn === 'get-event') {
      const ev = eventFor(url.searchParams.get('slug'));
      return ev ? send(res, 200, { ok: true, event: ev }) : send(res, 404, { ok: false, error: 'event_not_found', message: "We couldn't find this wedding." });
    }
    if (fn === 'upload-signature') {
      return send(res, 200, { ok: true, upload: { url: '/mock-cloudinary', apiKey: '1', signature: 'sig', params: { timestamp: 1, folder: 'f' }, expiresAt: Date.now() + 3e6 } });
    }
    if (fn === 'record-upload') {
      const body = JSON.parse((await readBody(req)).toString());
      const name = body.originalFilename;
      stats.regAttempts[name] = (stats.regAttempts[name] || 0) + 1;
      if (name.includes('REGFAIL') && stats.regAttempts[name] <= 4) return send(res, 502, { ok: false, error: 'database_error', message: 'x' });
      const dup = Boolean(stats.registered[body.result.asset_id]);
      stats.registered[body.result.asset_id] = name;
      return send(res, 200, { ok: true, uploadId: body.uploadId, duplicate: dup });
    }
    if (fn === 'dashboard-login') {
      const body = JSON.parse((await readBody(req)).toString());
      if (body.password !== 'correct horse battery') return send(res, 401, { ok: false, error: 'wrong_password', message: 'That password is not right. Please try again.' });
      authed = true;
      return send(res, 200, { ok: true });
    }
    if (fn === 'dashboard-logout') {
      authed = false;
      return send(res, 200, { ok: true });
    }
    if (!authed) return send(res, 401, { ok: false, error: 'session_expired', message: 'Please sign in again.' });
    if (fn === 'dashboard-event') {
      const vis = items.filter((i) => !hidden.has(i.id));
      return send(res, 200, { ok: true, event: { ...eventFor('jordan-and-taylor'), counts: { media: vis.length, photos: vis.filter((i) => i.type === 'image').length, videos: vis.filter((i) => i.type === 'video').length, hidden: hidden.size, contributors: 3 } } });
    }
    if (fn === 'dashboard-media') {
      const wantHidden = url.searchParams.get('status') === 'Hidden';
      const type = url.searchParams.get('type');
      const list = items.filter((i) => hidden.has(i.id) === wantHidden && (!type || i.type === type)).map((i) => ({ ...i, status: wantHidden ? 'Hidden' : 'Active' }));
      const off = Number(url.searchParams.get('cursor') || 0);
      return send(res, 200, { ok: true, items: list.slice(off, off + 50), nextCursor: off + 50 < list.length ? String(off + 50) : null });
    }
    if (fn === 'hide-media') {
      const body = JSON.parse((await readBody(req)).toString());
      if (body.hidden) hidden.add(body.uploadId);
      else hidden.delete(body.uploadId);
      return send(res, 200, { ok: true });
    }
    if (fn === 'prepare-download') {
      return send(res, 200, { ok: true, totals: { photos: 57, videos: 7 }, parts: [{ type: 'image', label: 'Photos — part 1 of 2', count: 40, url: '#' }, { type: 'image', label: 'Photos — part 2 of 2', count: 17, url: '#' }, { type: 'video', label: 'Videos — part 1 of 2', count: 4, url: '#' }, { type: 'video', label: 'Videos — part 2 of 2', count: 3, url: '#' }] });
    }
    return send(res, 404, { ok: false });
  }

  if (url.pathname === '/mock-cloudinary') {
    const raw = (await readBody(req)).toString('latin1');
    const name = (raw.match(/filename="([^"]+)"/) || [])[1] || 'unknown';
    stats.cloudinary[name] = (stats.cloudinary[name] || 0) + 1;
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 400));
    if (name.includes('FAIL') && !name.includes('REGFAIL') && stats.cloudinary[name] <= 3) {
      return send(res, 500, { error: { message: 'Simulated failure' } });
    }
    const id = Buffer.from(name).toString('hex').padEnd(32, '0').slice(0, 32);
    return send(res, 200, { asset_id: id, public_id: `f/${name}`, version: 1, signature: 's', resource_type: /mov|mp4/i.test(name) ? 'video' : 'image', format: 'jpg', bytes: 100 });
  }

  if (url.pathname === '/__stats') return send(res, 200, stats);

  const m = url.pathname.match(/^\/mock-img\/(\d+)\.svg$/);
  if (m) return send(res, 200, svg(Number(m[1])), { 'Content-Type': 'image/svg+xml' });

  let file = path.join(DIST, url.pathname);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`mock server on http://localhost:${PORT}`));
