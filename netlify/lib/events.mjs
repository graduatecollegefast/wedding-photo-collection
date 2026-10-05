// Event lookup and status rules. Public pages only ever receive toPublicEvent().

import { config, IMAGE_FORMATS, VIDEO_FORMATS } from './config.mjs';
import { listRecords, formulaString } from './airtable.mjs';
import { HttpError, SLUG_RE } from './http.mjs';

const CACHE_MS = 30_000; // Status changes in Airtable take effect within 30 seconds.
const cache = new Map();

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Today's date (YYYY-MM-DD) in the event's time zone.
export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function normalize(record) {
  const f = record.fields || {};
  const c = config();
  const weddingDate = f['Wedding Date'] || null;
  const expirationDate = f['Expiration Date'] || (weddingDate ? addDays(weddingDate, c.retentionDays) : null);
  return {
    recordId: record.id, // internal only, never sent to browsers
    eventId: f['Event ID'] || '',
    name: f['Event Name'] || '',
    slug: f['Event Slug'] || '',
    weddingDate,
    expirationDate,
    rawStatus: f['Status'] || 'Draft',
    headline: f['Headline'] || '',
    welcomeMessage: f['Welcome Message'] || '',
    coverImageUrl: f['Cover Image URL'] || '',
    allowPhotos: f['Allow Photos'] === true,
    allowVideos: f['Allow Videos'] === true,
    maxFilesPerUpload: Number(f['Maximum Files Per Upload']) > 0 ? Number(f['Maximum Files Per Upload']) : 50,
    counts: {
      total: Number(f['Upload Count']) || 0,
      photos: Number(f['Photo Count']) || 0,
      videos: Number(f['Video Count']) || 0,
      hidden: Number(f['Hidden Count']) || 0,
      contributors: Number(f['Contributor Count']) || 0,
    },
  };
}

// The status the app acts on. An Active or Closed event past its expiration date is Expired.
export function effectiveStatus(event, now = new Date()) {
  const raw = (event.rawStatus || 'Draft').toLowerCase();
  if (raw === 'expired') return 'expired';
  if (raw === 'draft') return 'draft';
  if (event.expirationDate && todayIn(config().timezone, now) > event.expirationDate) return 'expired';
  if (raw === 'closed') return 'closed';
  if (raw === 'active') return 'active';
  return 'draft';
}

export async function findEventBySlug(slug, { fresh = false } = {}) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new HttpError(404, 'event_not_found', "We couldn't find this wedding.");
  }
  const hit = cache.get(slug);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.event;

  const { eventsTable } = config().airtable;
  const page = await listRecords(eventsTable, {
    filterByFormula: `{Event Slug} = ${formulaString(slug)}`,
    maxRecords: 1,
    pageSize: 1,
  });
  const record = page.records[0];
  if (!record) throw new HttpError(404, 'event_not_found', "We couldn't find this wedding.");
  const event = normalize(record);
  if (!event.eventId) throw new HttpError(500, 'event_misconfigured', 'This wedding is not set up correctly.', `Event ${slug} has no Event ID`);
  cache.set(slug, { at: Date.now(), event });
  return event;
}

export function allowedFormats(event) {
  return [...(event.allowPhotos ? IMAGE_FORMATS : []), ...(event.allowVideos ? VIDEO_FORMATS : [])];
}

export function storageFolder(event) {
  // Predictable per-event folder. Future SaaS: wedding-events/<customer>/<event>/originals
  return `wedding-events/${event.eventId}/originals`;
}

export function toPublicEvent(event) {
  const status = effectiveStatus(event);
  if (status === 'draft') {
    return { slug: event.slug, status };
  }
  const { limits } = config();
  return {
    slug: event.slug,
    status,
    name: event.name,
    weddingDate: event.weddingDate,
    expirationDate: event.expirationDate,
    headline: event.headline,
    welcomeMessage: event.welcomeMessage,
    coverImageUrl: event.coverImageUrl,
    allowPhotos: event.allowPhotos,
    allowVideos: event.allowVideos,
    maxFilesPerUpload: event.maxFilesPerUpload,
    limits: { maxImageMB: limits.maxImageMB, maxVideoMB: limits.maxVideoMB },
  };
}
