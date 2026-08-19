import { describe, it, expect } from 'vitest';
import { migrate } from './migrate';
import { CONFIG_VERSION, defaultConfig, DEFAULT_STYLE } from './schema';

const aKey = { id: 174, usage: 0x50, mode: 'key', label: 'Q', x: 0, y: 0, w: 1, h: 1 };

describe('migrate', () => {
  it('accepts a configuration that is already up to date', () => {
    const config = defaultConfig();

    expect(migrate(config)).toEqual({ ok: true, config, dropped: 0 });
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

describe('migrate - the per-key style is not a safe place either', () => {
  // Found by the milestone 3 review. The chain is complete: an unvalidated
  // per-key style reaches effectiveStyle, contrastingLabel calls trim() on a
  // number, and the overlay stops rendering inside a $derived.
  it('drops a per-key override that is not the right type', () => {
    const result = migrate({
      version: 1,
      layout: 'iso',
      style: {},
      keys: [{ ...aKey, style: { restColor: 42, opacity: 'half' } }],
    });

    expect(result.ok).toBe(true);
    // Absent, not empty: nothing survived, so the key carries no override at
    // all — which is what an export should show.
    if (result.ok) expect(result.config.keys[0]?.style).toBeUndefined();
  });

  it('keeps a per-key override that is well formed', () => {
    const result = migrate({
      version: 1,
      layout: 'iso',
      style: {},
      keys: [{ ...aKey, style: { activeColor: '#ff0000', opacity: 0.5 } }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.keys[0]?.style).toEqual({ activeColor: '#ff0000', opacity: 0.5 });
    }
  });

  it('lets no key carry the two global-only sizes', () => {
    const result = migrate({
      version: 1,
      layout: 'iso',
      style: {},
      keys: [{ ...aKey, style: { unit: 72, gap: 2 } }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.keys[0]?.style).toBeUndefined();
  });

  it('accepts only hex colors, which are the ones the renderer can read', () => {
    // `luminance` understands #rgb and #rrggbb, nothing else, and falls back to
    // the light label — white text on a white key.
    const result = migrate({
      version: 1,
      layout: 'iso',
      keys: [],
      style: { restColor: 'white', activeColor: 'rgb(255,0,0)', fillColor: '#f0a' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.style.restColor).toBe(DEFAULT_STYLE.restColor);
      expect(result.config.style.activeColor).toBe(DEFAULT_STYLE.activeColor);
      expect(result.config.style.fillColor).toBe('#f0a');
    }
  });

  it('refuses a unit that would collapse or invert the scene', () => {
    // unit 0 gives an empty SVG, a negative unit an invalid width attribute
    // that browsers discard outright: a blank overlay, on air, silently.
    for (const unit of [0, -56]) {
      const result = migrate({ version: 1, layout: 'iso', keys: [], style: { unit } });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.config.style.unit).toBe(DEFAULT_STYLE.unit);
    }
  });

  it('refuses a negative gap, which inflates every key past its cell', () => {
    const result = migrate({ version: 1, layout: 'iso', keys: [], style: { gap: -10 } });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.style.gap).toBe(DEFAULT_STYLE.gap);
  });

  it('accepts a gap of zero, which is a legitimate look', () => {
    const result = migrate({ version: 1, layout: 'iso', keys: [], style: { gap: 0 } });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.style.gap).toBe(0);
  });

  it('drops a key placed outside the frame the viewBox draws', () => {
    const result = migrate({
      version: 1,
      layout: 'iso',
      style: {},
      keys: [{ ...aKey, x: -1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.keys).toEqual([]);
  });
});

describe('migrate - what it silently threw away', () => {
  // The comment justifies dropping a malformed key over breaking the render,
  // but nothing told the user. They import a profile and get an amputated
  // keyboard. Spec 11: say what to do, never fail in silence.
  it('counts the keys it had to drop', () => {
    const result = migrate({
      version: 1,
      layout: 'iso',
      style: {},
      keys: [aKey, { id: 9 }, { ...aKey, label: 'dup' }, { ...aKey, id: 3, w: -1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.keys).toHaveLength(1);
      expect(result.dropped).toBe(3);
    }
  });

  it('reports nothing dropped when the file is clean', () => {
    const result = migrate({ version: 1, layout: 'iso', style: {}, keys: [aKey] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dropped).toBe(0);
  });

  it('validates the key list after migrating, not before', () => {
    // Checked ahead of the chain, no future migration could ever create or
    // rename this field — the step would run and its result be refused.
    const result = migrate({ keys: [aKey], style: {} });

    expect(result.ok).toBe(true);
  });
});

describe('migrate - the bounds that stop just short', () => {
  it('refuses a negative corner radius', () => {
    for (const scope of ['global', 'key'] as const) {
      const result = migrate({
        version: 1,
        layout: 'iso',
        style: scope === 'global' ? { radius: -5 } : {},
        keys: scope === 'key' ? [{ ...aKey, style: { radius: -5 } }] : [],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      if (scope === 'global') expect(result.config.style.radius).toBe(DEFAULT_STYLE.radius);
      else expect(result.config.keys[0]?.style).toBeUndefined();
    }
  });

  it('keeps a radius of zero, which is a square corner on purpose', () => {
    const result = migrate({ version: 1, layout: 'iso', keys: [], style: { radius: 0 } });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.style.radius).toBe(0);
  });
});
