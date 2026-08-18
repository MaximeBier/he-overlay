import { STYLE_KEYS, DEFAULT_STYLE, type ResolvedConfig } from './schema';

type Loose = Record<string, unknown>;

const FILL_DIRECTIONS: readonly string[] = ['up', 'down', 'left', 'right'];

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
  return STYLE_KEYS.every((property) => {
    const held = style[property];
    if (typeof held !== typeof DEFAULT_STYLE[property]) return false;
    if (typeof held === 'number' && !Number.isFinite(held)) return false;
    if (property === 'fillDirection') return FILL_DIRECTIONS.includes(held as string);
    return true;
  });
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
