import { describe, it, expect } from 'vitest';
import { resolve, effectiveStyle, hasOverrides, overriddenKeys } from './resolve';
import {
  defaultConfig,
  DEFAULT_STYLE,
  STYLE_KEYS,
  type KeyConfig,
  type OverlayConfig,
} from './schema';

function withKeys(...keys: KeyConfig[]): OverlayConfig {
  return { ...defaultConfig(), keys };
}

const key = (over: Partial<KeyConfig> = {}): KeyConfig => ({
  id: 174,
  usage: 0x50,
  mode: 'key',
  label: 'Q',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  ...over,
});

describe('resolve', () => {
  it('flattens the global style onto every key', () => {
    const { keys } = resolve(withKeys(key()));

    expect(keys[0]?.style).toEqual({
      restColor: DEFAULT_STYLE.restColor,
      borderColor: DEFAULT_STYLE.borderColor,
      activeColor: DEFAULT_STYLE.activeColor,
      fillColor: DEFAULT_STYLE.fillColor,
      fillDirection: DEFAULT_STYLE.fillDirection,
      opacity: DEFAULT_STYLE.opacity,
      radius: DEFAULT_STYLE.radius,
      fontFamily: DEFAULT_STYLE.fontFamily,
      fontWeight: DEFAULT_STYLE.fontWeight,
    });
  });

  it('inherits the fill direction like any other style property', () => {
    const config = withKeys(key(), key({ id: 9, style: { fillDirection: 'left' } }));
    config.style.fillDirection = 'down';

    const { keys } = resolve(config);

    expect(keys[0]?.style.fillDirection).toBe('down');
    expect(keys[1]?.style.fillDirection).toBe('left');
  });

  it('lets the key override win, property by property', () => {
    const { keys } = resolve(withKeys(key({ style: { activeColor: '#ff0000' } })));

    expect(keys[0]?.style.activeColor).toBe('#ff0000');
    expect(keys[0]?.style.restColor).toBe(DEFAULT_STYLE.restColor);
  });

  it('lifts up the unit and the gap, which no key can override', () => {
    const config = withKeys(key());
    config.style.unit = 72;
    config.style.gap = 2;

    const resolved = resolve(config);

    expect(resolved.unit).toBe(72);
    expect(resolved.gap).toBe(2);
    expect('unit' in resolved.keys[0]!.style).toBe(false);
  });

  it('preserves id, usage, mode, label and geometry', () => {
    const { keys } = resolve(withKeys(key({ mode: 'axis', label: 'Left', x: 2, y: 1, w: 1.25 })));

    expect(keys[0]).toMatchObject({
      id: 174,
      usage: 0x50,
      mode: 'axis',
      label: 'Left',
      x: 2,
      y: 1,
      w: 1.25,
      h: 1,
    });
  });

  it('does not mutate the editing configuration', () => {
    const config = withKeys(key({ style: { opacity: 0.2 } }));
    resolve(config);

    expect(config.keys[0]?.style).toEqual({ opacity: 0.2 });
  });

  it('accepts a zero-valued override without mistaking it for an absent one', () => {
    const config = withKeys(key({ style: { opacity: 0 } }));
    config.style.opacity = 1;

    expect(resolve(config).keys[0]?.style.opacity).toBe(0);
  });

  // The resolved style is built by iterating STYLE_KEYS and then asserted to be
  // a KeyStyle. That assertion is only honest while the two agree, and this is
  // what says so at runtime.
  it('produces exactly the inheritable properties, no more and no less', () => {
    const { keys } = resolve(withKeys(key()));

    expect(Object.keys(keys[0]!.style).sort()).toEqual([...STYLE_KEYS].sort());
  });
});

describe('override detection', () => {
  it('flags a customized key', () => {
    expect(hasOverrides(key())).toBe(false);
    expect(hasOverrides(key({ style: {} }))).toBe(false);
    expect(hasOverrides(key({ style: { fillColor: '#000' } }))).toBe(true);
  });

  it('lists the overridden properties, so the editor can mark them', () => {
    expect(overriddenKeys(key({ style: { fillColor: '#000', opacity: 0.5 } })).sort()).toEqual([
      'fillColor',
      'opacity',
    ]);
  });

  it('ignores a property explicitly set back to undefined', () => {
    expect(overriddenKeys(key({ style: { fillColor: undefined } }))).toEqual([]);
  });

  it('counts a zero-valued override, which is a choice like any other', () => {
    expect(overriddenKeys(key({ style: { opacity: 0 } }))).toEqual(['opacity']);
  });
});

describe('effectiveStyle', () => {
  it('also serves to show the inherited value greyed out in the editor', () => {
    expect(effectiveStyle(DEFAULT_STYLE, key()).restColor).toBe(DEFAULT_STYLE.restColor);
  });
});

describe('overrides that came from imported JSON', () => {
  // `null` cannot be typed into a Partial<KeyStyle>, but it survives a JSON
  // round trip. Resolution and the editor's markers must read it the same way,
  // or a key shows as customized while rendering the inherited value.
  const withNull = () => key({ style: { opacity: null } as never });

  it('treats a null override as absent, on both sides', () => {
    expect(overriddenKeys(withNull())).toEqual([]);
    expect(effectiveStyle(DEFAULT_STYLE, withNull()).opacity).toBe(DEFAULT_STYLE.opacity);
  });
});
