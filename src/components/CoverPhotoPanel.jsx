import React, { useRef, useState } from 'react';
import { api } from '../services/api.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { validateFile } from '../utils/fileValidation.js';
import { newId } from '../utils/format.js';

// Lets the couple add, change or remove the photo shown at the top of their guest page.
export default function CoverPhotoPanel({ event, onChanged, onUnauthorized }) {
  const inputRef = useRef(null);
  const [state, setState] = useState({ status: 'idle', progress: 0, error: '' });
  const busy = state.status === 'uploading' || state.status === 'saving' || state.status === 'removing';

  const fail = (err, fallback) => {
    if (err && err.status === 401) return onUnauthorized();
    setState({ status: 'idle', progress: 0, error: (err && err.message) || fallback });
  };

  const onFile = async (file) => {
    const check = await validateFile(file, { allowPhotos: true, allowVideos: false, limits: event.limits });
    if (!check.ok) return setState({ status: 'idle', progress: 0, error: check.reason });
    setState({ status: 'uploading', progress: 0, error: '' });
    try {
      const result = await uploadToCloudinary({
        file,
        uploadId: newId(),
        getSignature: async () => (await api.coverSignature()).upload,
        onProgress: (p) => setState((s) => ({ ...s, progress: p })),
      });
      setState({ status: 'saving', progress: 1, error: '' });
      await api.setCover(result);
      setState({ status: 'idle', progress: 0, error: '' });
      onChanged && onChanged();
    } catch (err) {
      fail(err, 'We couldn’t add your photo. Please try again.');
    }
  };

  const remove = async () => {
    setState({ status: 'removing', progress: 0, error: '' });
    try {
      await api.removeCover();
      setState({ status: 'idle', progress: 0, error: '' });
      onChanged && onChanged();
    } catch (err) {
      fail(err, 'We couldn’t remove your photo. Please try again.');
    }
  };

  return (
    <div className="cover-panel">
      <p className="field-label">Your photo</p>
      <div className="cover-preview">
        {event.coverImageUrl ? (
          <img src={event.coverImageUrl} alt={`${event.name} cover`} />
        ) : (
          <p className="muted small">Add a photo of the two of you. It appears at the top of your guest page.</p>
        )}
      </div>

      {state.status === 'uploading' && (
        <div className="bar" role="progressbar" aria-label="Photo upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)}>
          <span style={{ width: `${Math.round(state.progress * 100)}%` }} />
        </div>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="actions inline">
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}>
          {state.status === 'uploading' ? 'Uploading…' : state.status === 'saving' ? 'Saving…' : event.coverImageUrl ? 'Change photo' : 'Add your photo'}
        </button>
        {event.coverImageUrl && (
          <button type="button" className="btn btn-secondary" onClick={remove} disabled={busy}>
            {state.status === 'removing' ? 'Removing…' : 'Remove photo'}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/*,.heic,.heif"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
      <p className="muted small">It’s shown on your guest page only, cropped to fit. Changes appear for guests within a minute.</p>
    </div>
  );
}
