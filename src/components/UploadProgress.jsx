import React from 'react';
import { memoriesLabel } from '../utils/format.js';

const STATUS_TEXT = {
  queued: 'Waiting',
  uploading: null, // shows percentage
  saving: 'Saving…',
  success: 'Added',
  failed: 'Not uploaded',
};

const STATUS_ICON = { queued: '○', uploading: '↑', saving: '↑', success: '✓', failed: '!' };

export default function UploadProgress({ items, stats, onRetry, onRetryAll, onFinish }) {
  const visible = items.filter((i) => i.status !== 'rejected' && i.status !== 'selected');
  const current = Math.min(stats.total, stats.success + stats.failed + 1);
  const pct = Math.round(stats.overall * 100);

  return (
    <section className="card progress-card" aria-labelledby="progress-title">
      {stats.busy ? (
        <>
          <h2 id="progress-title" className="queue-title" aria-live="polite">
            Uploading {current} of {stats.total}
          </h2>
          <p className="muted small">Please keep this page open until it finishes.</p>
        </>
      ) : (
        <div role="status">
          <h2 id="progress-title" className="queue-title">
            {memoriesLabel(stats.success)} uploaded.
          </h2>
          {stats.failed > 0 && (
            <p className="partial-fail">{stats.failed === 1 ? "1 couldn't be uploaded." : `${stats.failed} couldn't be uploaded.`}</p>
          )}
        </div>
      )}

      <div
        className="bar"
        role="progressbar"
        aria-label="Overall upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>

      {!stats.busy && stats.failed > 0 && (
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={onRetryAll}>
            {stats.failed === 1 ? 'Try failed file again' : `Try ${stats.failed} failed files again`}
          </button>
          <button type="button" className="btn btn-link" onClick={onFinish}>
            Skip and finish
          </button>
        </div>
      )}

      <ul className="file-list progress-list" aria-label="Upload status for each file">
        {visible.map((item) => {
          const label = item.status === 'uploading' ? `Uploading ${Math.round((item.progress || 0) * 100)}%` : STATUS_TEXT[item.status];
          return (
            <li key={item.id} className={`file-row is-${item.status}`}>
              <span className="file-kind status-icon" aria-hidden="true">{STATUS_ICON[item.status]}</span>
              <span className="file-name">
                {item.name}
                {item.status === 'failed' && <span className="file-error">{item.error}</span>}
              </span>
              {item.status === 'failed' && item.errorKind !== 'too_large' && item.errorKind !== 'unsupported' ? (
                <button type="button" className="btn btn-small" onClick={() => onRetry(item.id)} aria-label={`Try ${item.name} again`}>
                  Try again
                </button>
              ) : (
                <span className="file-status">{label}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
