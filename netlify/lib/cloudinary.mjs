// Cloudinary signing and URL helpers. The API secret is used here and nowhere else.

import crypto from 'node:crypto';
import { config } from './config.mjs';

// Cloudinary signature: sort params by key, join as key=value with "&", arrays joined
// with ",", append the API secret, SHA-1 hex digest.
export function signParams(params, apiSecret = config().cloudinary.apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(',') : params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Every Cloudinary upload response carries signature = sha1("public_id=..&version=.." + secret).
// Checking it proves the metadata really came from Cloudinary for an upload we signed.
export function verifyUploadResponse({ public_id, version, signature }, apiSecret = config().cloudinary.apiSecret) {
  if (!public_id || !version || !signature) return false;
  const expected = signParams({ public_id, version }, apiSecret);
  return safeEqual(expected, signature);
}

const DELIVERY = 'https://res.cloudinary.com';

export function mediaUrls(item, cloudName = config().cloudinary.cloudName) {
  const v = item.version ? `v${item.version}/` : '';
  const pid = item.publicId;
  const base = `${DELIVERY}/${cloudName}/${item.type}/upload`;
  if (item.type === 'video') {
    return {
      thumbUrl: `${base}/so_0,c_limit,w_600,q_auto,f_jpg/${v}${pid}.jpg`,
      displayUrl: `${base}/q_auto/${v}${pid}.mp4`,
      posterUrl: `${base}/so_0,c_limit,w_1600,q_auto,f_jpg/${v}${pid}.jpg`,
      originalUrl: `${base}/${v}${pid}.${item.format}`,
      downloadUrl: `${base}/fl_attachment/${v}${pid}.${item.format}`,
    };
  }
  return {
    thumbUrl: `${base}/c_limit,w_600,q_auto,f_auto/${v}${pid}`,
    displayUrl: `${base}/c_limit,w_2000,h_2000,q_auto,f_auto/${v}${pid}`,
    originalUrl: `${base}/${v}${pid}.${item.format}`,
    downloadUrl: `${base}/fl_attachment/${v}${pid}.${item.format}`,
  };
}

// Signed, short-lived link that makes Cloudinary build a ZIP of the given assets on demand.
// Nothing passes through Netlify; the link stops working about an hour after it is created.
export function archiveDownloadUrl({ resourceType, publicIds, name }) {
  const { cloudName, apiKey } = config().cloudinary;
  const params = {
    mode: 'download',
    public_ids: publicIds,
    target_format: 'zip',
    flatten_folders: 'true',
    target_public_id: name,
    timestamp: Math.floor(Date.now() / 1000),
  };
  const signature = signParams(params);
  const url = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/generate_archive`);
  url.searchParams.set('mode', params.mode);
  publicIds.forEach((id) => url.searchParams.append('public_ids[]', id));
  url.searchParams.set('target_format', params.target_format);
  url.searchParams.set('flatten_folders', params.flatten_folders);
  url.searchParams.set('target_public_id', params.target_public_id);
  url.searchParams.set('timestamp', String(params.timestamp));
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('signature', signature);
  return url.toString();
}
