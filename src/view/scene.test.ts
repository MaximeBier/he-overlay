import { describe, it, expect } from 'vitest';
import { buildScene, recommendedSize } from './scene';
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

  it('fills a released key-mode key with the fill color, over the rest color', () => {
    const scene = buildScene(config(key()), [[174, 300, 0]]);

    expect(scene.keys[0]?.baseFill).toBe(style.restColor);
    expect(scene.keys[0]?.fill.color).toBe(style.fillColor);
  });

  // The fill is drawn over the background, so a fully pressed key used to hide
  // the active colour completely: the one thing that matters — this key just
  // fired — was covered by the travel it fired from. On actuation the two
  // colours swap roles instead.
  it('swaps the two colours when a key-mode key actuates', () => {
    const scene = buildScene(config(key()), [[174, 300, 1]]);

    expect(scene.keys[0]?.baseFill).toBe(style.fillColor);
    expect(scene.keys[0]?.fill.color).toBe(style.activeColor);
  });

  it('turns a fully pressed key entirely into the active colour', () => {
    const scene = buildScene(config(key()), [[174, 1023, 1]]);

    expect(scene.keys[0]?.fill.color).toBe(style.activeColor);
    expect(scene.keys[0]?.fill.h).toBe(90);
  });

  it('still shows how deep an actuated key is pressed', () => {
    const half = buildScene(config(key()), [[174, 512, 1]]);

    expect(half.keys[0]?.fill.h).toBeCloseTo(45.04, 1);
    expect(half.keys[0]?.baseFill).not.toBe(half.keys[0]?.fill.color);
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

describe('the label keeps one colour, whatever moves behind it', () => {
  // The colour used to be computed from the background, which meant the text
  // changed shade as a key was pressed. Readable, but restless — and on a
  // stream the eye follows the flicker rather than the key. It is fixed now,
  // and an outline does the work the colour change was doing.
  it('paints every label the same colour, pressed or not', () => {
    const rest = buildScene(config(key()), []);
    const half = buildScene(config(key()), [[174, 512, 1]]);
    const full = buildScene(config(key()), [[174, 1023, 1]]);

    expect(rest.keys[0]?.labelFill).toBe(OVERLAY_TOKENS.keyLabel);
    expect(half.keys[0]?.labelFill).toBe(OVERLAY_TOKENS.keyLabel);
    expect(full.keys[0]?.labelFill).toBe(OVERLAY_TOKENS.keyLabel);
  });

  it('outlines it in the opposite shade, so it survives any fill', () => {
    const scene = buildScene(config(key()), [[174, 1023, 1]]);

    expect(scene.keys[0]?.labelOutline).toBe(OVERLAY_TOKENS.keyLabelOutline);
    expect(scene.keys[0]?.labelOutlineWidth).toBeGreaterThan(0);
  });

  it('scales the outline with the label, not in fixed pixels', () => {
    const small = buildScene(config(key()), []);
    const tall = buildScene(config(key({ h: 2 })), []);

    expect(tall.keys[0]!.labelOutlineWidth).toBeCloseTo(
      small.keys[0]!.labelOutlineWidth * (190 / 90),
      5,
    );
  });
});

describe('the border says the key fired', () => {
  // Since actuation swaps the two colours, a key at full travel that never
  // fired and a key that fired at zero travel both render as one flat
  // fillColor. The border is the second signal, and it reads at any travel —
  // including none, which is where a low actuation point puts it.
  it('turns the border to the active colour on actuation', () => {
    const fired = buildScene(config(key()), [[174, 10, 1]]);
    const pressed = buildScene(config(key()), [[174, 1023, 0]]);

    expect(fired.keys[0]?.borderColor).toBe(style.activeColor);
    expect(pressed.keys[0]?.borderColor).toBe(style.borderColor);
  });

  it('tells apart the two states that would otherwise look the same', () => {
    const remapped = buildScene(config(key()), [[174, 1023, 0]]);
    const barelyFired = buildScene(config(key()), [[174, 5, 1]]);

    expect(remapped.keys[0]?.borderColor).not.toBe(barelyFired.keys[0]?.borderColor);
  });

  it('leaves an axis-mode key its own border: it never claims to fire', () => {
    const scene = buildScene(config(key({ mode: 'axis' })), [[174, 1023, 1]]);

    expect(scene.keys[0]?.borderColor).toBe(style.borderColor);
  });
});

describe('packing the scene into the corner', () => {
  const away = (): ResolvedConfig =>
    config(key({ id: 1, x: 3, y: 2 }), key({ id: 2, x: 4, y: 2 }), key({ id: 3, x: 3.5, y: 1 }));

  it('leaves the scene where it was placed by default', () => {
    // The editor is a work surface: the keys have to stay under the cursor
    // that is dragging them, and moving the one that defines the edge would
    // otherwise shift every other key on the stage.
    const scene = buildScene(away(), []);

    expect(scene.keys.find((k) => k.id === 1)!.x).toBe(3 * 100 + 5);
  });

  it('pulls the leftmost key to the left edge', () => {
    const scene = buildScene(away(), [], { pack: true });

    expect(scene.keys.find((k) => k.id === 1)!.x).toBe(0 * 100 + 5);
  });

  it('pulls the topmost key to the top edge', () => {
    // Not the same key as the leftmost one: the two axes are independent, and
    // packing on the bounding box of one key would tilt the whole layout.
    const scene = buildScene(away(), [], { pack: true });

    expect(scene.keys.find((k) => k.id === 3)!.y).toBe(0 * 100 + 5);
  });

  it('keeps the keys in the same relative places', () => {
    const scene = buildScene(away(), [], { pack: true });
    const [a, b] = [scene.keys.find((k) => k.id === 1)!, scene.keys.find((k) => k.id === 2)!];

    expect(b.x - a.x).toBe(100);
  });

  it('reports the size of what it drew, not of where it was drawn', () => {
    // The whole point: an unpacked scene is 700 × 300 for three keys that
    // occupy 200 × 200, and OBS would be handed a source three quarters
    // transparent by construction.
    const scene = buildScene(away(), [], { pack: true });

    expect({ width: scene.width, height: scene.height }).toEqual({ width: 200, height: 200 });
  });

  it('draws the fill in the packed place too', () => {
    // The fill is computed from the key rectangle, so a translation applied to
    // one and not the other leaves the travel painted where the key used to
    // be — over its neighbour.
    const scene = buildScene(away(), [[1, 1023, 1]], { pack: true });
    const packed = scene.keys.find((k) => k.id === 1)!;

    expect(packed.fill.x).toBe(packed.x);
  });

  it('survives an empty configuration', () => {
    // `Math.min()` of nothing is Infinity, and every coordinate downstream
    // becomes NaN — an SVG that renders blank with no error anywhere.
    const scene = buildScene(config(), [], { pack: true });

    expect(scene).toEqual({ width: 0, height: 0, keys: [] });
  });
});

describe('recommendedSize', () => {
  it('measures the packed scene, whatever the frame', () => {
    // What goes next to the overlay URL. It has to be the packed box: the
    // unpacked one describes an area that is empty by construction.
    const scene = config(key({ id: 1, x: 3, y: 2 }), key({ id: 2, x: 4, y: 2 }));

    expect(recommendedSize(scene)).toEqual({ width: 200, height: 100 });
  });

  it('is zero when nothing is configured', () => {
    expect(recommendedSize(config())).toEqual({ width: 0, height: 0 });
  });
});
