import { describe, it, expect } from 'vitest';
import { buildFrame, createFrameEmitter, sameFrame, FRAME_INTERVAL_MS, TRAVEL_STEP } from './emit';
import type { AnalogEntry } from '../keyboard/decode';
import type { FrameKey } from './messages';

/** Delivery that always succeeds, for the tests that are not about delivery. */
const sent = () => true;
/** Delivery that never leaves — what broadcast does with OBS disconnected. */
const dropped = () => false;

const entry = (index: number, travel: number, active: boolean): AnalogEntry => ({
  index,
  usage: 0x04,
  travel,
  active,
});

describe('buildFrame', () => {
  it('carries every key when no selection is given', () => {
    expect(buildFrame([entry(3, 500, false), entry(9, 1023, true)], null)).toEqual([
      [3, 500, 0],
      [9, 1023, 1],
    ]);
  });

  it('carries the configured keys only: the overlay filters nothing', () => {
    expect(buildFrame([entry(3, 500, false), entry(9, 1023, true)], [9])).toEqual([[9, 1023, 1]]);
  });

  // Test 3 of spec §12.1 — without this a key stays lit forever.
  it('gives zero travel and inactive to a configured key missing from the report', () => {
    expect(buildFrame([entry(9, 1023, true)], [9, 3])).toEqual([
      [9, 1023, 1],
      [3, 0, 0],
    ]);
  });

  it('keeps the order of the configuration, not the order of the report', () => {
    expect(buildFrame([entry(9, 10, false), entry(3, 20, false)], [3, 9])).toEqual([
      [3, 20, 0],
      [9, 10, 0],
    ]);
  });
});

describe('sameFrame', () => {
  it('compares identifiers, travels and actuations', () => {
    expect(sameFrame([[3, 10, 0]], [[3, 10, 0]])).toBe(true);
    expect(sameFrame([[3, 10, 0]], [[3, 11, 0]])).toBe(false);
    expect(sameFrame([[3, 10, 0]], [[3, 10, 1]])).toBe(false);
    expect(sameFrame([[3, 10, 0]], [[4, 10, 0]])).toBe(false);
    expect(sameFrame(null, [[3, 10, 0]])).toBe(false);
    expect(sameFrame([[3, 10, 0]], [])).toBe(false);
  });
});

describe('createFrameEmitter', () => {
  it('emits the first frame', () => {
    const emitter = createFrameEmitter();

    expect(emitter.push([[3, 100, 0]], 0, sent)).toBe('interval');
  });

  it('never emits the same frame twice', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);

    expect(emitter.push([[3, 100, 0]], 1000, sent)).toBeNull();
  });

  it('sacrifices intermediate variations inside the silence window', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);

    expect(emitter.push([[3, 120, 0]], 3, sent)).toBeNull();
    expect(emitter.push([[3, 140, 0]], FRAME_INTERVAL_MS + 1, sent)).toBe('interval');
  });

  it('emits an actuation change immediately', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);

    expect(emitter.push([[3, 110, 1]], 1, sent)).toBe('active-change');
  });

  it('emits the release of a key immediately', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 1]], 0, sent);

    expect(emitter.push([[3, 90, 0]], 1, sent)).toBe('active-change');
  });

  // Test 2 of spec §12.1 — the vicious defect of a naive throttle.
  it('never sacrifices the return-to-rest frame, even inside the silence window', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 400, 0]], 0, sent);

    expect(emitter.push([[3, 0, 0]], 1, sent)).toBe('rest');
  });

  // Generalisation of the branch above: the frame that freezes is the last one
  // of a release, and nothing says the other keys were at rest at that moment.
  it('emits a single key returning to rest while another one is held down', () => {
    const emitter = createFrameEmitter();
    const held: FrameKey[] = [
      [3, 400, 0],
      [9, 700, 1],
    ];
    emitter.push(held, 0, sent);

    const released: FrameKey[] = [
      [3, 0, 0],
      [9, 700, 1],
    ];
    expect(emitter.push(released, 1, sent)).toBe('rest');
  });

  it('treats a key dropped from the frame as fully released', () => {
    const emitter = createFrameEmitter();
    const held: FrameKey[] = [
      [3, 400, 0],
      [9, 700, 1],
    ];
    emitter.push(held, 0, sent);

    expect(emitter.push([[9, 700, 1]], 1, sent)).toBe('rest');
  });

  // The rest branch skips the frame cap by design, so it needs a floor of its
  // own. A key resting on the very bottom of its travel and flickering 1↔0
  // would otherwise send one frame per report — up to a thousand a second, one
  // obs-websocket request each. Nothing is lost: a release from a travel of two
  // out of 1023 is invisible, and the cap carries it within 16 ms anyway. This
  // is the one-or-two-level threshold spec §6.2 keeps in reserve.
  it('does not let a flickering key at the bottom of its travel bypass the cap', () => {
    const emitter = createFrameEmitter();
    emitter.push(
      [
        [3, 1, 0],
        [9, 700, 1],
      ],
      0,
      sent,
    );

    const flicker: FrameKey[] = [
      [3, 0, 0],
      [9, 700, 1],
    ];
    expect(emitter.push(flicker, 1, sent)).toBeNull();
  });

  it('still releases a key that had travelled past the floor', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 3, 0]], 0, sent);

    expect(emitter.push([[3, 0, 0]], 1, sent)).toBe('rest');
  });

  it('measures the emission rate in frames per second', () => {
    const emitter = createFrameEmitter();
    for (let i = 0; i < 10; i++) emitter.push([[3, i * 10, 0]], i * FRAME_INTERVAL_MS * 1.01, sent);

    expect(emitter.rate).toBeGreaterThan(0);
    expect(emitter.rate).toBeLessThanOrEqual(61);
  });

  // A burst of off-cadence emissions is normal — every actuation change is one.
  // Reading a single short interval as a rate would report a thousand frames
  // per second at every keystroke.
  it('never reports a rate a burst of close emissions could not sustain', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);
    emitter.push([[3, 110, 1]], 1, sent);
    emitter.push([[3, 120, 0]], 2, sent);

    expect(emitter.rate).toBe(3);
  });

  it('forgets the emissions older than one second', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);
    emitter.push([[3, 200, 0]], 2000, sent);

    expect(emitter.rate).toBe(1);
  });
});

describe('createFrameEmitter — the far end only saw what actually left', () => {
  it('reports nothing emitted when delivery fails', () => {
    const emitter = createFrameEmitter();

    expect(emitter.push([[3, 100, 0]], 0, dropped)).toBeNull();
  });

  it('does not remember a frame that never left', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, dropped);

    expect(emitter.push([[3, 100, 0]], 1, sent)).toBe('interval');
  });

  it('does not count a frame that never left towards the rate', () => {
    // Otherwise the status bar reads "60 fps" next to a dot saying OBS is gone.
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, dropped);
    emitter.push([[3, 200, 0]], 1, dropped);

    expect(emitter.rate).toBe(0);
  });

  it('lets the rate fall back to zero once nothing is going out', () => {
    // Trimming only on a successful send leaves the window frozen the moment
    // OBS goes away: the last good count stays on screen for good, next to a
    // dot saying the connection is dead.
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);
    emitter.push([[3, 200, 0]], 100, sent);
    expect(emitter.rate).toBe(2);

    emitter.push([[3, 300, 0]], 2000, dropped);

    expect(emitter.rate).toBe(0);
  });

  it('ages the window out even on frames the cap sacrifices', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);

    // Identical frame, so nothing is emitted — but a second has gone by.
    emitter.push([[3, 100, 0]], 2000, sent);

    expect(emitter.rate).toBe(0);
  });

  // The milestone 2 review found this one, and it is spec §6.2 all over again:
  // the release frame is lost, nothing follows it because nothing is being
  // touched, and the overlay keeps a half-pressed key on screen. Only this time
  // the frame is swallowed by a dead connection rather than by the cap.
  it('replays the release that was lost while OBS was down', () => {
    const emitter = createFrameEmitter();
    const delivered: FrameKey[][] = [];
    let live = true;
    const deliver = (frame: FrameKey[]) => {
      if (live) delivered.push(frame);
      return live;
    };

    emitter.push([[9, 700, 1]], 0, deliver);
    live = false;
    emitter.push([[9, 0, 0]], 1, deliver); // released with OBS gone: lost
    live = true;
    emitter.push([[9, 0, 0]], 2, deliver); // the very next report, identical

    expect(delivered).toEqual([[[9, 700, 1]], [[9, 0, 0]]]);
  });

  it('starts over after a reset, even on an identical frame', () => {
    // What a fresh overlay needs: it holds nothing, so what the previous one
    // was shown says nothing about what this one has seen.
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);

    emitter.reset();

    expect(emitter.push([[3, 100, 0]], 1, sent)).toBe('interval');
  });

  it('keeps the measured rate across a reset', () => {
    // Only knowledge of the far end is dropped, not the throughput measurement.
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0, sent);
    emitter.reset();

    expect(emitter.rate).toBe(1);
  });
});

describe('createFrameEmitter - a rise that stops at the top', () => {
  // Reported from OBS: pressing a key hard and holding it leaves the bar part
  // way up. The last report of the rise falls inside the silence window, and
  // the keyboard sends nothing more because nothing is changing — spec §6.2's
  // defect, upward. No timer can rescue it either: a backgrounded tab, which
  // is what a fullscreen game makes of the capture page, throttles timers to
  // one tick a minute.
  //
  // So the error is bounded by travel instead of by time.
  it('emits a large jump even inside the silence window', () => {
    const emitter = createFrameEmitter();
    const delivered: FrameKey[][] = [];
    const deliver = (f: FrameKey[]) => {
      delivered.push(f);
      return true;
    };

    emitter.push([[3, 0, 0]], 0, deliver);
    emitter.push([[3, 500, 1]], 1, deliver); // actuation
    emitter.push([[3, 800, 1]], 2, deliver);
    emitter.push([[3, 1023, 1]], 3, deliver); // and then the key is held

    expect(delivered.at(-1)).toEqual([[3, 1023, 1]]);
  });

  it('leaves the overlay no further from the truth than the threshold', () => {
    const emitter = createFrameEmitter();
    let last: FrameKey[] = [];
    const deliver = (f: FrameKey[]) => {
      last = f;
      return true;
    };

    // A full rise, one report per millisecond, all inside one window.
    for (let travel = 0; travel <= 1023; travel += 7) {
      emitter.push([[3, travel, 0]], travel / 7, deliver);
    }

    expect(1023 - last[0]![1]).toBeLessThanOrEqual(TRAVEL_STEP);
  });

  it('still sacrifices the small variations the eye cannot follow', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 500, 0]], 0, sent);

    expect(emitter.push([[3, 500 + TRAVEL_STEP - 1, 0]], 1, sent)).toBeNull();
  });

  it('counts the jump per key, so one moving key carries the frame', () => {
    const emitter = createFrameEmitter();
    const held: FrameKey = [9, 700, 1];
    emitter.push([held, [3, 0, 0]], 0, sent);

    expect(emitter.push([held, [3, 900, 0]], 1, sent)).toBe('jump');
  });
});

describe('createFrameEmitter - both ends of the travel are guaranteed', () => {
  // The rest branch guarantees zero always arrives. Nothing guaranteed the
  // other end, so a key held fully down could sit at 90 % on air — the travel
  // threshold bounds the error, it does not remove it, and the last report of
  // a rise is followed by silence.
  it('always emits a key that reaches the bottom of its travel', () => {
    const emitter = createFrameEmitter();
    const delivered: FrameKey[][] = [];
    const deliver = (f: FrameKey[]) => {
      delivered.push(f);
      return true;
    };

    emitter.push([[3, 0, 0]], 0, deliver);
    emitter.push([[3, 950, 1]], 1, deliver);
    // Within the threshold of the last emission, and inside the silence
    // window: nothing but this branch can carry it.
    emitter.push([[3, 1023, 1]], 2, deliver);

    expect(delivered.at(-1)).toEqual([[3, 1023, 1]]);
  });

  it('accepts a bottom-out a hair short of the maximum', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 960, 1]], 0, sent);

    expect(emitter.push([[3, 1021, 1]], 1, sent)).toBe('bottomed');
  });

  it('does not re-emit a key already resting at the bottom', () => {
    // A finger holding a key down jitters by a level or two. Firing on each
    // of those would be the flicker the rest floor exists to prevent.
    const emitter = createFrameEmitter();
    emitter.push([[3, 1023, 1]], 0, sent);

    expect(emitter.push([[3, 1022, 1]], 1, sent)).toBeNull();
  });

  it('guarantees the bottom for an axis key, which never actuates', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 940, 0]], 0, sent);

    expect(emitter.push([[3, 1023, 0]], 1, sent)).toBe('bottomed');
  });

  it('keeps the rest branch ahead of it', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 1023, 1]], 0, sent);

    expect(emitter.push([[3, 0, 0]], 1, sent)).toBe('active-change');
  });
});
