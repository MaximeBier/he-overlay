/** What the overlay needs of `crypto`, which is nothing in the worst case. */
export interface RandomSource {
  randomUUID?(): string;
}

let counter = 0;

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
 * The counter is what makes the fallback safe: two overlays mounting in the
 * same millisecond would otherwise be free to draw the same number, and the
 * capture page would count one listener where there are two.
 */
export function newOverlayId(source: RandomSource | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();

  counter += 1;
  return `overlay-${counter}-${Math.random().toString(36).slice(2, 10)}`;
}
