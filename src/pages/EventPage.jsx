import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useUploadQueue } from '../hooks/useUploadQueue.js';
import UploadButton from '../components/UploadButton.jsx';
import FileQueue from '../components/FileQueue.jsx';
import UploadProgress from '../components/UploadProgress.jsx';
import SuccessScreen from '../components/SuccessScreen.jsx';
import { validateFile, acceptAttribute } from '../utils/fileValidation.js';
import { EVENT_STATUS_MESSAGES } from '../utils/errors.js';
import { formatDate } from '../utils/format.js';
import { Heart, HeartTrio, HeartDivider } from '../components/Hearts.jsx';

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

export default function EventPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, event: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, event: null, error: null });
    api
      .getEvent(slug)
      .then((res) => !cancelled && setState({ loading: false, event: res.event, error: null }))
      .catch((err) => !cancelled && setState({ loading: false, event: null, error: err }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (state.event?.name) document.title = `${state.event.name} · Share your photos`;
  }, [state.event]);

  if (state.loading) {
    return (
      <main className="guest">
        <div className="page-loading" role="status">Loading…</div>
      </main>
    );
  }

  if (state.error) {
    const notFound = state.error.code === 'event_not_found';
    return (
      <main className="guest">
        <section className="card center-card">
          <h1 className="names small-names">{notFound ? 'Wedding not found' : 'We couldn’t load this page'}</h1>
          <p>{notFound ? 'Please check the link or scan the QR code again.' : 'Please check your connection and try again.'}</p>
          {!notFound && (
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          )}
        </section>
      </main>
    );
  }

  const event = state.event;
  if (event.status !== 'active') {
    return (
      <main className="guest">
        {event.name && <Hero event={event} />}
        <section className="card center-card" role="status">
          <p className="status-message">{EVENT_STATUS_MESSAGES[event.status] || EVENT_STATUS_MESSAGES.draft}</p>
        </section>
      </main>
    );
  }

  return <ActiveEvent event={event} slug={slug} />;
}

function Hero({ event }) {
  return (
    <header className="hero">
      {event.coverImageUrl ? (
        <div className="cover">
          <img src={event.coverImageUrl} alt={`${event.name}`} decoding="async" fetchpriority="high" />
        </div>
      ) : (
        <div className="cover cover-plain" aria-hidden="true">
          <HeartTrio size={30} />
        </div>
      )}
      <h1 className="names">{event.name}</h1>
      {event.weddingDate && <p className="date">{formatDate(event.weddingDate)}</p>}
      <HeartDivider />
      {event.headline && <p className="headline">“{event.headline}”</p>}
      {event.welcomeMessage && <p className="welcome">{event.welcomeMessage}</p>}
    </header>
  );
}

function ActiveEvent({ event, slug }) {
  const queue = useUploadQueue({ slug });
  const [phase, setPhase] = useState('pick'); // pick | review | uploading | done | thanks
  const [guestName, setGuestName] = useState('');
  const [notice, setNotice] = useState('');
  const accept = acceptAttribute(event);
  const retention = daysBetween(event.weddingDate, event.expirationDate) || 90;
  const what = event.allowVideos && event.allowPhotos ? 'photos & videos' : event.allowVideos ? 'videos' : 'photos';

  const onFiles = async (files) => {
    const max = event.maxFilesPerUpload || 50;
    let chosen = files;
    let msg = '';
    if (files.length > max) {
      chosen = files.slice(0, max);
      msg = `You can add up to ${max} at a time. We’ve kept the first ${max}; add the rest after these finish.`;
    }
    const entries = await Promise.all(chosen.map(async (file) => ({ file, ...(await validateFile(file, event)) })));
    queue.setFiles(entries);
    setNotice(msg);
    setPhase('review');
  };

  const startUpload = () => {
    queue.start(guestName);
    setPhase('uploading');
  };

  const allDone = phase === 'uploading' && queue.stats.finished && queue.stats.failed === 0;
  const effectivePhase = allDone ? 'done' : phase;

  return (
    <main className="guest">
      {(effectivePhase === 'pick' || effectivePhase === 'thanks') && <Hero event={event} />}

      {effectivePhase === 'pick' && (
        <section className="start" aria-label="Add photos">
          <UploadButton accept={accept} onFiles={onFiles}>
            <Heart size={18} color="currentColor" /> Add your {what}
          </UploadButton>
          <p className="muted">No app or account needed.</p>
          <p className="fine-print">
            Your {event.allowVideos && !event.allowPhotos ? 'videos' : 'photos'} will be available to the couple for {retention} days after the wedding.
          </p>
          <p className="fine-print">
            {event.allowPhotos && `Photos up to ${event.limits.maxImageMB} MB`}
            {event.allowPhotos && event.allowVideos && ' · '}
            {event.allowVideos && `Videos up to ${event.limits.maxVideoMB} MB`}
            {` · Up to ${event.maxFilesPerUpload} at a time`}
          </p>
        </section>
      )}

      {effectivePhase === 'review' && (
        <>
          <MiniHeader event={event} />
          <FileQueue
            items={queue.items}
            guestName={guestName}
            onGuestName={setGuestName}
            onRemove={queue.removeItem}
            onUpload={startUpload}
            notice={notice}
            onChooseAgain={() => {
              queue.reset();
              setPhase('pick');
            }}
          />
        </>
      )}

      {effectivePhase === 'uploading' && (
        <>
          <MiniHeader event={event} />
          <UploadProgress
            items={queue.items}
            stats={queue.stats}
            onRetry={(id) => queue.retry(id)}
            onRetryAll={() => queue.retry()}
            onFinish={() => setPhase('done')}
          />
        </>
      )}

      {effectivePhase === 'done' && (
        <>
          <MiniHeader event={event} />
          <SuccessScreen
            count={queue.stats.success}
            photos={queue.stats.photos}
            videos={queue.stats.videos}
            eventName={event.name}
            guestName={guestName.trim()}
            onMore={() => {
              queue.reset();
              setPhase('pick');
            }}
            onDone={() => {
              queue.reset();
              setPhase('thanks');
            }}
          />
        </>
      )}

      {effectivePhase === 'thanks' && (
        <section className="start" aria-label="Thank you">
          <p className="thanks-line">Thank you for sharing your memories.</p>
          <UploadButton accept={accept} onFiles={onFiles} variant="secondary">
            Add more {what}
          </UploadButton>
        </section>
      )}
    </main>
  );
}

function MiniHeader({ event }) {
  return (
    <header className="mini-header">
      <Heart size={16} />
      <p className="mini-names">{event.name}</p>
      {event.weddingDate && <p className="mini-date">{formatDate(event.weddingDate)}</p>}
    </header>
  );
}
