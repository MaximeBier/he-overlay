import type { AnalogEntry } from '../keyboard/decode';

/** Practically full travel: ~98% of 1023. */
export const FULL_TRAVEL_THRESHOLD = 1000;

export interface AxisSuggester {
  /**
   * Takes in one report's worth of entries.
   *
   * Returns whether anything it knows changed — so the interface can tell the
   * one report in a thousand that matters from the rest. Reports arrive at up
   * to a thousand a second; a caller with no such signal would either
   * recompute its suggestion list at that rate or never notice at all.
   */
  observe(entries: readonly AnalogEntry[]): boolean;
  /** The key bottomed out without ever producing a keystroke (spec §7.4). */
  suggests(id: number): boolean;
  dismiss(id: number): void;
}

/**
 * Spots keys that travel their whole depth and never fire.
 *
 * That is the whole of what we can honestly observe. The keyboard tells us a
 * key moved and did not actuate; it does not tell us the key is bound to a
 * joystick axis in Wootility, and nothing on this side can find out. So the
 * suggestion is worded as the observation — "this key does not send a
 * keystroke" — and it stays a suggestion: the mode is never switched on its
 * own (spec §7.4).
 *
 * Both facts are remembered for the whole session and never expire. A key that
 * has fired once is mapped, and a hundred later presses that happen not to be
 * reported active do not unmap it.
 */
export function createAxisSuggester(): AxisSuggester {
  const wentFull = new Set<number>();
  const everActive = new Set<number>();
  const dismissed = new Set<number>();

  return {
    observe(entries) {
      let learned = false;
      for (const entry of entries) {
        if (entry.travel >= FULL_TRAVEL_THRESHOLD && !wentFull.has(entry.index)) {
          wentFull.add(entry.index);
          learned = true;
        }
        if (entry.active && !everActive.has(entry.index)) {
          everActive.add(entry.index);
          learned = true;
        }
      }
      return learned;
    },
    suggests(id) {
      return wentFull.has(id) && !everActive.has(id) && !dismissed.has(id);
    },
    dismiss(id) {
      dismissed.add(id);
    },
  };
}
