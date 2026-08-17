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

export function isRest(frame: readonly FrameKey[]): boolean {
  return frame.every(([, travel, active]) => travel === 0 && active === 0);
}

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
    if (was.travel > 0 && now.travel === 0) released = true;
  }

  return { actuation, released };
}

export type EmitReason = 'interval' | 'active-change' | 'rest' | null;

export interface FrameEmitter {
  /** Returns the reason to emit, or `null` when the frame is sacrificed. */
  push(frame: FrameKey[], now: number): EmitReason;
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

  return {
    push(frame, now) {
      const reason = reasonFor(frame, now);
      if (reason === null) return null;

      lastFrame = frame;
      lastSentAt = now;

      // Counted, not derived from the last interval: two thirds of the frames
      // go out off cadence — every actuation change does — and a single one
      // millisecond apart would read as a thousand frames per second.
      emittedAt.push(now);
      while (emittedAt.length > 0 && now - emittedAt[0]! >= RATE_WINDOW_MS) emittedAt.shift();

      return reason;
    },
    get rate() {
      return emittedAt.length;
    },
  };
}
