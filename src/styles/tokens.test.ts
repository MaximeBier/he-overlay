import { describe, it, expect } from 'vitest';
import { OVERLAY_TOKENS } from './tokens';
import { UI_TOKENS, applyTokens, cssVariables } from './ui-tokens';
import { DEFAULT_STYLE } from '../config/schema';

describe('tokens', () => {
  it('separates by name what goes to the broadcast from what stays in the interface', () => {
    const overlay = Object.keys(OVERLAY_TOKENS);
    const ui = Object.keys(UI_TOKENS);

    // Both palettes share values — #151823 for surfaces, #7C9EFF for the
    // accent — and that is deliberate: the product must look like one object.
    // What we forbid is one name serving both sides: retouching the interface
    // must never change what the viewers see.
    expect(overlay.some((name) => ui.includes(name))).toBe(false);
  });

  it('feeds the configuration default values', () => {
    expect(DEFAULT_STYLE.restColor).toBe(OVERLAY_TOKENS.keyRest);
    expect(DEFAULT_STYLE.activeColor).toBe(OVERLAY_TOKENS.keyActive);
    expect(DEFAULT_STYLE.fillColor).toBe(OVERLAY_TOKENS.keyFill);
    expect(DEFAULT_STYLE.borderColor).toBe(OVERLAY_TOKENS.keyBorder);
    expect(DEFAULT_STYLE.radius).toBe(OVERLAY_TOKENS.keyRadius);
    expect(DEFAULT_STYLE.opacity).toBe(OVERLAY_TOKENS.keyOpacity);
    expect(DEFAULT_STYLE.fontFamily).toBe(OVERLAY_TOKENS.keyFontFamily);
    expect(DEFAULT_STYLE.fontWeight).toBe(OVERLAY_TOKENS.keyFontWeight);
  });

  it('clearly distinguishes rest from actuation', () => {
    // Both states must read at a glance on a compressed video feed: a subtle
    // shade does not survive a stream's bitrate.
    expect(OVERLAY_TOKENS.keyRest).not.toBe(OVERLAY_TOKENS.keyActive);
    expect(OVERLAY_TOKENS.keyFill).not.toBe(OVERLAY_TOKENS.keyActive);
  });

  it('gives the label a usable height at stream size', () => {
    // 40% of a 26 px key at 1080p is ~10 px: below that, the label does not
    // survive video compression (mockup 4b).
    expect(OVERLAY_TOKENS.keyLabelRatio).toBeGreaterThanOrEqual(0.35);
    expect(OVERLAY_TOKENS.keyLabelRatio).toBeLessThanOrEqual(0.5);
  });

  it('exposes the interface tokens as prefixed CSS variables', () => {
    const variables = cssVariables();

    expect(Object.keys(variables).every((name) => name.startsWith('--he-'))).toBe(true);
    expect(variables['--he-text']).toBe(UI_TOKENS.text);
    expect(variables['--he-border-popover']).toBe(UI_TOKENS.borderPopover);
  });

  it('derives no CSS variable from the broadcast tokens', () => {
    const names = Object.keys(cssVariables());

    expect(names.some((name) => name.startsWith('--he-key'))).toBe(false);
  });

  it('sets the variables on the document root', () => {
    const set: [string, string][] = [];
    applyTokens({ style: { setProperty: (name, value) => void set.push([name, value]) } });

    expect(set).toContainEqual(['--he-text', UI_TOKENS.text]);
    expect(set).toHaveLength(Object.keys(cssVariables()).length);
  });

  it('gives every interface token a variable, and each a distinct name', () => {
    // camelCase collapses to kebab-case, so two tokens could quietly map onto
    // the same variable and one would win at random.
    const names = Object.keys(cssVariables());

    expect(names).toHaveLength(Object.keys(UI_TOKENS).length);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the two palettes live in separate modules', () => {
  // Not merely separate objects. The overlay imports the configuration schema,
  // which imports the broadcast tokens: sharing one module drags the whole
  // interface palette into the chunk OBS keeps loaded (spec §5.1). Bundlers
  // split by module, so the separation has to be physical to hold.
  it('exports nothing but the broadcast tokens from tokens.ts', async () => {
    const broadcast = await import('./tokens');

    expect(Object.keys(broadcast)).toEqual(['OVERLAY_TOKENS']);
  });
});
