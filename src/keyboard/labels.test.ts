import { describe, it, expect } from 'vitest';
import { FALLBACK_LAYOUTS, labelFor, loadLayoutMap, resolveLayout } from './labels';
import { ISO_GEOMETRY } from './geometry';

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

  it('falls back to what the keycap prints when the layout stays silent', () => {
    expect(labelFor(0x2c, azerty)).toBe('Space');
    expect(labelFor(0xe1, azerty)).toBe('Shift');
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

describe('keycap labels for the keys that print no character', () => {
  // getLayoutMap only speaks for the writing keys. Everything else fell back
  // to the position name — "ArrowLeft", "ControlRight" — which is a debugging
  // string, not something to put on air.
  it('uses the arrows a keycap actually prints', () => {
    expect(labelFor(0x50, null)).toBe('←');
    expect(labelFor(0x51, null)).toBe('↓');
    expect(labelFor(0x4f, null)).toBe('→');
    expect(labelFor(0x52, null)).toBe('↑');
  });

  it('names the modifiers the way both sides of the board are printed', () => {
    expect(labelFor(0xe0, null)).toBe('Ctrl');
    expect(labelFor(0xe4, null)).toBe('Ctrl');
    expect(labelFor(0xe1, null)).toBe('Shift');
    expect(labelFor(0xe5, null)).toBe('Shift');
    expect(labelFor(0xe2, null)).toBe('Alt');
    expect(labelFor(0xe6, null)).toBe('Alt Gr');
  });

  it('shortens the long ones so they fit on a key', () => {
    expect(labelFor(0x29, null)).toBe('Esc');
    expect(labelFor(0x2a, null)).toBe('Bksp');
    expect(labelFor(0x39, null)).toBe('Caps');
    expect(labelFor(0x4b, null)).toBe('Pg Up');
    expect(labelFor(0x4e, null)).toBe('Pg Dn');
    expect(labelFor(0x65, null)).toBe('Menu');
  });

  it('gives the numpad the digits printed on it', () => {
    expect(labelFor(0x62, null)).toBe('0');
    expect(labelFor(0x5f, null)).toBe('7');
    expect(labelFor(0x57, null)).toBe('+');
    expect(labelFor(0x58, null)).toBe('Enter');
  });

  it('leaves no key of the board showing a position name', () => {
    // Anything camelCase reaching the screen is a leaked debugging string. The
    // writing keys are exempt: getLayoutMap always speaks for those, and the
    // position name only shows when the API is missing entirely.
    const writingKey =
      /^(Key[A-Z]|Digit[0-9]|Intl|Backquote|Minus|Equal|Bracket|Semicolon|Quote|Backslash|Comma|Period|Slash)/;
    const leaked = ISO_GEOMETRY.filter(
      (key) => !writingKey.test(key.code) && /[a-z][A-Z]/.test(labelFor(key.usage, null)),
    );

    expect(leaked.map((k) => k.code)).toEqual([]);
  });

  it('lets the detected layout win over the keycap table', () => {
    // The table is a fallback, never an override: a layout that names a key
    // knows better than we do.
    expect(labelFor(0x2c, new Map([['Space', 'Espace']]))).toBe('Espace');
  });

  it('treats a blank answer from the layout as no answer', () => {
    // getLayoutMap returns " " for Space. Taken at face value it produced a
    // label made of one space — invisible on air, and impossible to diagnose.
    expect(labelFor(0x2c, new Map([['Space', ' ']]))).toBe('Space');
  });
});

describe('resolveLayout - the forced choice corrects, it does not replace', () => {
  // The three tables hold seven positions. Read as the whole answer, forcing a
  // layout renamed every other key to its position name: D became KeyD, & became
  // Digit1. The table says what the layouts *disagree* on; detection still
  // answers everything else.
  const detected = new Map([
    ['KeyQ', 'a'],
    ['KeyD', 'd'],
    ['Digit1', '&'],
  ]);

  it('overrides the positions the table covers', () => {
    expect(labelFor(0x14, resolveLayout('qwerty', detected))).toBe('Q');
  });

  it('keeps the detected answer for the positions it does not', () => {
    expect(labelFor(0x07, resolveLayout('qwerty', detected))).toBe('D');
  });

  it('leaves nothing to the position name when detection has an answer', () => {
    expect(labelFor(0x1e, resolveLayout('qwerty', detected))).toBe('&');
  });

  it('still works alone when detection is unavailable', () => {
    expect(labelFor(0x14, resolveLayout('azerty', null))).toBe('A');
    expect(labelFor(0x07, resolveLayout('azerty', null))).toBe('KeyD');
  });
});
