// Browser -> Netlify Functions. The browser never talks to Airtable.

const BASE = '/.netlify/functions';

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call(path, { method = 'GET', body, timeoutMs = 20000 } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('offline', 'You appear to be offline.', 0);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError('network', 'The connection dropped. Please try again.', 0);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || !data || data.ok === false) {
    throw new ApiError(data?.error || 'server_error', data?.message || 'Something went wrong. Please try again.', res.status);
  }
  return data;
}

export const api = {
  getEvent: (slug) => call(`get-event?slug=${encodeURIComponent(slug)}`),
  uploadSignature: (slug, sessionId) => call('upload-signature', { method: 'POST', body: { slug, sessionId } }),
  recordUpload: (payload) => call('record-upload', { method: 'POST', body: payload }),
  login: (password) => call('dashboard-login', { method: 'POST', body: { password } }),
  logout: () => call('dashboard-logout', { method: 'POST' }),
  dashboardEvent: () => call('dashboard-event'),
  dashboardMedia: ({ status = 'Active', type, cursor } = {}) => {
    const q = new URLSearchParams({ status });
    if (type) q.set('type', type);
    if (cursor) q.set('cursor', cursor);
    return call(`dashboard-media?${q}`);
  },
  hideMedia: (uploadId, hidden = true) => call('hide-media', { method: 'POST', body: { uploadId, hidden } }),
  prepareDownload: () => call('prepare-download', { method: 'POST', timeoutMs: 30000 }),
};
