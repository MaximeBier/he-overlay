import { describe, it, expect } from 'vitest';
import { defaultConfig, DEFAULT_STYLE, STYLE_KEYS, CONFIG_VERSION } from './schema';

describe('default values', () => {
  it('starts from a versioned, empty configuration', () => {
    const config = defaultConfig();

    expect(config.version).toBe(CONFIG_VERSION);
    expect(config.keys).toEqual([]);
    expect(config.layout).toBe('iso');
  });

  it('returns an independent copy on every call', () => {
    const first = defaultConfig();
    first.style.opacity = 0.1;

    expect(defaultConfig().style.opacity).toBe(DEFAULT_STYLE.opacity);
  });

  it('gives each configuration its own key list', () => {
    const first = defaultConfig();
    first.keys.push({ id: 1, usage: 4, mode: 'key', label: 'A', x: 0, y: 0, w: 1, h: 1 });

    expect(defaultConfig().keys).toEqual([]);
  });

  it('exposes no behavior setting: everything comes from the keyboard', () => {
    const forbidden = ['actuation', 'rapidTrigger', 'deadzone', 'travelMm', 'pairs'];
    const serialized = JSON.stringify(defaultConfig());

    for (const field of forbidden) expect(serialized).not.toContain(field);
  });

  it('exposes no setting for displaying the raw value', () => {
    expect(JSON.stringify(defaultConfig())).not.toContain('showValue');
  });

  it('lists exactly the inheritable properties', () => {
    expect([...STYLE_KEYS].sort()).toEqual(
      [
        'activeColor',
        'borderColor',
        'fillColor',
        'fillDirection',
        'fontFamily',
        'fontWeight',
        'opacity',
        'radius',
        'restColor',
      ].sort(),
    );
  });

  // STYLE_KEYS drives inheritance resolution in task 13, so a property present
  // in the style but missing from the list would silently stop being
  // inheritable — an override the editor accepts and the renderer ignores.
  it('leaves nothing out of the inheritable list but the two global-only sizes', () => {
    const globalOnly = ['unit', 'gap'];
    const inheritable = Object.keys(DEFAULT_STYLE).filter((key) => !globalOnly.includes(key));

    expect([...STYLE_KEYS].sort()).toEqual(inheritable.sort());
  });

  it('fills upward by default', () => {
    expect(DEFAULT_STYLE.fillDirection).toBe('up');
  });

  it('carries no font size: it is computed from the key', () => {
    expect(JSON.stringify(DEFAULT_STYLE)).not.toMatch(/\d+px/);
    expect(JSON.stringify(DEFAULT_STYLE)).not.toContain('fontSize');
  });

  it('trusts the detected layout by default', () => {
    expect(defaultConfig().layoutOverride).toBe('auto');
  });

  it('gives a global style covering every inheritable property', () => {
    for (const key of STYLE_KEYS) expect(DEFAULT_STYLE[key]).toBeDefined();
  });
});
