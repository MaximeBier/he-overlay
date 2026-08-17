import { describe, it, expect } from 'vitest';
import { buildFrame, createFrameEmitter, isRest, sameFrame, FRAME_INTERVAL_MS } from './emit';
import type { AnalogEntry } from '../keyboard/decode';

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

describe('isRest', () => {
  it('recognises a complete return to rest', () => {
    expect(
      isRest([
        [3, 0, 0],
        [9, 0, 0],
      ]),
    ).toBe(true);
    expect(isRest([])).toBe(true);
  });

  it('rejects a frame where a key is still pressed or still active', () => {
    expect(isRest([[3, 1, 0]])).toBe(false);
    expect(isRest([[3, 0, 1]])).toBe(false);
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

    expect(emitter.push([[3, 100, 0]], 0)).toBe('interval');
  });

  it('never emits the same frame twice', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0);

    expect(emitter.push([[3, 100, 0]], 1000)).toBeNull();
  });

  it('sacrifices intermediate variations inside the silence window', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0);

    expect(emitter.push([[3, 120, 0]], 3)).toBeNull();
    expect(emitter.push([[3, 140, 0]], FRAME_INTERVAL_MS + 1)).toBe('interval');
  });

  it('emits an actuation change immediately', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0);

    expect(emitter.push([[3, 110, 1]], 1)).toBe('active-change');
  });

  it('emits the release of a key immediately', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 1]], 0);

    expect(emitter.push([[3, 90, 0]], 1)).toBe('active-change');
  });

  // Test 2 of spec §12.1 — the vicious defect of a naive throttle.
  it('never sacrifices the return-to-rest frame, even inside the silence window', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 400, 0]], 0);

    expect(emitter.push([[3, 0, 0]], 1)).toBe('rest');
  });

  // Generalisation of the branch above: the frame that freezes is the last one
  // of a release, and nothing says the other keys were at rest at that moment.
  it('emits a single key returning to rest while another one is held down', () => {
    const emitter = createFrameEmitter();
    emitter.push(
      [
        [3, 400, 0],
        [9, 700, 1],
      ],
      0,
    );

    expect(
      emitter.push(
        [
          [3, 0, 0],
          [9, 700, 1],
        ],
        1,
      ),
    ).toBe('rest');
  });

  it('treats a key dropped from the frame as fully released', () => {
    const emitter = createFrameEmitter();
    emitter.push(
      [
        [3, 400, 0],
        [9, 700, 1],
      ],
      0,
    );

    expect(emitter.push([[9, 700, 1]], 1)).toBe('rest');
  });

  it('measures the emission rate in frames per second', () => {
    const emitter = createFrameEmitter();
    for (let i = 0; i < 10; i++) emitter.push([[3, i * 10, 0]], i * FRAME_INTERVAL_MS * 1.01);

    expect(emitter.rate).toBeGreaterThan(0);
    expect(emitter.rate).toBeLessThanOrEqual(61);
  });

  // A burst of off-cadence emissions is normal — every actuation change is one.
  // Reading a single short interval as a rate would report a thousand frames
  // per second at every keystroke.
  it('never reports a rate a burst of close emissions could not sustain', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0);
    emitter.push([[3, 110, 1]], 1);
    emitter.push([[3, 120, 0]], 2);

    expect(emitter.rate).toBe(3);
  });

  it('forgets the emissions older than one second', () => {
    const emitter = createFrameEmitter();
    emitter.push([[3, 100, 0]], 0);
    emitter.push([[3, 200, 0]], 2000);

    expect(emitter.rate).toBe(1);
  });
});
