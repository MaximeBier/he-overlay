import { describe, it, expect } from 'vitest';
import { isResolvedConfig } from './validate';
import { resolve } from './resolve';
import { defaultConfig, DEFAULT_STYLE, type KeyConfig } from './schema';

const aKey: KeyConfig = {
  id: 174,
  usage: 0x50,
  mode: 'key',
  label: 'Q',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

function resolved() {
  const config = defaultConfig();
  config.keys.push(aKey);
  return resolve(config) as unknown as Record<string, unknown>;
}

describe('isResolvedConfig', () => {
  it('accepts what resolve produces', () => {
    expect(isResolvedConfig(resolved())).toBe(true);
    expect(isResolvedConfig(resolve(defaultConfig()))).toBe(true);
  });

  it('refuses anything that is not an object with a key list', () => {
    expect(isResolvedConfig(null)).toBe(false);
    expect(isResolvedConfig('nope')).toBe(false);
    expect(isResolvedConfig({ ...resolved(), keys: 'nope' })).toBe(false);
  });

  it('refuses the sizes that collapse or invert the scene', () => {
    expect(isResolvedConfig({ ...resolved(), unit: 0 })).toBe(false);
    expect(isResolvedConfig({ ...resolved(), unit: -56 })).toBe(false);
    expect(isResolvedConfig({ ...resolved(), gap: -1 })).toBe(false);
    expect(isResolvedConfig({ ...resolved(), unit: Number.NaN })).toBe(false);
  });

  it('refuses a key whose geometry cannot be drawn', () => {
    const bad = (over: Record<string, unknown>) => {
      const config = resolved();
      const keys = config.keys as Record<string, unknown>[];
      return isResolvedConfig({ ...config, keys: [{ ...keys[0]!, ...over }] });
    };

    expect(bad({ x: -1 })).toBe(false);
    expect(bad({ w: 0 })).toBe(false);
    expect(bad({ h: Number.POSITIVE_INFINITY })).toBe(false);
    expect(bad({ id: 'q' })).toBe(false);
    expect(bad({ mode: 'sideways' })).toBe(false);
    expect(bad({ label: 42 })).toBe(false);
  });

  it('refuses a key whose style is incomplete', () => {
    // The scene reads every property without a fallback: one missing radius
    // renders `rx="undefined"` and the key stops being drawn.
    const config = resolved();
    const keys = config.keys as Record<string, unknown>[];
    const { radius: _dropped, ...partial } = keys[0]!.style as Record<string, unknown>;

    expect(isResolvedConfig({ ...config, keys: [{ ...keys[0]!, style: partial }] })).toBe(false);
  });

  it('refuses a style property of the wrong type', () => {
    const config = resolved();
    const keys = config.keys as Record<string, unknown>[];
    const style = { ...(keys[0]!.style as Record<string, unknown>), restColor: 42 };

    expect(isResolvedConfig({ ...config, keys: [{ ...keys[0]!, style }] })).toBe(false);
  });

  it('refuses a fill direction outside the four', () => {
    const config = resolved();
    const keys = config.keys as Record<string, unknown>[];
    const style = { ...(keys[0]!.style as Record<string, unknown>), fillDirection: 'diagonal' };

    expect(isResolvedConfig({ ...config, keys: [{ ...keys[0]!, style }] })).toBe(false);
  });

  it('accepts every default style property as resolve emits it', () => {
    const config = resolved();
    const keys = config.keys as Record<string, unknown>[];

    expect(keys[0]!.style).toMatchObject({ radius: DEFAULT_STYLE.radius });
    expect(isResolvedConfig(config)).toBe(true);
  });
});
