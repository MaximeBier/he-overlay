import { describe, it, expect } from 'vitest';
import { GRID, moveKey, moveKeysBy, pixelsToUnits, resizeKeys, setMode, snap } from './layout';
import { defaultConfig, type OverlayConfig } from '../config/schema';

function config(): OverlayConfig {
  const base = defaultConfig();
  base.keys.push({ id: 1, usage: 0x14, mode: 'key', label: 'A', x: 0, y: 0, w: 1, h: 1 });
  return base;
}

function pair(): OverlayConfig {
  const base = config();
  base.keys.push({ id: 2, usage: 0x16, mode: 'key', label: 'S', x: 1.75, y: 2, w: 1, h: 1 });
  return base;
}

const origins = (c: OverlayConfig, ...ids: number[]) =>
  new Map(c.keys.filter((k) => ids.includes(k.id)).map((k) => [k.id, { x: k.x, y: k.y }]));

describe('snap', () => {
  it('snaps to the quarter key', () => {
    expect(snap(0.31)).toBe(0.25);
    expect(snap(0.4)).toBe(0.5);
    expect(snap(1.13)).toBe(1.25);
    expect(GRID).toBe(0.25);
  });

  it('accepts a custom grid', () => {
    expect(snap(0.4, 0.5)).toBe(0.5);
  });
});

describe('moveKey', () => {
  it('moves while snapping to the grid', () => {
    expect(moveKey(config(), 1, 2.13, 1.4).keys[0]).toMatchObject({ x: 2.25, y: 1.5 });
  });

  it('forbids negative positions', () => {
    expect(moveKey(config(), 1, -3, -1).keys[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('ignores an unknown id', () => {
    const before = config();

    expect(moveKey(before, 99, 5, 5)).toEqual(before);
  });

  it('refuses a value that is not a number', () => {
    // The numeric fields hand over whatever was typed; an empty one is NaN,
    // and NaN reaches the SVG as an attribute the browser discards.
    expect(moveKey(config(), 1, Number.NaN, 2).keys[0]).toMatchObject({ x: 0, y: 2 });
  });

  it('leaves the configuration it was given untouched', () => {
    const before = config();

    moveKey(before, 1, 5, 5);

    expect(before.keys[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('moveKeysBy', () => {
  it('moves the whole group by the same offset, snapped to the grid', () => {
    const before = pair();

    const after = moveKeysBy(before, origins(before, 1, 2), 1.13, 0.9);

    expect(after.keys[0]).toMatchObject({ x: 1.25, y: 1 });
    expect(after.keys[1]).toMatchObject({ x: 3, y: 3 });
  });

  it('snaps the offset, not the positions: relative alignments survive', () => {
    const before = pair();
    before.keys[1]!.x = 1.6; // deliberately off-grid key

    const after = moveKeysBy(before, origins(before, 1, 2), 1, 0);

    expect(after.keys[1]?.x).toBeCloseTo(2.6, 10);
  });

  it('does not move the keys outside the group', () => {
    const before = pair();

    const after = moveKeysBy(before, origins(before, 1), 1, 1);

    expect(after.keys[1]).toMatchObject({ x: 1.75, y: 2 });
  });

  it('stops the whole group at the edge instead of crushing it against the origin', () => {
    const before = pair();

    const after = moveKeysBy(before, origins(before, 1, 2), -5, 0);

    expect(after.keys[0]?.x).toBe(0);
    expect(after.keys[1]?.x).toBe(1.75);
  });

  it('always starts again from the origin positions, with no accumulation', () => {
    const before = pair();
    const memo = origins(before, 1, 2);

    const dragged = moveKeysBy(moveKeysBy(before, memo, 1, 0), memo, 2, 0);

    expect(dragged.keys[0]?.x).toBe(2);
  });

  it('does nothing when the drag carries no key', () => {
    const before = pair();

    expect(moveKeysBy(before, new Map(), 3, 3)).toBe(before);
  });
});

describe('resizeKeys', () => {
  it('resizes while snapping to the grid', () => {
    expect(resizeKeys(config(), [1], 6.2, 1.9).keys[0]).toMatchObject({ w: 6.25, h: 2 });
  });

  it('enforces a minimum size of a quarter key', () => {
    expect(resizeKeys(config(), [1], 0, -2).keys[0]).toMatchObject({ w: GRID, h: GRID });
  });

  it('applies the same size to the whole group', () => {
    const after = resizeKeys(pair(), [1, 2], 1.5, 1);

    expect(after.keys[0]?.w).toBe(1.5);
    expect(after.keys[1]?.w).toBe(1.5);
  });

  it('ignores an unknown id without touching the others', () => {
    const after = resizeKeys(pair(), [99], 2, 2);

    expect(after.keys[0]?.w).toBe(1);
  });

  it('refuses a size that is not a number', () => {
    expect(resizeKeys(config(), [1], Number.NaN, 2).keys[0]).toMatchObject({ w: GRID, h: 2 });
  });
});

describe('pixelsToUnits', () => {
  it('converts a screen movement into key units', () => {
    expect(pixelsToUnits(112, 56)).toBe(2);
  });
});

describe('setMode', () => {
  it('switches a key to axis mode', () => {
    expect(setMode(config(), [1], 'axis').keys[0]?.mode).toBe('axis');
  });

  it('switches the whole selection at once', () => {
    const after = setMode(pair(), [1, 2], 'axis');

    expect(after.keys.map((k) => k.mode)).toEqual(['axis', 'axis']);
  });

  it('leaves the keys outside the selection alone', () => {
    const after = setMode(pair(), [1], 'axis');

    expect(after.keys[1]?.mode).toBe('key');
  });

  it('changes nothing else about the key', () => {
    const before = config();

    const after = setMode(before, [1], 'axis');

    expect(after.keys[0]).toMatchObject({ id: 1, label: 'A', x: 0, y: 0, w: 1, h: 1 });
    expect(before.keys[0]?.mode).toBe('key');
  });
});
