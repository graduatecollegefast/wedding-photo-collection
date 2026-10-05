import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffKind, validateFile } from '../src/utils/fileValidation.js';

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const pad = (arr) => {
  const out = new Uint8Array(64);
  out.set(arr);
  return out;
};
const file = (arr, name, type = '') => new File([pad(arr)], name, { type });

const event = { allowPhotos: true, allowVideos: true, limits: { maxImageMB: 10, maxVideoMB: 100 } };

test('detects real file types from content', async () => {
  assert.deepEqual(await sniffKind(file(bytes([0xff, 0xd8, 0xff, 0xe0]), 'a.jpg')), { kind: 'image', format: 'jpg' });
  assert.deepEqual(await sniffKind(file(bytes([0x89], 'PNG'), 'a.png')), { kind: 'image', format: 'png' });
  assert.deepEqual(await sniffKind(file(bytes([0, 0, 0, 24], 'ftypheic'), 'IMG_1.HEIC')), { kind: 'image', format: 'heic' });
  assert.deepEqual(await sniffKind(file(bytes([0, 0, 0, 20], 'ftypqt  '), 'IMG_2.MOV')), { kind: 'video', format: 'mov' });
  assert.deepEqual(await sniffKind(file(bytes([0, 0, 0, 20], 'ftypisom'), 'clip.mp4')), { kind: 'video', format: 'mp4' });
});

test('a renamed non-image is rejected even with a .jpg name', async () => {
  const fake = file(bytes('%PDF-1.7'), 'photo.jpg', 'image/jpeg');
  const r = await validateFile(fake, event);
  assert.equal(r.ok, false);
});

test('videos are refused when the event does not allow them', async () => {
  const r = await validateFile(file(bytes([0, 0, 0, 20], 'ftypqt  '), 'a.mov'), { ...event, allowVideos: false });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Videos are not being collected/);
});

test('size limits are enforced per type', async () => {
  const big = new File([pad(bytes([0xff, 0xd8, 0xff])), new Uint8Array(11 * 1024 * 1024)], 'big.jpg');
  const r = await validateFile(big, event);
  assert.equal(r.ok, false);
  assert.match(r.reason, /10 MB/);
});
