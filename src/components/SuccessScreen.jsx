import React from 'react';

export default function SuccessScreen({ count, photos, videos, eventName, guestName, onMore, onDone }) {
  const what =
    videos === 0 ? (count === 1 ? 'photo' : 'photos') : photos === 0 ? (count === 1 ? 'video' : 'videos') : 'photos and videos';
  const first = guestName ? guestName.split(' ')[0] : '';
  return (
    <section className="card success" role="status" aria-live="polite">
      <p className="success-mark" aria-hidden="true">♥</p>
      <h2 className="success-title">Memories added!</h2>
      {first && <p className="success-thanks">Thanks, {first}!</p>}
      <p>
        Your {count} {what} {count === 1 ? 'has' : 'have'} been added to {eventName}’s collection.
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onMore}>
          Upload more
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  );
}
