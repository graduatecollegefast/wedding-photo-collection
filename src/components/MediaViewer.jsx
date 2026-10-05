import React, { useEffect, useRef, useState } from 'react';
import { formatDateTime, formatBytes } from '../utils/format.js';

// Fullscreen viewer. Loads only the open item at display size (never the grid's originals).
export default function MediaViewer({ items, index, onIndex, onClose, onToggleHidden }) {
  const item = items[index];
  const closeRef = useRef(null);
  const touch = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    const prevFocus = document.activeElement;
    closeRef.current && closeRef.current.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      prevFocus && prevFocus.focus && prevFocus.focus();
    };
  }, []);

  useEffect(() => {
    setError('');
  }, [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && hasNext) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onClose, onIndex]);

  if (!item) return null;
  const hidden = item.status === 'Hidden';

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      await onToggleHidden(item);
      if (items.length <= 1) onClose();
    } catch {
      setError('That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={item.type === 'video' ? 'Video viewer' : 'Photo viewer'}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (dx > 60 && hasPrev) onIndex(index - 1);
        if (dx < -60 && hasNext) onIndex(index + 1);
      }}
    >
      <div className="viewer-top">
        <p className="viewer-meta">
          {item.guestName ? <strong>{item.guestName}</strong> : <span>Guest</span>}
          <span> · {formatDateTime(item.uploadedAt)}</span>
          {item.bytes ? <span> · {formatBytes(item.bytes)}</span> : null}
        </p>
        <button ref={closeRef} type="button" className="viewer-btn" onClick={onClose} aria-label="Close viewer">
          ✕
        </button>
      </div>

      <div className="viewer-stage">
        {item.type === 'video' ? (
          <video key={item.id} controls playsInline preload="metadata" poster={item.posterUrl}>
            <source src={item.displayUrl} type="video/mp4" />
            <source src={item.originalUrl} />
            Your browser can’t play this video. Use Download original.
          </video>
        ) : (
          <img key={item.id} src={item.displayUrl} alt={item.guestName ? `Photo from ${item.guestName}` : 'Wedding photo'} />
        )}
      </div>

      <div className="viewer-bar">
        <button type="button" className="viewer-btn" onClick={() => onIndex(index - 1)} disabled={!hasPrev} aria-label="Previous">
          ‹ <span className="hide-sm">Previous</span>
        </button>
        <a className="viewer-btn" href={item.downloadUrl} download rel="noopener">
          Download original
        </a>
        <button type="button" className="viewer-btn" onClick={toggle} disabled={busy}>
          {busy ? '…' : hidden ? 'Restore' : 'Hide'}
        </button>
        <button type="button" className="viewer-btn" onClick={() => onIndex(index + 1)} disabled={!hasNext} aria-label="Next">
          <span className="hide-sm">Next</span> ›
        </button>
      </div>
      {error && (
        <p className="viewer-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
