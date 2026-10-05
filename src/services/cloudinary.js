// Direct browser -> Cloudinary uploads using a short-lived signature from our server.
// Large files go up in 6 MB chunks so a dropped connection only repeats one chunk.

const CHUNK_THRESHOLD = 20 * 1024 * 1024;
const CHUNK_SIZE = 6 * 1024 * 1024; // Cloudinary needs chunks of at least 5 MB (except the last)
const STALL_MS = 60000; // abort if no bytes move for a minute
const CHUNK_RETRIES = 3;

export class UploadError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // network | too_large | unsupported | stale | cloudinary | aborted
  }
}

function classify(status, body) {
  const msg = (body && body.error && body.error.message) || '';
  if (/stale request/i.test(msg)) return new UploadError('stale', msg);
  if (/too large|file size/i.test(msg)) return new UploadError('too_large', msg);
  if (/format|invalid image|invalid video|unsupported/i.test(msg)) return new UploadError('unsupported', msg);
  if (status >= 500 || status === 0) return new UploadError('cloudinary', msg || `Cloudinary ${status}`);
  return new UploadError('cloudinary', msg || `Cloudinary ${status}`);
}

function sendForm({ url, form, headers = {}, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastMove = Date.now();
    const stallTimer = setInterval(() => {
      if (Date.now() - lastMove > STALL_MS) xhr.abort();
    }, 5000);
    const done = () => clearInterval(stallTimer);

    xhr.open('POST', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      lastMove = Date.now();
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      done();
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
      else reject(classify(xhr.status, body));
    };
    xhr.onerror = () => {
      done();
      reject(new UploadError('network', 'Network error'));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadError(signal && signal.aborted ? 'aborted' : 'network', 'Upload interrupted'));
    };
    if (signal) {
      if (signal.aborted) return xhr.abort();
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

function buildForm(sig, blob, filename) {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('api_key', sig.apiKey);
  form.append('signature', sig.signature);
  Object.entries(sig.params).forEach(([k, v]) => form.append(k, String(v)));
  return form;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Uploads one file. getSignature(forceRefresh) returns { url, apiKey, signature, params }.
 * onProgress(fraction 0..1).
 */
export async function uploadToCloudinary({ file, uploadId, getSignature, onProgress, signal }) {
  if (file.size <= CHUNK_THRESHOLD) {
    let sig = await getSignature(false);
    try {
      return await sendForm({
        url: sig.url,
        form: buildForm(sig, file, file.name),
        onProgress: (loaded, total) => onProgress && onProgress(loaded / total),
        signal,
      });
    } catch (err) {
      if (err.kind !== 'stale') throw err;
      sig = await getSignature(true);
      return sendForm({
        url: sig.url,
        form: buildForm(sig, file, file.name),
        onProgress: (loaded, total) => onProgress && onProgress(loaded / total),
        signal,
      });
    }
  }

  // Chunked upload: every chunk shares X-Unique-Upload-Id; the last response is the result.
  const total = file.size;
  let result = null;
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total) - 1;
    const blob = file.slice(start, end + 1);
    let attempt = 0;
    for (;;) {
      try {
        const sig = await getSignature(attempt > 0);
        result = await sendForm({
          url: sig.url,
          form: buildForm(sig, blob, file.name),
          headers: {
            'X-Unique-Upload-Id': uploadId,
            'Content-Range': `bytes ${start}-${end}/${total}`,
          },
          onProgress: (loaded) => onProgress && onProgress((start + loaded) / total),
          signal,
        });
        break;
      } catch (err) {
        attempt += 1;
        const retryable = err.kind === 'network' || err.kind === 'stale' || err.kind === 'cloudinary';
        if (!retryable || attempt > CHUNK_RETRIES || (signal && signal.aborted)) throw err;
        await sleep(1000 * attempt);
      }
    }
  }
  return result;
}
