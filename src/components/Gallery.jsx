import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import MediaViewer from './MediaViewer.jsx';
import { formatDate } from '../utils/format.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Photos' },
  { key: 'video', label: 'Videos' },
  { key: 'hidden', label: 'Hidden' },
];

function duration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Gallery({ onChanged, onUnauthorized }) {
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openIndex, setOpenIndex] = useState(-1);
  const sentinel = useRef(null);
  const loadingRef = useRef(false);
  const filterRef = useRef(filter);

  const load = useCallback(
    async (reset) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError('');
      const f = filterRef.current;
      try {
        const res = await api.dashboardMedia({
          status: f === 'hidden' ? 'Hidden' : 'Active',
          type: f === 'image' || f === 'video' ? f : undefined,
          cursor: reset ? undefined : cursor,
        });
        if (filterRef.current !== f) return; // filter changed while loading
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
        setHasMore(Boolean(res.nextCursor));
      } catch (err) {
        if (err.status === 401) return onUnauthorized();
        if (err.code === 'cursor_expired') {
          loadingRef.current = false;
          return load(true);
        }
        setError('We couldn’t load more photos. Check your connection and try again.');
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [cursor, onUnauthorized]
  );

  // Reload from the start whenever the filter changes.
  useEffect(() => {
    filterRef.current = filter;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    loadingRef.current = false;
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Infinite scroll, with a visible button as a fallback.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current && items.length) load(false);
      },
      { rootMargin: '600px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, items.length, load]);

  const toggleHidden = async (item) => {
    const hide = item.status !== 'Hidden';
    try {
      await api.hideMedia(item.id, hide);
    } catch (err) {
      if (err.status === 401) return onUnauthorized();
      throw err;
    }
    const next = items.filter((i) => i.id !== item.id);
    setItems(next);
    setOpenIndex((idx) => (idx >= next.length ? next.length - 1 : idx));
    onChanged && onChanged();
  };

  return (
    <section className="gallery" aria-labelledby="gallery-title">
      <div className="gallery-head">
        <h2 id="gallery-title" className="section-title">Gallery</h2>
        <div className="chips" role="tablist" aria-label="Filter gallery">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`chip ${filter === f.key ? 'is-on' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filter === 'hidden' && <p className="muted small">Hidden items are kept safely. Open one and choose Restore to show it again.</p>}

      {items.length === 0 && !loading && !error && (
        <p className="empty">{filter === 'hidden' ? 'Nothing is hidden.' : 'No photos yet. They’ll appear here as guests upload them.'}</p>
      )}

      <ul className="masonry">
        {items.map((item, i) => (
          <li key={item.id} className="tile">
            <button
              type="button"
              className="tile-btn"
              onClick={() => setOpenIndex(i)}
              aria-label={`Open ${item.type === 'video' ? 'video' : 'photo'}${item.guestName ? ` from ${item.guestName}` : ''}, uploaded ${formatDate(item.uploadedAt, { month: 'short', day: 'numeric' })}`}
            >
              <img
                src={item.thumbUrl}
                alt=""
                loading="lazy"
                decoding="async"
                style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
              />
              {item.type === 'video' && (
                <span className="video-badge">
                  <span aria-hidden="true">▶</span> {duration(item.duration) || 'Video'}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div ref={sentinel} className="gallery-foot">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="muted" role="status">Loading…</p>}
        {!loading && hasMore && items.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => load(false)}>
            Load more
          </button>
        )}
      </div>

      {openIndex >= 0 && items[openIndex] && (
        <MediaViewer
          items={items}
          index={openIndex}
          onIndex={(i) => {
            setOpenIndex(i);
            if (i >= items.length - 3 && hasMore && !loadingRef.current) load(false);
          }}
          onClose={() => setOpenIndex(-1)}
          onToggleHidden={toggleHidden}
        />
      )}
    </section>
  );
}
