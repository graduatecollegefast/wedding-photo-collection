// Human-readable messages for guests. Technical details are logged server-side.

export function uploadErrorMessage(kind, mediaKind = 'image', serverMessage) {
  const noun = mediaKind === 'video' ? 'video' : 'photo';
  switch (kind) {
    case 'offline':
      return `You're offline. Your other ${noun}s are safe. We'll try this one again when you reconnect.`;
    case 'too_large':
      return `This ${noun} is too large to upload.`;
    case 'unsupported':
      return `This file type isn't supported.`;
    case 'register':
      return `Your ${noun} uploaded but isn't in the album yet. Tap to try again.`;
    case 'event':
      return serverMessage || 'Uploads are not open right now.';
    case 'network':
    case 'cloudinary':
    default:
      return `We couldn't upload this ${noun}. Your other ${noun}s are safe. Tap to try this one again.`;
  }
}

export const EVENT_STATUS_MESSAGES = {
  closed: 'Uploads for this wedding are now closed.',
  expired: 'This wedding gallery has expired.',
  draft: 'This page isn’t open for photos yet. Please check back soon.',
};
