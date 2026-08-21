import type { AnalogEntry } from '../keyboard/decode';
import { createRateCounter } from './rate';
import { MAX_TRAVEL } from '../keyboard/analog-report';
import type { FrameKey } from './messages';

export const FRAME_INTERVAL_MS = 1000 / 60;

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

/**
 * Travel change that outranks the frame cap, out of 1023.
 *
 * The cap alone bounds the emission rate but not the error. A key pressed hard
 * and held reports its whole rise inside one silence window and then stops —
 * the keyboard only speaks when something changes — so the last value never
 * leaves and the overlay keeps whatever it caught on the way up. That is spec
 * §6.2's frozen key, upward, and no timer can rescue it: the capture page sits
 * in a background tab whenever the game is fullscreen, where timers are
 * throttled to one tick a minute.
 *
 * Bounding the error by travel instead fixes it without a clock. Ten percent
 * costs at most ten frames per full press — the same order as the cap — and
 * leaves the overlay never more than a tenth of a travel behind.
 */
export const TRAVEL_STEP = 102;

/**
 * Travel from which a key counts as bottomed out.
 *
 * The rest branch guarantees zero always arrives; this is its mirror at the
 * other end, and it is needed for the same reason. `TRAVEL_STEP` bounds the
 * error but does not remove it, so a rise that ends within one step of the
 * last emission — and is then followed by silence, because the key is held —
 * leaves the bar short of full on air while the preview shows it complete.
 *
 * The same two-level margin as the rest floor: a finger holding a key down
 * jitters, and both ends of the travel deserve the same tolerance.
 */
const BOTTOM_TRAVEL_CEILING = MAX_TRAVEL - REST_TRAVEL_FLOOR;

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
  let jumped = false;
  let bottomed = false;

  for (const id of new Set([...previous.keys(), ...current.keys()])) {
    const was = previous.get(id) ?? RELEASED;
    const now = current.get(id) ?? RELEASED;
    if (was.active !== now.active) actuation = true;
    if (was.travel > REST_TRAVEL_FLOOR && now.travel === 0) released = true;
    if (Math.abs(now.travel - was.travel) >= TRAVEL_STEP) jumped = true;
    if (was.travel < BOTTOM_TRAVEL_CEILING && now.travel >= BOTTOM_TRAVEL_CEILING) {
      bottomed = true;
    }
  }

  return { actuation, released, jumped, bottomed };
}

export type EmitReason = 'interval' | 'active-change' | 'rest' | 'bottomed' | 'jump' | null;

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
  /**
   * Frames per second at `now` — the clock is an argument, deliberately.
   *
   * As a getter reading its own last report timestamp, it froze the instant
   * the keyboard fell silent: the Wooting speaks only on change, so nothing
   * aged the window and the last figure stayed on screen indefinitely. That is
   * the exact failure `rate.ts` documents as the reason `read` takes a clock,
   * and the capture side was still getting it wrong.
   */
  rateAt(now: number): number;
}

export function createFrameEmitter(minIntervalMs: number = FRAME_INTERVAL_MS): FrameEmitter {
  let lastFrame: FrameKey[] | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  // The same counter the overlay reads its own figure from. Two of them would
  // eventually disagree by a little, and the two pills sit side by side on a
  // screen where somebody is working out where a stream went.
  const emitted = createRateCounter();

  function reasonFor(frame: FrameKey[], now: number): EmitReason {
    if (sameFrame(lastFrame, frame)) return null;
    if (lastFrame === null) return 'interval';

    const { actuation, released, jumped, bottomed } = compare(lastFrame, frame);
    if (actuation) return 'active-change';
    // A key coming back to rest is never sacrificed: nothing would follow it,
    // and the overlay would stay frozen on a half-pressed key (spec §6.2). The
    // spec words this branch as a complete return to rest; a single key is
    // enough, because the key that freezes is the one being released and the
    // others may well be held down at that very moment.
    if (released) return 'rest';
    // Measured against the last frame that actually left, so the gap between
    // what the overlay shows and what the keyboard reports can never exceed
    // one step — however fast the rise, and even if it stops at the top.
    // Both ends of the travel are guaranteed: zero above, and the bottom
    // here. Between them the error is bounded rather than zero.
    if (bottomed) return 'bottomed';
    if (jumped) return 'jump';

    if (now - lastSentAt >= minIntervalMs) return 'interval';
    return null;
  }

  return {
    push(frame, now, deliver) {
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
      emitted.tick(now);

      return reason;
    },
    reset() {
      // The rate is a measurement of our own throughput, not knowledge about
      // the far end, so it survives.
      lastFrame = null;
      lastSentAt = Number.NEGATIVE_INFINITY;
    },
    rateAt(now) {
      return emitted.read(now);
    },
  };
}
