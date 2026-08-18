import { describe, it, expect } from 'vitest';
import { migrate } from './migrate';
import { CONFIG_VERSION, defaultConfig, DEFAULT_STYLE } from './schema';

const aKey = { id: 174, usage: 0x50, mode: 'key', label: 'Q', x: 0, y: 0, w: 1, h: 1 };

describe('migrate', () => {
  it('accepts a configuration that is already up to date', () => {
    const config = defaultConfig();

    expect(migrate(config)).toEqual({ ok: true, config });
  });

  it('migrates a configuration that has no version number', () => {
    const legacy = { keys: [aKey], style: { ...DEFAULT_STYLE } };

    const result = migrate(legacy);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.version).toBe(CONFIG_VERSION);
      expect(result.config.layout).toBe('iso');
      expect(result.config.keys).toHaveLength(1);
    }
  });

  it('fills missing style properties with the default values', () => {
    const result = migrate({ version: 1, layout: 'iso', keys: [], style: { unit: 40 } });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.style.unit).toBe(40);
      expect(result.config.style.activeColor).toBe(DEFAULT_STYLE.activeColor);
    }
  });

  it('keeps the layout override, which decides every label', () => {
    const result = migrate({ ...defaultConfig(), layoutOverride: 'qwertz' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.layoutOverride).toBe('qwertz');
  });

  it('falls back to auto on a layout override it does not know', () => {
    const result = migrate({ ...defaultConfig(), layoutOverride: 'dvorak' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.layoutOverride).toBe('auto');
  });

  it('rejects a configuration written by a future version', () => {
    expect(migrate({ version: CONFIG_VERSION + 1, layout: 'iso', keys: [], style: {} })).toEqual({
      ok: false,
      reason: 'too-new',
    });
  });

  it('rejects anything that is not a configuration', () => {
    expect(migrate(null)).toEqual({ ok: false, reason: 'unreadable' });
    expect(migrate('nope')).toEqual({ ok: false, reason: 'unreadable' });
    expect(migrate({ version: 1, keys: 'not an array' })).toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });

  it('drops an incomplete key rather than fabricating an invalid one', () => {
    const result = migrate({ version: 1, layout: 'iso', style: {}, keys: [aKey, { id: 9 }] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.keys).toHaveLength(1);
  });
});

describe('migrate — a hostile file is still just a file', () => {
  // Import is a trust boundary: the JSON may come from a forum post. None of
  // this is about malice, it is about a render that dies mid-stream.

  it('keeps the first of two keys sharing an id', () => {
    // The id keys the overlay's SVG nodes, exactly as it does for the decoder,
    // which dedupes for this reason. A duplicate there is fatal on air.
    const result = migrate({
      version: 1,
      layout: 'iso',
      style: {},
      keys: [aKey, { ...aKey, label: 'W', x: 3 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.keys).toHaveLength(1);
      expect(result.config.keys[0]?.label).toBe('Q');
    }
  });

  it('drops a key whose geometry is not a finite number', () => {
    // `JSON.parse('{"x":1e999}')` yields Infinity, and an SVG offset of
    // Infinity takes the whole scene with it.
    const result = migrate({
      version: 1,
      layout: 'iso',
      style: {},
      keys: [{ ...aKey, id: 1, x: Number.POSITIVE_INFINITY }, { ...aKey, id: 2, y: Number.NaN }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.keys).toEqual([]);
  });

  it('drops a key with no surface to draw', () => {
    const result = migrate({
      version: 1,
      layout: 'iso',
      style: {},
      keys: [{ ...aKey, id: 1, w: 0 }, { ...aKey, id: 2, h: -1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.keys).toEqual([]);
  });

  it('ignores a style property of the wrong type', () => {
    const result = migrate({
      version: 1,
      layout: 'iso',
      keys: [],
      style: { unit: 'wide', activeColor: 42, radius: Number.POSITIVE_INFINITY },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.style.unit).toBe(DEFAULT_STYLE.unit);
      expect(result.config.style.activeColor).toBe(DEFAULT_STYLE.activeColor);
      expect(result.config.style.radius).toBe(DEFAULT_STYLE.radius);
    }
  });

  it('ignores a fill direction that is not one of the four', () => {
    const result = migrate({
      version: 1,
      layout: 'iso',
      keys: [],
      style: { fillDirection: 'diagonal' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.style.fillDirection).toBe(DEFAULT_STYLE.fillDirection);
  });

  it('ignores a style property it has never heard of', () => {
    const result = migrate({ version: 1, layout: 'iso', keys: [], style: { glow: '#fff' } });

    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.config.style)).not.toContain('glow');
  });
});
