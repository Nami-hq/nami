// Pure playback rules for the intro skip and the end-of-episode next prompt.
// No DOM here: the player imports these, and the tests drive them directly.

export const DEFAULT_INTRO_START = 5;
export const DEFAULT_INTRO_LENGTH = 85;
export const DEFAULT_OUTRO_SECONDS = 35;
const MAX_SKIP_SAMPLES = 7;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The intro window for a title: the learned one when it exists, the default otherwise. */
export function introWindow(settings = {}, learned = null) {
  const start = clamp(Number(learned?.start ?? settings.introStart ?? DEFAULT_INTRO_START), 0, 900);
  const length = clamp(Number(settings.introLength ?? DEFAULT_INTRO_LENGTH), 5, 300);
  const learnedEnd = Number(learned?.end);
  const end = Number.isFinite(learnedEnd) && learnedEnd > start + 5 ? learnedEnd : start + length;
  return { start, end };
}

export function shouldOfferSkipIntro({
  currentTime,
  duration,
  settings = {},
  learned = null,
  playing = true,
}) {
  if (!playing) return false;
  if (settings.introSkip === false) return false;
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (!Number.isFinite(currentTime) || currentTime < 0) return false;
  const { start, end } = introWindow(settings, learned);
  if (duration < start + 15 || end >= duration - 5) return false;
  return currentTime >= start && currentTime < end - 3;
}

/** Where a skip should land: the learned end, never backwards. */
export function nextIntroEnd({ currentTime = 0, settings = {}, learned = null } = {}) {
  const { end } = introWindow(settings, learned);
  const base = Number.isFinite(currentTime) ? currentTime : 0;
  return Math.max(end, base + 2);
}

/** Fold a skip into what we have learned about this title's intro. */
export function learnIntroSkips({ skips = [], at, settings = {}, learned = null } = {}) {
  const list = [...skips.map(Number).filter(Number.isFinite), Number(at)]
    .filter(Number.isFinite)
    .slice(-MAX_SKIP_SAMPLES)
    .sort((a, b) => a - b);
  const { start } = introWindow(settings, learned);
  const end = clamp(median(list) + 2, start + 20, start + 200);
  return { start, end, skips: list };
}

export function remainingSeconds(currentTime, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const current = Number.isFinite(currentTime) ? currentTime : 0;
  return Math.max(0, duration - current);
}

/** Keep the fresher of two learned marks so a late answer cannot move it back. */
export function pickLearnedMark(current = null, incoming = null) {
  if (!current) return incoming || null;
  if (!incoming) return current;
  const currentAt = Number(current.updatedAt) || 0;
  const incomingAt = Number(incoming.updatedAt) || 0;
  if (incomingAt !== currentAt) return incomingAt > currentAt ? incoming : current;
  return (Number(incoming.end) || 0) > (Number(current.end) || 0) ? incoming : current;
}

/** The next prompt appears once the outro starts, not only when the file ends. */
export function shouldOfferNext({ currentTime, duration, settings = {}, playing = true }) {
  if (!playing) return false;
  if (settings.outroSkip === false) return false;
  if (!Number.isFinite(duration) || duration <= 0) return false;
  const remaining = remainingSeconds(currentTime, duration);
  if (remaining <= 0.5) return false;
  const window = clamp(Number(settings.outroSeconds ?? DEFAULT_OUTRO_SECONDS), 5, 300);
  return remaining <= window;
}
