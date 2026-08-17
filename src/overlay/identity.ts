/** What the overlay needs of `crypto`, which is nothing in the worst case. */
export interface RandomSource {
  randomUUID?(): string;
}

let counter = 0;

/** Eight base-36 characters, padded — `toString(36)` can come up short. */
function chunk(): string {
  return Math.random().toString(36).slice(2).padEnd(8, '0').slice(0, 8);
}

/**
 * A name the capture page can tell this overlay by (spec §11).
 *
 * Nothing here is a secret, so `randomUUID` is a convenience rather than a
 * requirement — and it is absent outside a secure context, which the overlay
 * genuinely reaches: `docs/deploy.md` offers `http://<lan-ip>:8080` as the
 * fallback for the day the CEF inside OBS enforces local network access.
 * Calling it unguarded there throws during setup, and a browser source that
 * fails to mount shows nothing at all for the rest of the stream.
 *
 * The fallback's uniqueness rests on `performance.timeOrigin` and two draws of
 * `Math.random`, not on the counter. Two OBS browser sources are two JavaScript
 * contexts, so both start their counter at zero and it tells them apart in no
 * way whatsoever — it only separates repeated calls within one page.
 * `timeOrigin` is the moment its own context was created, which is the one
 * thing here that genuinely differs between two sources.
 */
export function newOverlayId(source: RandomSource | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();

  counter += 1;
  const origin = Math.trunc(performance.timeOrigin).toString(36);
  return `overlay-${origin}-${counter}-${chunk()}${chunk()}`;
}
