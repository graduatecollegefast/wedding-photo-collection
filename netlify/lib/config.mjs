// Central server-side configuration. Values come only from environment variables.

function num(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function config() {
  return {
    airtable: {
      token: process.env.AIRTABLE_ACCESS_TOKEN || '',
      baseId: process.env.AIRTABLE_BASE_ID || '',
      eventsTable: process.env.AIRTABLE_EVENTS_TABLE_ID || '',
      uploadsTable: process.env.AIRTABLE_UPLOADS_TABLE_ID || '',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    },
    dashboard: {
      passwordHash: process.env.DASHBOARD_PASSWORD_HASH || '',
      sessionSecret: process.env.SESSION_SECRET || '',
      eventSlug: process.env.EVENT_SLUG || '',
      sessionDays: num('SESSION_DAYS', 7),
    },
    limits: {
      maxImageMB: num('MAX_IMAGE_MB', 10),
      maxVideoMB: num('MAX_VIDEO_MB', 100),
    },
    timezone: process.env.EVENT_TIMEZONE || 'America/Chicago',
    retentionDays: num('RETENTION_DAYS', 90),
  };
}

// File formats accepted end to end. Cloudinary enforces these too (allowed_formats is signed).
export const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
export const VIDEO_FORMATS = ['mp4', 'mov', 'm4v', '3gp', 'webm'];

export function missingConfig(keys) {
  const c = config();
  const flat = {
    AIRTABLE_ACCESS_TOKEN: c.airtable.token,
    AIRTABLE_BASE_ID: c.airtable.baseId,
    AIRTABLE_EVENTS_TABLE_ID: c.airtable.eventsTable,
    AIRTABLE_UPLOADS_TABLE_ID: c.airtable.uploadsTable,
    CLOUDINARY_CLOUD_NAME: c.cloudinary.cloudName,
    CLOUDINARY_API_KEY: c.cloudinary.apiKey,
    CLOUDINARY_API_SECRET: c.cloudinary.apiSecret,
    DASHBOARD_PASSWORD_HASH: c.dashboard.passwordHash,
    SESSION_SECRET: c.dashboard.sessionSecret,
    EVENT_SLUG: c.dashboard.eventSlug,
  };
  return keys.filter((k) => !flat[k]);
}
