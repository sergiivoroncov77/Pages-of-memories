import type { SyntheticEvent } from 'react';

/**
 * Voices recorded in the browser (WebM) do not say how long they are, so the
 * player shows no length and cannot seek. Asking for the very end makes the
 * browser find the length; then the player goes back to the start.
 */
export function findRecordedDuration(event: SyntheticEvent<HTMLMediaElement>) {
  const media = event.currentTarget;
  if (media.duration !== Infinity) return;
  const found = () => {
    if (!Number.isFinite(media.duration)) return;
    media.removeEventListener('durationchange', found);
    media.currentTime = 0;
  };
  media.addEventListener('durationchange', found);
  media.currentTime = Number.MAX_SAFE_INTEGER;
}
