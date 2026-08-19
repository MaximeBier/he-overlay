import { STYLE_KEYS, DEFAULT_STYLE, type ResolvedConfig } from './schema';

type Loose = Record<string, unknown>;

/**
 * The style rules both sides share.
 *
 * They live here, and `migrate` imports them, because a rule kept in two
 * literal lists is a rule that will hold on one side only. The wire and the
 * imported file must agree on what a colour is; they differ solely on whether
 * a style may be partial.
 */
export const FILL_DIRECTIONS: readonly string[] = ['up', 'down', 'left', 'right'];

/** The only colour syntax the scene's `luminance` knows how to read. */
export const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Property names ending in `Color`, resolved once against the style shape. */
export const COLOR_KEYS: readonly string[] = Object.keys(DEFAULT_STYLE).filter((name) =>
  name.endsWith('Color'),
);

/**
 * Checks one style property against what the renderer can actually draw.
 *
 * Shared by both boundaries. `radius` sits with the sizes rather than with the
 * free numbers: `rx="-5"` is an SVG error, not a square corner, and what
 * survives it is up to the browser.
 */
export function isStyleValue(property: string, value: unknown): boolean {
  const fallback = DEFAULT_STYLE[property as keyof typeof DEFAULT_STYLE];
  if (typeof value !== typeof fallback) return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  if (property === 'fillDirection') return FILL_DIRECTIONS.includes(value as string);
  if (COLOR_KEYS.includes(property)) return HEX_COLOR.test(value as string);
  // A unit of zero collapses the scene, a negative one produces an invalid SVG
  // width that browsers discard: a blank overlay, on air, in silence.
  if (property === 'unit') return (value as number) > 0;
  if (property === 'gap' || property === 'radius') return (value as number) >= 0;
  return true;
}

/** Geometry has to be drawable, and JSON is happy to hand over Infinity. */
export function isExtent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Positions are non-negative: the scene draws its viewBox from the origin, so
 * a key at `x: -1` is rendered outside the frame and never appears — with
 * nothing to explain its absence.
 */
export function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCompleteStyle(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const style = value as Loose;
  return STYLE_KEYS.every((property) => isStyleValue(property, style[property]));
}

function isResolvedKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const key = value as Loose;
  return (
    Number.isInteger(key.id) &&
    Number.isInteger(key.usage) &&
    (key.mode === 'key' || key.mode === 'axis') &&
    typeof key.label === 'string' &&
    isPosition(key.x) &&
    isPosition(key.y) &&
    isExtent(key.w) &&
    isExtent(key.h) &&
    isCompleteStyle(key.style)
  );
}

/**
 * Guards the configuration arriving over obs-websocket.
 *
 * The plan reasoned that the overlay receives what the capture sends and both
 * are built from the same repository. That holds for the sender we intend;
 * it says nothing about the channel. Any client authenticated on the same
 * obs-websocket can emit under our key, and `buildScene` reads `keys.filter`
 * and `style.radius` without a fallback — a config message shaped wrong takes
 * the overlay down for the rest of the stream.
 *
 * A style has to be **complete** here, unlike on import: this shape has already
 * been through inheritance resolution, so a missing property is not something
 * to inherit, it is something that will render as `undefined`.
 */
export function isResolvedConfig(value: unknown): value is ResolvedConfig {
  if (typeof value !== 'object' || value === null) return false;

  const config = value as Loose;
  return (
    typeof config.version === 'number' &&
    Number.isFinite(config.version) &&
    isExtent(config.unit) &&
    isPosition(config.gap) &&
    Array.isArray(config.keys) &&
    config.keys.every(isResolvedKey)
  );
}
