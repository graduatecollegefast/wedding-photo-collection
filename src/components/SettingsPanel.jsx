import React, { useEffect, useRef, useState } from 'react';
import { formatDate } from '../utils/format.js';
import CoverPhotoPanel from './CoverPhotoPanel.jsx';

// Read-only event settings plus the guest QR code. Settings are changed in Airtable (see README).
export default function SettingsPanel({ event, onChanged, onUnauthorized }) {
  const guestUrl = `${window.location.origin}/event/${event.slug}`;
  const canvasRef = useRef(null);
  const [qrReady, setQrReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Loaded only here, so the QR library never reaches guests' phones.
    import('qrcode').then((QR) => {
      if (cancelled || !canvasRef.current) return;
      QR.toCanvas(canvasRef.current, guestUrl, { width: 640, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#2f2723', light: '#ffffff' } }, (err) => {
        if (!err && !cancelled) setQrReady(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [guestUrl]);

  const downloadQr = () => {
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `${event.slug}-qr.png`;
    a.click();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className="card panel" aria-labelledby="settings-title">
      <h2 id="settings-title" className="section-title">Event settings</h2>

      <CoverPhotoPanel event={event} onChanged={onChanged} onUnauthorized={onUnauthorized} />

      <div className="qr-block">
        <canvas ref={canvasRef} className="qr" aria-label={`QR code for ${guestUrl}`} role="img" />
        <div>
          <p className="field-label">Guest link</p>
          <p className="guest-url">{guestUrl}</p>
          <div className="actions inline">
            <button type="button" className="btn btn-primary" onClick={downloadQr} disabled={!qrReady}>
              Download QR code
            </button>
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      </div>

      <dl className="settings-list">
        <div><dt>Status</dt><dd>{event.status}</dd></div>
        <div><dt>Wedding date</dt><dd>{formatDate(event.weddingDate)}</dd></div>
        <div><dt>Gallery expires</dt><dd>{formatDate(event.expirationDate)}</dd></div>
        <div><dt>Photos</dt><dd>{event.allowPhotos ? `Allowed, up to ${event.limits.maxImageMB} MB each` : 'Off'}</dd></div>
        <div><dt>Videos</dt><dd>{event.allowVideos ? `Allowed, up to ${event.limits.maxVideoMB} MB each` : 'Off'}</dd></div>
        <div><dt>Files per upload</dt><dd>{event.maxFilesPerUpload}</dd></div>
      </dl>
      <p className="muted small">To close uploads or change these settings, ask your photo-album host. Changes apply within a minute.</p>
    </section>
  );
}
