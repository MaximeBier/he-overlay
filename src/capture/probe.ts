/**
 * The two figures of spec §2.2, measured on the report stream itself.
 *
 * Global constraint 1 forbids timers here, and this is the measurement that
 * would most obviously reach for one — which is exactly why it must not: a
 * probe built on `setInterval` in a background tab measures the throttling of
 * its own clock, and reports the stream as dead whatever the keyboard is
 * doing. Everything below is computed inside the `inputreport` handler, from
 * the timestamps the events carry.
 */
export interface StreamReading {
  reports: number;
  /** The widest silence between two consecutive reports, in milliseconds. */
  maxGapMs: number;
  /** How long the probe has been watching. Without it the count means nothing. */
  sinceMs: number;
}

export interface StreamProbe {
  start(now: number): void;
  stop(now: number): void;
  observe(now: number): void;
  readonly running: boolean;
  reading(): StreamReading | null;
}

export function createStreamProbe(): StreamProbe {
  let startedAt: number | null = null;
  let stoppedAt: number | null = null;
  let last: number | null = null;
  let reports = 0;
  let maxGapMs = 0;

  return {
    start(now) {
      // A fresh run every time: adding to the previous one would carry a gap
      // measured across the pause between them, which is not a silence.
      startedAt = now;
      stoppedAt = null;
      last = null;
      reports = 0;
      maxGapMs = 0;
    },

    stop(now) {
      if (startedAt === null || stoppedAt !== null) return;
      stoppedAt = now;
    },

    observe(now) {
      if (startedAt === null || stoppedAt !== null) return;

      reports += 1;
      // Measured between reports, never from the start: someone starts the
      // probe and *then* alt-tabs to the game, and charging that delay to the
      // keyboard would report throttling that never happened.
      if (last !== null) maxGapMs = Math.max(maxGapMs, now - last);
      last = now;
    },

    get running() {
      return startedAt !== null && stoppedAt === null;
    },

    reading() {
      if (startedAt === null) return null;
      const until = stoppedAt ?? last ?? startedAt;
      return { reports, maxGapMs, sinceMs: until - startedAt };
    },
  };
}
