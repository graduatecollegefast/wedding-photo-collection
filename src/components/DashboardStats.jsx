import React from 'react';
import { formatDate } from '../utils/format.js';

const STATUS_LABEL = {
  active: 'Accepting uploads',
  closed: 'Uploads closed',
  expired: 'Expired',
  draft: 'Not open yet',
};

export default function DashboardStats({ event }) {
  const c = event.counts;
  return (
    <section className="stats" aria-label="Collection summary">
      <div className="stat-main">
        <p className="stat-label">Media collected</p>
        <p className="stat-number">{c.media.toLocaleString()}</p>
        <p className="stat-split">
          Photos: {c.photos.toLocaleString()} · Videos: {c.videos.toLocaleString()}
          {c.hidden > 0 && ` · Hidden: ${c.hidden.toLocaleString()}`}
        </p>
      </div>
      <div className="stat-side">
        <div>
          <p className="stat-label">Contributors</p>
          <p className="stat-number small">{c.contributors.toLocaleString()}</p>
          <p className="stat-note">Guests who added their name</p>
        </div>
        <div>
          <p className="stat-label">Gallery expires</p>
          <p className="stat-value">{formatDate(event.expirationDate)}</p>
          <p className={`pill pill-${event.status}`}>{STATUS_LABEL[event.status] || event.status}</p>
        </div>
      </div>
    </section>
  );
}
