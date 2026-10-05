import React, { useState } from 'react';
import { api } from '../services/api.js';

// "Download all" is prepared on request: the server returns signed links and Cloudinary
// builds each ZIP when it is opened, so nothing large is loaded into the browser.
export default function DownloadPanel({ onUnauthorized }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });

  const prepare = async () => {
    setState({ status: 'loading', data: null, error: '' });
    try {
      const data = await api.prepareDownload();
      setState({ status: 'ready', data, error: '' });
    } catch (err) {
      if (err.status === 401) return onUnauthorized();
      setState({ status: 'error', data: null, error: 'We couldn’t prepare the download. Please try again.' });
    }
  };

  return (
    <section className="card panel" aria-labelledby="dl-title">
      <h2 id="dl-title" className="section-title">Download all</h2>
      <p className="muted">
        Downloads include every visible photo and video as original files, split into ZIP parts. Hidden items are left out.
        Links work for about an hour after you prepare them.
      </p>

      {state.status !== 'ready' && (
        <button type="button" className="btn btn-primary" onClick={prepare} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Preparing…' : 'Prepare download'}
        </button>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <p>
            {state.data.totals.photos} photos and {state.data.totals.videos} videos.
          </p>
          {state.data.parts.length === 0 ? (
            <p className="muted">Nothing to download yet.</p>
          ) : (
            <ul className="download-list">
              {state.data.parts.map((p) => (
                <li key={p.url}>
                  <a className="btn btn-secondary btn-block" href={p.url} rel="noopener">
                    {p.label} ({p.count})
                  </a>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-link" onClick={prepare}>
            Refresh links
          </button>
        </>
      )}
    </section>
  );
}
