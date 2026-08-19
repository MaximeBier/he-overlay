import { MAX_TRAVEL } from '../keyboard/analog-report';
import { OVERLAY_TOKENS } from '../styles/tokens';
import type { FillDirection, ResolvedConfig } from '../config/schema';
import type { FrameKey } from '../protocol/messages';

export interface SceneFill {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface SceneKey {
  id: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  baseFill: string;
  borderColor: string;
  fill: SceneFill;
  /** Chosen from what sits behind the text, never a setting. */
  labelFill: string;
  fontFamily: string;
  fontWeight: number;
  /** Computed from the key height (spec 16.3). */
  fontSize: number;
  opacity: number;
  /**
   * The key is in axis mode. The scene flags it; the renderer decides whether
   * to do anything with it - the editor does, the overlay never does.
   */
  axis: boolean;
}

export interface Scene {
  width: number;
  height: number;
  keys: SceneKey[];
}

/** WCAG relative luminance of a `#rgb` or `#rrggbb` color. */
function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const digits = match[1]!;
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;

  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/**
 * Background luminance at which both labels contrast equally well.
 *
 * Derived from the two tokens rather than written down. The familiar 0.179 is
 * the crossover for pure black against pure white, and ours are neither: with
 * #DDE1E9 and #0E1015 the real crossover sits at 0.1603, so a borrowed
 * constant left a band where the code picked the label that reads worse.
 *
 * WCAG contrast is (L1 + 0.05) / (L2 + 0.05), so the two are equal when the
 * background luminance is the geometric mean of the offset endpoints.
 */
const LABEL_CROSSOVER = (() => {
  const light = luminance(OVERLAY_TOKENS.keyLabel);
  const dark = luminance(OVERLAY_TOKENS.keyLabelInverted);
  // Only if a token stops being a hex colour, which the tests would catch
  // first; the fallback keeps the old behaviour rather than throwing at import.
  if (light === null || dark === null) return 0.179;
  return Math.sqrt((light + 0.05) * (dark + 0.05)) - 0.05;
})();

/**
 * The fill moves under the text: a fixed label color would be unreadable half
 * the time. So it is computed, not a setting.
 */
export function contrastingLabel(background: string): string {
  const value = luminance(background);
  if (value === null) return OVERLAY_TOKENS.keyLabel;
  return value > LABEL_CROSSOVER ? OVERLAY_TOKENS.keyLabelInverted : OVERLAY_TOKENS.keyLabel;
}

function fillRect(
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  direction: FillDirection,
): { x: number; y: number; w: number; h: number } {
  switch (direction) {
    case 'down':
      return { x, y, w, h: h * ratio };
    case 'right':
      return { x, y, w: w * ratio, h };
    case 'left':
      return { x: x + w - w * ratio, y, w: w * ratio, h };
    // `up` is also the fallback: the switch is exhaustive over the type,
    // which protects the code and not the data. An unknown direction returned
    // undefined, the spread then dropped x/y/w/h, and that key stopped showing
    // its travel for good — without an error anywhere.
    case 'up':
    default:
      return { x, y: y + h - h * ratio, w, h: h * ratio };
  }
}

export function buildScene(config: ResolvedConfig, frame: readonly FrameKey[]): Scene {
  const { unit, gap } = config;
  const states = new Map(frame.map(([id, travel, active]) => [id, { travel, active }]));

  let width = 0;
  let height = 0;

  // Deduplicated here rather than only on import: a config message crossing
  // obs-websocket is validated as "an object" and no further, so two equal ids
  // would kill the keyed each block that draws them.
  const drawn = new Set<number>();
  const unique = config.keys.filter((key) => {
    if (drawn.has(key.id)) return false;
    drawn.add(key.id);
    return true;
  });

  const keys = unique.map((key): SceneKey => {
    // A key missing from the frame means zero travel and inactive (spec 7.3).
    const state = states.get(key.id) ?? { travel: 0, active: 0 as const };
    // Clamped, because the frame crosses obs-websocket and anyone
    // authenticated on it can speak. A ratio above one draws a fill several
    // times the key height, over its neighbours.
    const ratio = Number.isFinite(state.travel)
      ? Math.min(1, Math.max(0, state.travel / MAX_TRAVEL))
      : 0;

    const x = key.x * unit + gap / 2;
    const y = key.y * unit + gap / 2;
    // A gap wider than the key itself is the user's to set, and a rect with a
    // negative width is an SVG error rather than a small key.
    const w = Math.max(0, key.w * unit - gap);
    const h = Math.max(0, key.h * unit - gap);

    // Axis mode never switches its background (spec 7.4): its active color
    // serves as the fill color. In key mode the fill keeps its own color,
    // otherwise it would vanish as soon as the background switches.
    const fillColor = key.mode === 'axis' ? key.style.activeColor : key.style.fillColor;
    const baseFill =
      key.mode === 'key' && state.active === 1 ? key.style.activeColor : key.style.restColor;

    width = Math.max(width, (key.x + key.w) * unit);
    height = Math.max(height, (key.y + key.h) * unit);

    return {
      id: key.id,
      label: key.label,
      x,
      y,
      w,
      h,
      radius: key.style.radius,
      baseFill,
      borderColor: key.style.borderColor,
      fill: { ...fillRect(x, y, w, h, ratio, key.style.fillDirection), color: fillColor },
      // Chosen from whichever colour covers most of the glyph. The label is
      // centred and its band is symmetric, so in all four directions the two
      // colours split it evenly at half travel — which makes 0.5 the balance
      // point, not an approximation of one. It is not the moment the fill
      // *covers* the text: with a glyph 0.4 of the key tall, the fill touches
      // it at 0.3 and hides it at 0.7.
      labelFill: contrastingLabel(ratio >= 0.5 ? fillColor : baseFill),
      fontFamily: key.style.fontFamily,
      fontWeight: key.style.fontWeight,
      // Proportional: a frozen pixel size breaks on resize and becomes
      // unreadable at the real stream size (mockup 4b).
      fontSize: h * OVERLAY_TOKENS.keyLabelRatio,
      opacity: key.style.opacity,
      axis: key.mode === 'axis',
    };
  });

  return { width, height, keys };
}
