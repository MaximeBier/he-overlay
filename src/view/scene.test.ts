import { describe, it, expect } from 'vitest';
import { buildScene, contrastingLabel } from './scene';
import { OVERLAY_TOKENS } from '../styles/tokens';
import { DEFAULT_STYLE, type ResolvedConfig, type ResolvedKey } from '../config/schema';

const style = {
  restColor: DEFAULT_STYLE.restColor,
  borderColor: DEFAULT_STYLE.borderColor,
  activeColor: DEFAULT_STYLE.activeColor,
  fillColor: DEFAULT_STYLE.fillColor,
  fillDirection: DEFAULT_STYLE.fillDirection,
  opacity: DEFAULT_STYLE.opacity,
  radius: DEFAULT_STYLE.radius,
  fontFamily: DEFAULT_STYLE.fontFamily,
  fontWeight: DEFAULT_STYLE.fontWeight,
};

const key = (over: Partial<ResolvedKey> = {}): ResolvedKey => ({
  id: 174,
  usage: 0x50,
  mode: 'key',
  label: 'Q',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  style: { ...style },
  ...over,
});

const config = (...keys: ResolvedKey[]): ResolvedConfig => ({
  version: 1,
  unit: 100,
  gap: 10,
  keys,
});

describe('buildScene', () => {
  it('converts key units into pixels, gap included', () => {
    const scene = buildScene(config(key({ x: 1, y: 2, w: 1.25, h: 1 })), []);

    expect(scene.keys[0]).toMatchObject({ x: 105, y: 205, w: 115, h: 90 });
  });

  it('sizes the scene to the extent of the keys', () => {
    const scene = buildScene(config(key({ x: 0, y: 0 }), key({ id: 9, x: 2, y: 1, w: 2 })), []);

    expect(scene.width).toBe(400);
    expect(scene.height).toBe(200);
  });

  it('fills bottom-up by default, proportionally to the travel', () => {
    const scene = buildScene(config(key()), [[174, 512, 0]]);

    // 512 / 1023 is about 0.5004 of a key 90 px tall.
    expect(scene.keys[0]?.fill.h).toBeCloseTo(45.04, 1);
    expect(scene.keys[0]?.fill.y).toBeCloseTo(5 + 90 - 45.04, 1);
    expect(scene.keys[0]?.fill.x).toBe(5);
    expect(scene.keys[0]?.fill.w).toBe(90);
  });

  it('fills top-down', () => {
    const scene = buildScene(config(key({ style: { ...style, fillDirection: 'down' } })), [
      [174, 512, 0],
    ]);

    expect(scene.keys[0]?.fill.y).toBe(5);
    expect(scene.keys[0]?.fill.h).toBeCloseTo(45.04, 1);
  });

  // Intended use case: a right-arrow key in axis mode reads left to right.
  it('fills left to right', () => {
    const scene = buildScene(config(key({ style: { ...style, fillDirection: 'right' } })), [
      [174, 512, 0],
    ]);

    expect(scene.keys[0]?.fill.x).toBe(5);
    expect(scene.keys[0]?.fill.y).toBe(5);
    expect(scene.keys[0]?.fill.w).toBeCloseTo(45.04, 1);
    expect(scene.keys[0]?.fill.h).toBe(90);
  });

  it('fills right to left', () => {
    const scene = buildScene(config(key({ style: { ...style, fillDirection: 'left' } })), [
      [174, 512, 0],
    ]);

    expect(scene.keys[0]?.fill.x).toBeCloseTo(5 + 90 - 45.04, 1);
    expect(scene.keys[0]?.fill.w).toBeCloseTo(45.04, 1);
  });

  it('fills completely at 1023: the bar is full on air', () => {
    const scene = buildScene(config(key()), [[174, 1023, 1]]);

    expect(scene.keys[0]?.fill.h).toBe(90);
  });

  it('gives zero travel to a key missing from the frame', () => {
    const scene = buildScene(config(key()), []);

    expect(scene.keys[0]?.fill.h).toBe(0);
    expect(scene.keys[0]?.baseFill).toBe(style.restColor);
  });

  it('switches the background of a key-mode key when it is active', () => {
    const scene = buildScene(config(key()), [[174, 300, 1]]);

    expect(scene.keys[0]?.baseFill).toBe(style.activeColor);
  });

  it('fills a key-mode key with the fill color', () => {
    const scene = buildScene(config(key()), [[174, 300, 1]]);

    expect(scene.keys[0]?.fill.color).toBe(style.fillColor);
  });

  // Test 7 of spec 12.1 - axis mode receives the bit, it does not represent it.
  it('never applies the active color to the background of an axis-mode key', () => {
    const scene = buildScene(config(key({ mode: 'axis' })), [[174, 1023, 1]]);

    expect(scene.keys[0]?.baseFill).toBe(style.restColor);
    expect(scene.keys[0]?.fill.h).toBe(90);
  });

  it('fills an axis-mode key with the active color', () => {
    const scene = buildScene(config(key({ mode: 'axis' })), [[174, 500, 0]]);

    expect(scene.keys[0]?.fill.color).toBe(style.activeColor);
  });

  it('exposes no raw value to display', () => {
    expect(buildScene(config(key()), [[174, 512, 0]]).keys[0]).not.toHaveProperty('value');
  });

  it('gives every key a border: without it the key vanishes on a dark background', () => {
    expect(buildScene(config(key()), []).keys[0]?.borderColor).toBe(style.borderColor);
  });

  it('sizes the label to the key height, not in fixed pixels', () => {
    const small = buildScene(config(key()), []);
    const tall = buildScene(config(key({ h: 2 })), []);

    expect(small.keys[0]?.fontSize).toBeCloseTo(90 * 0.4, 5);
    expect(tall.keys[0]?.fontSize).toBeCloseTo(190 * 0.4, 5);
  });

  it('flags axis mode without decorating it: the renderer decides', () => {
    expect(buildScene(config(key({ mode: 'axis' })), []).keys[0]?.axis).toBe(true);
    expect(buildScene(config(key()), []).keys[0]?.axis).toBe(false);
  });

  it('renders an empty scene when no key is configured', () => {
    expect(buildScene(config(), [])).toEqual({ width: 0, height: 0, keys: [] });
  });
});

describe('buildScene - geometry that must never reach the SVG', () => {
  it('clamps a travel beyond the maximum instead of overflowing the key', () => {
    // The frame arrives over obs-websocket, where any authenticated client can
    // speak. An unclamped ratio draws a fill several times the key height,
    // straight over its neighbours.
    const scene = buildScene(config(key()), [[174, 9000, 1]]);

    expect(scene.keys[0]?.fill.h).toBe(90);
    expect(scene.keys[0]?.fill.y).toBe(5);
  });

  it('clamps a negative travel to an empty fill', () => {
    const scene = buildScene(config(key()), [[174, -400, 0]]);

    expect(scene.keys[0]?.fill.h).toBe(0);
  });

  it('never gives a key a negative size, however wide the gap', () => {
    // A rect with a negative width is an SVG error, and the gap is the user's
    // to set.
    const scene = buildScene({ version: 1, unit: 20, gap: 40, keys: [key({ w: 0.25 })] }, []);

    expect(scene.keys[0]?.w).toBe(0);
    expect(scene.keys[0]?.h).toBe(0);
  });
});

describe('label contrast', () => {
  it('inverts the label on a light background, keeps it light on a dark one', () => {
    expect(contrastingLabel('#7C9EFF')).toBe(OVERLAY_TOKENS.keyLabelInverted);
    expect(contrastingLabel('#151823')).toBe(OVERLAY_TOKENS.keyLabel);
    expect(contrastingLabel('#3D4A78')).toBe(OVERLAY_TOKENS.keyLabel);
  });

  it('accepts the short three-digit notation', () => {
    expect(contrastingLabel('#fff')).toBe(OVERLAY_TOKENS.keyLabelInverted);
  });

  it('falls back to the light label for an unreadable color', () => {
    expect(contrastingLabel('rebeccapurple')).toBe(OVERLAY_TOKENS.keyLabel);
  });

  it('does not invert in key mode: the travel fill is dark', () => {
    const high = buildScene(config(key()), [[174, 900, 0]]);

    expect(high.keys[0]?.labelFill).toBe(OVERLAY_TOKENS.keyLabel);
  });

  // In axis mode the fill is the active color, which is distinctly light:
  // that is where the inversion actually happens (mockup 5a, the Z key).
  it('inverts in axis mode when the light fill moves under the text', () => {
    const low = buildScene(config(key({ mode: 'axis' })), [[174, 400, 0]]);
    const high = buildScene(config(key({ mode: 'axis' })), [[174, 900, 0]]);

    expect(low.keys[0]?.labelFill).toBe(OVERLAY_TOKENS.keyLabel);
    expect(high.keys[0]?.labelFill).toBe(OVERLAY_TOKENS.keyLabelInverted);
  });

  it('inverts too when the key is actuated: the background turns light', () => {
    const active = buildScene(config(key()), [[174, 300, 1]]);

    expect(active.keys[0]?.labelFill).toBe(OVERLAY_TOKENS.keyLabelInverted);
  });
});

describe('buildScene - defence in depth on values the type system cannot police', () => {
  it('treats a travel that is not a number as no travel at all', () => {
    // parseMessage now refuses these, but the scene is also fed straight from
    // the capture page, and a NaN reaches the SVG as height="NaN".
    const scene = buildScene(config(key()), [[174, Number.NaN, 0]]);

    expect(scene.keys[0]?.fill.h).toBe(0);
  });

  it('falls back to filling upward on a direction outside the four', () => {
    // The switch is exhaustive over the type, which protects the code and not
    // the data: an unknown direction returned undefined, the spread dropped
    // x/y/w/h, and the key silently stopped showing its travel forever.
    const scene = buildScene(
      config(key({ style: { ...style, fillDirection: 'diagonal' as never } })),
      [[174, 1023, 0]],
    );

    expect(scene.keys[0]?.fill).toMatchObject({ x: 5, y: 5, w: 90, h: 90 });
  });

  it('draws a duplicated id once, keeping the first', () => {
    // migrate dedupes the imported path; nothing dedupes the wire. parseMessage
    // validates a config message as "an object" and no further, so two equal
    // ids kill the keyed each block in KeyboardView.
    const scene = buildScene(config(key({ label: 'Q' }), key({ label: 'W', x: 3 })), []);

    expect(scene.keys).toHaveLength(1);
    expect(scene.keys[0]?.label).toBe('Q');
  });
});

describe('the contrast crossover is derived, not borrowed', () => {
  // 0.179 is the crossover for pure black against pure white. Our two label
  // tokens are neither, so the constant was imported from a different problem
  // and left a band where the code picked the worse of the two.
  const luminanceOf = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  it('always picks the label that contrasts best with the background', () => {
    const light = luminanceOf(OVERLAY_TOKENS.keyLabel);
    const dark = luminanceOf(OVERLAY_TOKENS.keyLabelInverted);

    for (let step = 0; step <= 255; step++) {
      const grey = `#${step.toString(16).padStart(2, '0').repeat(3)}`;
      const background = luminanceOf(grey);
      const chosen = contrastingLabel(grey);
      const chosenLuminance = chosen === OVERLAY_TOKENS.keyLabel ? light : dark;
      const other = chosen === OVERLAY_TOKENS.keyLabel ? dark : light;

      expect(contrast(chosenLuminance, background)).toBeGreaterThanOrEqual(
        contrast(other, background) - 1e-9,
      );
    }
  });

  it('follows the tokens rather than a hard-coded number', () => {
    // The band the borrowed constant got wrong: L between 0.1602 and 0.179.
    // #707070 sits inside it at L = 0.1620, and used to get the light label.
    expect(contrastingLabel('#707070')).toBe(OVERLAY_TOKENS.keyLabelInverted);
  });
});
