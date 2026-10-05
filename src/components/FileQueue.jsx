import React from 'react';
import { formatBytes, memoriesLabel } from '../utils/format.js';

// Review screen after picking files: optional name, the list, and the upload button.
export default function FileQueue({ items, guestName, onGuestName, onRemove, onUpload, onChooseAgain, notice }) {
  const ready = items.filter((i) => i.status === 'selected');
  const rejected = items.filter((i) => i.status === 'rejected');

  return (
    <section className="card queue" aria-labelledby="queue-title">
      <h2 id="queue-title" className="queue-title">
        {memoriesLabel(ready.length)} selected
      </h2>

      {notice && <p className="notice" role="status">{notice}</p>}

      <label className="field">
        <span className="field-label">Your name</span>
        <input
          type="text"
          value={guestName}
          onChange={(e) => onGuestName(e.target.value)}
          placeholder="Who took these? Optional"
          autoComplete="name"
          maxLength={80}
        />
      </label>

      {ready.length > 0 && (
        <ul className="file-list" aria-label="Selected files">
          {ready.map((item) => (
            <li key={item.id} className="file-row">
              <span className="file-kind" aria-hidden="true">{item.kind === 'video' ? '▶' : '◻'}</span>
              <span className="file-name">{item.name}</span>
              <span className="file-size">{formatBytes(item.size)}</span>
              <button type="button" className="icon-btn" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <div className="rejected" role="alert">
          <p className="rejected-title">
            {rejected.length === 1 ? "1 file can't be added:" : `${rejected.length} files can't be added:`}
          </p>
          <ul className="file-list">
            {rejected.map((item) => (
              <li key={item.id} className="file-row is-rejected">
                <span className="file-kind" aria-hidden="true">!</span>
                <span className="file-name">
                  {item.name}
                  <span className="file-error">{item.error}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onUpload} disabled={!ready.length}>
          Upload {memoriesLabel(ready.length)}
        </button>
        <button type="button" className="btn btn-link" onClick={onChooseAgain}>
          Choose different files
        </button>
      </div>
    </section>
  );
}
