import { describe, it, expect } from 'vitest';
import { ISO_GEOMETRY, geometryFor, placeNewKey } from './geometry';

describe('ISO geometry table', () => {
  it('gives every usage a unique KeyboardEvent code', () => {
    const codes = ISO_GEOMETRY.map((k) => k.code);
    const usages = ISO_GEOMETRY.map((k) => k.usage);

    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(usages).size).toBe(usages.length);
  });

  it('covers a full ISO keyboard', () => {
    expect(ISO_GEOMETRY.length).toBeGreaterThanOrEqual(105);
  });

  it('gives the space bar its real width', () => {
    expect(geometryFor(0x2c)).toMatchObject({ code: 'Space', w: 6.25, h: 1 });
  });

  it('gives the modifiers their real width', () => {
    expect(geometryFor(0xe1)?.w).toBe(1.25); // ShiftLeft
    expect(geometryFor(0xe5)?.w).toBe(2.75); // ShiftRight
    expect(geometryFor(0x39)?.w).toBe(1.75); // CapsLock
    expect(geometryFor(0x2b)?.w).toBe(1.5); // Tab
  });

  it('treats the L-shaped ISO Enter as a two-row rectangle', () => {
    expect(geometryFor(0x28)).toMatchObject({ code: 'Enter', w: 1.25, h: 2 });
  });

  it('places the top-row letters side by side, on the same row', () => {
    const q = geometryFor(0x14)!; // usage Q, the A key on AZERTY
    const w = geometryFor(0x1a)!;
    const e = geometryFor(0x08)!;
    const r = geometryFor(0x15)!;

    expect([q.y, w.y, e.y, r.y]).toEqual([q.y, q.y, q.y, q.y]);
    expect([w.x - q.x, e.x - w.x, r.x - e.x]).toEqual([1, 1, 1]);
  });

  it('returns undefined for a usage missing from the table', () => {
    expect(geometryFor(0xff)).toBeUndefined();
  });
});

describe('ISO geometry table - 105 entries typed by hand', () => {
  // Unique codes prove nothing about placement. One mistyped coordinate puts
  // two keys on top of each other, and the only way anyone would find out is
  // by looking at a rendered keyboard and thinking something seems off.
  it('never puts two keys in the same place', () => {
    const overlaps: string[] = [];

    for (let i = 0; i < ISO_GEOMETRY.length; i++) {
      for (let j = i + 1; j < ISO_GEOMETRY.length; j++) {
        const a = ISO_GEOMETRY[i]!;
        const b = ISO_GEOMETRY[j]!;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        if (!apart) overlaps.push(`${a.code} overlaps ${b.code}`);
      }
    }

    expect(overlaps).toEqual([]);
  });

  it('keeps every key on the board, at a size that can be drawn', () => {
    for (const key of ISO_GEOMETRY) {
      expect(key.x, key.code).toBeGreaterThanOrEqual(0);
      expect(key.y, key.code).toBeGreaterThanOrEqual(0);
      expect(key.w, key.code).toBeGreaterThan(0);
      expect(key.h, key.code).toBeGreaterThan(0);
    }
  });

  it('starts at the origin, so a full board needs no reframing', () => {
    expect(Math.min(...ISO_GEOMETRY.map((k) => k.x))).toBe(0);
    expect(Math.min(...ISO_GEOMETRY.map((k) => k.y))).toBe(0);
  });
});

describe('placeNewKey', () => {
  it('places the first key at the origin', () => {
    expect(placeNewKey([], 0x1a)).toEqual([{ x: 0, y: 0 }]);
  });

  it('places the new key relative to the existing ones, without moving them', () => {
    // Z is already placed (usage W). We add S (usage S), one row down, right.
    const placed = placeNewKey([{ usage: 0x1a, x: 0, y: 0 }], 0x16);

    expect(placed).toEqual([
      { x: 0, y: 0 },
      { x: 0.25, y: 1 },
    ]);
  });

  it('reframes the whole set when the new key falls left of the origin', () => {
    // Q (usage A) sits left of Z (usage W): everything slides to the right.
    const placed = placeNewKey([{ usage: 0x1a, x: 0, y: 0 }], 0x04);

    expect(placed).toEqual([
      { x: 0.75, y: 0 },
      { x: 0, y: 1 },
    ]);
  });

  it('does not reframe keys already moved by hand when it is not needed', () => {
    const placed = placeNewKey([{ usage: 0x1a, x: 10, y: 10 }], 0x04);

    expect(placed).toEqual([
      { x: 10, y: 10 },
      { x: 9.25, y: 11 },
    ]);
  });

  it('places an unknown usage right of the set, without moving anything', () => {
    const placed = placeNewKey([{ usage: 0x1a, x: 0, y: 0 }], 0xff);

    expect(placed[0]).toEqual({ x: 0, y: 0 });
    expect(placed[1]?.y).toBe(0);
    expect(placed[1]?.x).toBeGreaterThan(0);
  });

  it('anchors on a known key even when an unknown one sits in the list', () => {
    const placed = placeNewKey(
      [
        { usage: 0xff, x: 5, y: 5 },
        { usage: 0x1a, x: 0, y: 0 },
      ],
      0x16,
    );

    expect(placed[2]).toEqual({ x: 0.25, y: 1 });
  });

  it('rebuilds a whole keyboard in the shape of a keyboard', () => {
    // The point of the table, learned key by key: A Z E R on an AZERTY board
    // are Q W E R by usage, and they must come out on one row, adjacent.
    let learned: { usage: number; x: number; y: number }[] = [];
    for (const usage of [0x14, 0x1a, 0x08, 0x15]) {
      const placed = placeNewKey(learned, usage);
      learned = placed.map((position, index) => ({
        usage: index === placed.length - 1 ? usage : learned[index]!.usage,
        ...position,
      }));
    }

    expect(learned.map((k) => k.y)).toEqual([0, 0, 0, 0]);
    expect(learned.map((k) => k.x)).toEqual([0, 1, 2, 3]);
  });

  it('gives no key a negative position, whatever the order they are learned in', () => {
    // Reframing exists for this: learn the rightmost key first and every
    // later one lands before the origin.
    const order = [0x15, 0x08, 0x1a, 0x14];
    let learned: { usage: number; x: number; y: number }[] = [];

    for (const usage of order) {
      const placed = placeNewKey(learned, usage);
      learned = placed.map((position, index) => ({
        usage: index === placed.length - 1 ? usage : learned[index]!.usage,
        ...position,
      }));
    }

    for (const key of learned) expect(key.x).toBeGreaterThanOrEqual(0);
  });
});

describe('placeNewKey - which key it measures from', () => {
  it('anchors on the nearest placed key, not the first one learned', () => {
    // Z at the origin, Ctrl left moved away to (5, 5). Space belongs next to
    // Ctrl left on a real board, so that is what it should follow — anchoring
    // on Z would drop it somewhere unrelated to the block being worked on.
    const placed = placeNewKey(
      [
        { usage: 0x1a, x: 0, y: 0 }, // KeyW, learned first
        { usage: 0xe0, x: 5, y: 5 }, // ControlLeft, moved by hand
      ],
      0x2c, // Space
    );

    expect(placed[2]).toEqual({ x: 8.75, y: 5 });
  });

  it('still lines up a row learned left to right', () => {
    // The nearest anchor and the first anchor agree here, which is why the
    // change is invisible on the common case.
    let learned: { usage: number; x: number; y: number }[] = [];
    for (const usage of [0x14, 0x1a, 0x08, 0x15]) {
      const placed = placeNewKey(learned, usage);
      learned = placed.map((position, index) => ({
        usage: index === placed.length - 1 ? usage : learned[index]!.usage,
        ...position,
      }));
    }

    expect(learned.map((k) => k.x)).toEqual([0, 1, 2, 3]);
  });

  it('measures distance on the reference board, not on the screen', () => {
    // Both placed keys sit at the same spot on screen; only their reference
    // positions can tell which one Space belongs beside.
    const placed = placeNewKey(
      [
        { usage: 0x29, x: 3, y: 3 }, // Escape, far from Space on a board
        { usage: 0xe2, x: 3, y: 3 }, // AltLeft, right next to Space
      ],
      0x2c,
    );

    // AltLeft is at 2.5 on the reference board, Space at 3.75: one unit apart.
    expect(placed[2]).toEqual({ x: 4.25, y: 3 });
  });
});
