// Minimal Airtable REST client. The token never leaves the server.

import { config } from './config.mjs';
import { HttpError } from './http.mjs';

const API = 'https://api.airtable.com/v0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(path, { method = 'GET', body, query } = {}) {
  const { token, baseId } = config().airtable;
  const url = new URL(`${API}/${baseId}/${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, String(v));
    }
  }

  // Retry on rate limits (429) and transient server errors, a few times with backoff.
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (attempt < 3) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      throw new HttpError(502, 'database_unavailable', 'We could not reach the photo album right now.', String(err));
    }

    if (res.ok) return res.json();

    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(res.status === 429 ? 1100 : 300 * 2 ** attempt);
      continue;
    }
    const detail = await res.text().catch(() => '');
    throw new HttpError(502, 'database_error', 'We could not reach the photo album right now.', `Airtable ${res.status}: ${detail.slice(0, 500)}`);
  }
  throw new HttpError(502, 'database_unavailable', 'We could not reach the photo album right now.');
}

// Escapes a value for use inside a single-quoted Airtable formula string.
export function formulaString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export async function listRecords(table, { filterByFormula, fields, sort, pageSize = 100, offset, maxRecords } = {}) {
  const query = { filterByFormula, pageSize, offset, maxRecords };
  if (fields) query['fields[]'] = fields;
  if (sort) {
    sort.forEach((s, i) => {
      query[`sort[${i}][field]`] = s.field;
      query[`sort[${i}][direction]`] = s.direction || 'asc';
    });
  }
  return request(encodeURIComponent(table), { query });
}

export async function listAll(table, opts = {}) {
  const out = [];
  let offset;
  do {
    const page = await listRecords(table, { ...opts, offset });
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}

export async function createRecord(table, fields) {
  const data = await request(encodeURIComponent(table), {
    method: 'POST',
    body: { records: [{ fields }], typecast: true },
  });
  return data.records[0];
}

export async function updateRecord(table, id, fields) {
  return request(`${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { fields, typecast: true },
  });
}
