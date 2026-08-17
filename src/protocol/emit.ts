import type { AnalogEntry } from '../keyboard/decode';
import type { FrameKey } from './messages';

export const FRAME_INTERVAL_MS = 1000 / 60;

/** Window the emission rate is counted over. One second, so it reads as fps. */
const RATE_WINDOW_MS = 1000;

/**
 * A frame carries the configured keys only: the capture filters, the overlay has
 * no decision to take (spec §6). A configured key missing from the report means
 * zero travel and inactive, never "unchanged".
 */
export function buildFrame(entries: AnalogEntry[], ids: readonly number[] | null): FrameKey[] {
  if (ids === null) {
    return entries.map((e) => [e.index, e.travel, e.active ? 1 : 0] as const);
  }

  const byIndex = new Map(entries.map((e) => [e.index, e]));
  return ids.map((id) => {
    const entry = byIndex.get(id);
    return entry ? ([id, entry.travel, entry.active ? 1 : 0] as const) : ([id, 0, 0] as const);
  });
}

/**
 * Travel below which a release is not worth breaking the cap for.
 *
 * The rest branch skips the frame cap by design, so it needs a floor of its
 * own: a key resting on the very bottom of its travel and flickering 1↔0 would
 * send one frame per report, up to a thousand a second, one obs-websocket
 * request each. Nothing is lost — a release from two levels out of 1023 is
 * invisible, and the cap carries it within 16 ms. This is the one-or-two-level
 * threshold spec §6.2 keeps in reserve, and it is well under the 1.4 % that
 * §7.3 measured as the smallest travel ever seen in use.
 */
const REST_TRAVEL_FLOOR = 2;

export function sameFrame(a: readonly FrameKey[] | null, b: readonly FrameKey[]): boolean {
  if (a === null || a.length !== b.length) return false;
  return a.every((key, i) => {
    const other = b[i]!;
    return key[0] === other[0] && key[1] === other[1] && key[2] === other[2];
  });
}

/** What a key that appears in neither frame is worth. */
const RELEASED = { travel: 0, active: 0 as 0 | 1 };

function state(frame: readonly FrameKey[]) {
  return new Map(frame.map(([id, travel, active]) => [id, { travel, active }]));
}

/**
 * Compares two frames key by key.
 *
 * A key missing from a frame counts as fully released: with no selection the
 * keyboard drops released keys from its report, so absence and zero travel say
 * the same thing.
 */
function compare(before: readonly FrameKey[], after: readonly FrameKey[]) {
  const previous = state(before);
  const current = state(after);
  let actuation = false;
  let released = false;

  for (const id of new Set([...previous.keys(), ...current.keys()])) {
    const was = previous.get(id) ?? RELEASED;
    const now = current.get(id) ?? RELEASED;
    if (was.active !== now.active) actuation = true;
    if (was.travel > REST_TRAVEL_FLOOR && now.travel === 0) released = true;
  }

  return { actuation, released };
}

export type EmitReason = 'interval' | 'active-change' | 'rest' | null;

/** Hands a frame to the far end. `false` means it went nowhere. */
export type Deliver = (frame: FrameKey[]) => boolean;

export interface FrameEmitter {
  /**
   * Decides, delivers, and only then remembers.
   *
   * Delivery is passed in rather than done by the caller afterwards, because
   * the two must not be able to disagree. An emitter that recorded a frame
   * `broadcast` had dropped would believe the overlay had seen a state it never
   * received, and would then deduplicate every identical frame that followed —
   * the frozen half-pressed key of spec §6.2, this time caused by a dead
   * connection instead of the cap.
   *
   * Returns the reason the frame went out, or `null` when it was sacrificed or
   * failed to leave.
   */
  push(frame: FrameKey[], now: number, deliver: Deliver): EmitReason;
  /**
   * Forgets what the far end has seen, so the next frame goes out whatever it
   * holds. Sent on a `hello`: a fresh overlay is showing nothing, and what its
   * predecessor was given says nothing about what it has.
   */
  reset(): void;
  /** Frames per second, counted over report timestamps — never over a timer. */
  readonly rate: number;
}

export function createFrameEmitter(minIntervalMs: number = FRAME_INTERVAL_MS): FrameEmitter {
  let lastFrame: FrameKey[] | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  const emittedAt: number[] = [];

  function reasonFor(frame: FrameKey[], now: number): EmitReason {
    if (sameFrame(lastFrame, frame)) return null;
    if (lastFrame === null) return 'interval';

    const { actuation, released } = compare(lastFrame, frame);
    if (actuation) return 'active-change';
    // A key coming back to rest is never sacrificed: nothing would follow it,
    // and the overlay would stay frozen on a half-pressed key (spec §6.2). The
    // spec words this branch as a complete return to rest; a single key is
    // enough, because the key that freezes is the one being released and the
    // others may well be held down at that very moment.
    if (released) return 'rest';

    if (now - lastSentAt >= minIntervalMs) return 'interval';
    return null;
  }

  /** Ages emissions out of the rate window. */
  function trim(now: number) {
    while (emittedAt.length > 0 && now - emittedAt[0]! >= RATE_WINDOW_MS) emittedAt.shift();
  }

  return {
    push(frame, now, deliver) {
      // Trimmed on every report, not only when a frame goes out. Doing it on
      // success alone freezes the window the moment OBS goes away — nothing
      // leaves, so nothing ages, and the last good count stays on screen for
      // good beside a dot saying the connection is dead.
      trim(now);

      const reason = reasonFor(frame, now);
      if (reason === null) return null;
      // Nothing is recorded until the frame is out. A dropped broadcast leaves
      // the emitter exactly where it was, so the same frame goes again on the
      // next report rather than being deduplicated against a state the overlay
      // never received.
      if (!deliver(frame)) return null;

      lastFrame = frame;
      lastSentAt = now;

      // Counted, not derived from the last interval: two thirds of the frames
      // go out off cadence — every actuation change does — and a single one
      // millisecond apart would read as a thousand frames per second.
      emittedAt.push(now);

      return reason;
    },
    reset() {
      // The rate is a measurement of our own throughput, not knowledge about
      // the far end, so it survives.
      lastFrame = null;
      lastSentAt = Number.NEGATIVE_INFINITY;
    },
    get rate() {
      return emittedAt.length;
    },
  };
}
