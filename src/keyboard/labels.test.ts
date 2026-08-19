import { describe, it, expect } from 'vitest';
import { FALLBACK_LAYOUTS, labelFor, loadLayoutMap, resolveLayout } from './labels';

const azerty = new Map([
  ['KeyQ', 'a'],
  ['KeyW', 'z'],
  ['KeyA', 'q'],
  ['Semicolon', 'm'],
]);

describe('labelFor', () => {
  it('returns the character actually produced, not the HID usage', () => {
    // Usage Q on an AZERTY: the key printed A.
    expect(labelFor(0x14, azerty)).toBe('A');
  });

  it('uppercases the letter, the way the keycap prints it', () => {
    expect(labelFor(0x1a, azerty)).toBe('Z');
  });

  it('falls back to the position name when the layout stays silent', () => {
    expect(labelFor(0x2c, azerty)).toBe('Space');
    expect(labelFor(0xe1, azerty)).toBe('ShiftLeft');
  });

  it('falls back to the position name when the API is unavailable', () => {
    expect(labelFor(0x14, null)).toBe('KeyQ');
  });

  it('returns an explicit label for an unknown usage', () => {
    expect(labelFor(0xff, azerty)).toBe('HID 0xff');
  });

  it('leaves a punctuation mark alone', () => {
    expect(labelFor(0x33, azerty)).toBe('M');
    expect(labelFor(0x33, new Map([['Semicolon', ';']]))).toBe(';');
  });

  it('treats an empty answer as no answer', () => {
    expect(labelFor(0x14, new Map([['KeyQ', '']]))).toBe('KeyQ');
  });
});

describe('resolveLayout', () => {
  it('trusts detection in auto mode', () => {
    expect(resolveLayout('auto', azerty)).toBe(azerty);
  });

  it('lets the explicit choice win over a wrong detection', () => {
    const forced = resolveLayout('qwerty', azerty);

    expect(labelFor(0x14, forced)).toBe('Q');
  });

  it('serves as a fallback when detection is unavailable', () => {
    expect(labelFor(0x14, resolveLayout('azerty', null))).toBe('A');
    expect(labelFor(0x1d, resolveLayout('qwertz', null))).toBe('Y');
  });
});

describe('the three fallback layouts', () => {
  // They are picked precisely when detection is wrong, so switching between
  // them must never make a label worse. A position present in one map and
  // absent from another degrades to the position name on that layout only —
  // KeyY read "Y" on qwertz and "KeyY" on qwerty.
  it('cover exactly the same positions', () => {
    const [first, ...rest] = Object.values(FALLBACK_LAYOUTS).map((layout) =>
      [...(layout as Map<string, string>).keys()].sort(),
    );

    for (const codes of rest) expect(codes).toEqual(first);
  });

  it('gives every one of those positions a real character', () => {
    for (const [name, layout] of Object.entries(FALLBACK_LAYOUTS)) {
      for (const [code, produced] of layout as Map<string, string>) {
        expect(produced, `${name}/${code}`).not.toBe('');
      }
    }
  });

  it('swaps Z and Y on qwertz, which is the whole point of the name', () => {
    expect(labelFor(0x1d, resolveLayout('qwertz', null))).toBe('Y');
    expect(labelFor(0x1c, resolveLayout('qwertz', null))).toBe('Z');
    expect(labelFor(0x1d, resolveLayout('qwerty', null))).toBe('Z');
    expect(labelFor(0x1c, resolveLayout('qwerty', null))).toBe('Y');
  });
});

describe('loadLayoutMap', () => {
  it('returns null when the API does not exist', async () => {
    await expect(loadLayoutMap(undefined)).resolves.toBeNull();
    await expect(loadLayoutMap({} as Navigator)).resolves.toBeNull();
  });

  it('returns the map when the API answers', async () => {
    const nav = { keyboard: { getLayoutMap: async () => azerty } } as unknown as Navigator;

    await expect(loadLayoutMap(nav)).resolves.toBe(azerty);
  });

  it('returns null when the API fails, without throwing', async () => {
    const nav = {
      keyboard: {
        getLayoutMap: async () => {
          throw new Error('denied');
        },
      },
    } as unknown as Navigator;

    await expect(loadLayoutMap(nav)).resolves.toBeNull();
  });
});
