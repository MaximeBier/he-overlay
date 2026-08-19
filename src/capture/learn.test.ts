import { describe, it, expect } from 'vitest';
import { addLearnedKey, pickLearned, removeKey, removeKeys, LEARN_TRAVEL_THRESHOLD } from './learn';
import { defaultConfig } from '../config/schema';
import type { AnalogEntry } from '../keyboard/decode';

const azerty = new Map([
  ['KeyQ', 'a'],
  ['KeyW', 'z'],
  ['KeyA', 'q'],
  ['KeyS', 's'],
]);

const entry = (index: number, usage: number, travel: number): AnalogEntry => ({
  index,
  usage,
  travel,
  active: false,
});

describe('pickLearned', () => {
  it('keeps the key pressed the deepest', () => {
    const picked = pickLearned([entry(1, 0x14, 300), entry(2, 0x1a, 900)]);

    expect(picked?.index).toBe(2);
  });

  it('ignores a brush below the learning threshold', () => {
    expect(pickLearned([entry(1, 0x14, LEARN_TRAVEL_THRESHOLD - 1)])).toBeNull();
  });

  it('keeps nothing from a report at rest', () => {
    expect(pickLearned([entry(1, 0x14, 0)])).toBeNull();
    expect(pickLearned([])).toBeNull();
  });

  it('stays below the firmware actuation point, which is around 375', () => {
    // Learning must fire on a deliberate press without needing the keystroke
    // to register: pressing a key to configure it should not type it.
    expect(LEARN_TRAVEL_THRESHOLD).toBeGreaterThan(100);
    expect(LEARN_TRAVEL_THRESHOLD).toBeLessThan(375);
  });
});

describe('addLearnedKey', () => {
  it('adds the key with its label, its size and its default position', () => {
    const config = addLearnedKey(defaultConfig(), entry(174, 0x2c, 900), azerty);

    expect(config.keys).toHaveLength(1);
    expect(config.keys[0]).toMatchObject({
      id: 174,
      usage: 0x2c,
      mode: 'key',
      label: 'Space',
      w: 6.25,
      h: 1,
    });
  });

  it('applies the key mode by default', () => {
    const config = addLearnedKey(defaultConfig(), entry(1, 0x14, 900), azerty);

    expect(config.keys[0]?.mode).toBe('key');
    expect(config.keys[0]?.style).toBeUndefined();
  });

  it('lines up learned keys the way a keyboard does', () => {
    let config = defaultConfig();
    config = addLearnedKey(config, entry(1, 0x1a, 900), azerty); // Z
    config = addLearnedKey(config, entry(2, 0x04, 900), azerty); // Q
    config = addLearnedKey(config, entry(3, 0x16, 900), azerty); // S

    expect(config.keys.map((k) => [k.label, k.x, k.y])).toEqual([
      ['Z', 0.75, 0],
      ['Q', 0, 1],
      ['S', 1, 1],
    ]);
  });

  it('does not add the same key twice', () => {
    let config = addLearnedKey(defaultConfig(), entry(1, 0x14, 900), azerty);
    config = addLearnedKey(config, entry(1, 0x14, 900), azerty);

    expect(config.keys).toHaveLength(1);
  });

  it('keeps the custom positions of keys already placed', () => {
    let config = addLearnedKey(defaultConfig(), entry(1, 0x1a, 900), azerty);
    config.keys[0]!.x = 10;
    config.keys[0]!.y = 10;

    config = addLearnedKey(config, entry(2, 0x04, 900), azerty);

    expect(config.keys[0]).toMatchObject({ x: 10, y: 10 });
  });

  it('accepts a key missing from the geometry table', () => {
    const config = addLearnedKey(defaultConfig(), entry(200, 0xff, 900), azerty);

    expect(config.keys[0]).toMatchObject({ label: 'HID 0xff', w: 1, h: 1 });
  });

  it('leaves the configuration it was given untouched', () => {
    // It goes through updateConfig, which persists and broadcasts whatever it
    // returns. Mutating the argument would let a change reach the preview
    // without either.
    const before = defaultConfig();

    addLearnedKey(before, entry(1, 0x14, 900), azerty);

    expect(before.keys).toEqual([]);
  });
});

describe('removeKey', () => {
  it('removes the requested key and leaves the others untouched', () => {
    let config = addLearnedKey(defaultConfig(), entry(1, 0x14, 900), azerty);
    config = addLearnedKey(config, entry(2, 0x1a, 900), azerty);

    expect(removeKey(config, 1).keys.map((k) => k.id)).toEqual([2]);
  });

  it('removes every selected key at once', () => {
    let config = addLearnedKey(defaultConfig(), entry(1, 0x14, 900), azerty);
    config = addLearnedKey(config, entry(2, 0x1a, 900), azerty);
    config = addLearnedKey(config, entry(3, 0x16, 900), azerty);

    expect(removeKeys(config, [1, 3]).keys.map((k) => k.id)).toEqual([2]);
  });

  it('does nothing for a key that is not there', () => {
    const config = addLearnedKey(defaultConfig(), entry(1, 0x14, 900), azerty);

    expect(removeKey(config, 99).keys).toHaveLength(1);
  });
});
