// Checks what a file really is by reading its first bytes, not just its name.

const IMAGE_FTYP = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
const VIDEO_FTYP = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'qt  ', 'm4v ', 'm4vp', 'm4vh', '3gp4', '3gp5', '3gp6', '3g2a', '3ge6', 'msnv', 'dash', 'xavc', 'mp4v'];

function ascii(bytes, from, to) {
  return String.fromCharCode(...bytes.slice(from, to));
}

export async function sniffKind(file) {
  const buf = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', format: 'jpg' };
  if (buf[0] === 0x89 && ascii(buf, 1, 4) === 'PNG') return { kind: 'image', format: 'png' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { kind: 'image', format: 'webp' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'video', format: 'webm' };
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12).toLowerCase();
    if (IMAGE_FTYP.includes(brand)) return { kind: 'image', format: 'heic' };
    if (VIDEO_FTYP.includes(brand)) return { kind: 'video', format: brand.startsWith('qt') ? 'mov' : 'mp4' };
  }
  // Some QuickTime files start with other atoms (wide/mdat/moov) before ftyp.
  if (['wide', 'mdat', 'moov', 'free', 'skip'].includes(ascii(buf, 4, 8))) return { kind: 'video', format: 'mov' };
  return null;
}

/**
 * Returns { ok, kind, reason } for one file.
 * event: { allowPhotos, allowVideos, limits: { maxImageMB, maxVideoMB } }
 */
export async function validateFile(file, event) {
  let sniffed = null;
  try {
    sniffed = await sniffKind(file);
  } catch {
    sniffed = null;
  }
  if (!sniffed) {
    return { ok: false, kind: guessKind(file), reason: "This file type isn't supported. Please choose photos (JPG, PNG, HEIC, WEBP) or videos (MP4, MOV)." };
  }
  if (sniffed.kind === 'image' && !event.allowPhotos) return { ok: false, kind: 'image', reason: 'Photos are not being collected for this wedding.' };
  if (sniffed.kind === 'video' && !event.allowVideos) return { ok: false, kind: 'video', reason: 'Videos are not being collected for this wedding.' };

  const maxMB = sniffed.kind === 'video' ? event.limits.maxVideoMB : event.limits.maxImageMB;
  if (file.size > maxMB * 1024 * 1024) {
    return {
      ok: false,
      kind: sniffed.kind,
      reason: `This ${sniffed.kind === 'video' ? 'video' : 'photo'} is larger than ${maxMB} MB. ${sniffed.kind === 'video' ? 'Try a shorter clip.' : ''}`.trim(),
    };
  }
  if (file.size === 0) return { ok: false, kind: sniffed.kind, reason: 'This file is empty.' };
  return { ok: true, kind: sniffed.kind };
}

export function guessKind(file) {
  if (file.type.startsWith('video/') || /\.(mov|mp4|m4v|3gp|webm)$/i.test(file.name)) return 'video';
  return 'image';
}

export function acceptAttribute(event) {
  const parts = [];
  if (event.allowPhotos) parts.push('image/*', '.heic', '.heif');
  if (event.allowVideos) parts.push('video/*', '.mov', '.mp4');
  return parts.join(',');
}
