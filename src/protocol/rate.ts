/** Window the rate is counted over. One second, so the figure reads as fps. */
export const RATE_WINDOW_MS = 1000;

/**
 * How many things happened in the last second, asked at any moment.
 *
 * Shared by both pages on purpose. The capture counts the frames it sends, the
 * overlay counts the frames it receives, and the two figures sit side by side
 * on screen while somebody works out where a stream went. Two implementations
 * of "per second" would eventually disagree by a little, and the difference
 * would be read as a real one.
 *
 * Sliding, not tumbling. A window that resets on a boundary splits a burst in
 * two and understates the peak — and makes the answer depend on when it is
 * asked, which is the one thing a diagnostic must not do.
 */
export interface RateCounter {
  tick(now: number): void;
  /**
   * The count, having first aged out whatever left the window.
   *
   * Takes the clock rather than being a getter, and that is the whole design:
   * a counter that only ages when something new arrives freezes at its last
   * value the moment the stream stops — 58/s printed next to a dead link.
   */
  read(now: number): number;
  /** For tests: the window must not grow while nobody reads it. */
  readonly size: number;
}

export function createRateCounter(windowMs: number = RATE_WINDOW_MS): RateCounter {
  const at: number[] = [];

  function trim(now: number) {
    while (at.length > 0 && now - at[0]! >= windowMs) at.shift();
  }

  return {
    tick(now) {
      // Trimmed here as well as on read: both callers sit on a hot path, and
      // the overlay can run a whole stream with nobody looking at the figure.
      // Without this the array would grow for hours.
      at.push(now);
      trim(now);
    },
    read(now) {
      trim(now);
      return at.length;
    },
    get size() {
      return at.length;
    },
  };
}
