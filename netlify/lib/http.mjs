// Small helpers shared by every function: JSON responses, safe errors, body parsing.

import { missingConfig } from './config.mjs';

export class HttpError extends Error {
  constructor(status, code, message, detail) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extraHeaders,
    },
  });
}

// Guests and the couple only ever see a short code and a friendly message.
// Technical detail goes to the function log (Netlify > Logs > Functions).
export function errorResponse(err, fnName) {
  if (err instanceof HttpError) {
    if (err.status >= 500) console.error(`[${fnName}] ${err.code}: ${err.message}`, err.detail || '');
    else console.warn(`[${fnName}] ${err.code}: ${err.message}`);
    return json({ ok: false, error: err.code, message: err.message }, err.status);
  }
  console.error(`[${fnName}] unexpected error`, err);
  return json({ ok: false, error: 'server_error', message: 'Something went wrong. Please try again.' }, 500);
}

export function requireMethod(req, ...methods) {
  if (!methods.includes(req.method)) {
    throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

export async function readJson(req, maxBytes = 20000) {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'Request too large');
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not object');
    return data;
  } catch {
    throw new HttpError(400, 'bad_json', 'Invalid request body');
  }
}

export function ensureConfigured(keys) {
  const missing = missingConfig(keys);
  if (missing.length) {
    throw new HttpError(503, 'not_configured', 'This service is not set up yet.', `Missing env: ${missing.join(', ')}`);
  }
}

// Wraps a handler with consistent error handling.
export function handler(fnName, fn) {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (err) {
      return errorResponse(err, fnName);
    }
  };
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
export const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function cleanText(value, max = 100) {
  if (typeof value !== 'string') return '';
  // Remove control characters, collapse whitespace.
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
