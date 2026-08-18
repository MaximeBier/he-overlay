import {
  CONFIG_VERSION,
  DEFAULT_STYLE,
  type GlobalStyle,
  type KeyConfig,
  type KeyStyle,
  type LayoutOverride,
  type OverlayConfig,
} from './schema';

export type MigrationResult =
  /**
   * `dropped` counts the keys the file lost on the way in — malformed, or a
   * duplicate of one already kept. Losing a key beats breaking the render, but
   * the user has to be told: importing a profile and quietly getting an
   * amputated keyboard is the silent failure spec §11 rules out.
   */
  | { ok: true; config: OverlayConfig; dropped: number }
  | { ok: false; reason: 'unreadable' | 'too-new' };

type Loose = Record<string, unknown>;

/**
 * One entry per source version. Version 0 is the one for configurations
 * written before the `version` field existed.
 */
const MIGRATIONS: Record<number, (config: Loose) => Loose> = {
  0: (config) => ({ ...config, version: 1, layout: config.layout ?? 'iso' }),
};

const LAYOUT_OVERRIDES: readonly string[] = ['auto', 'azerty', 'qwerty', 'qwertz'];
const FILL_DIRECTIONS: readonly string[] = ['up', 'down', 'left', 'right'];
/** The only color syntax `luminance` in the scene knows how to read. */
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Property names ending in `Color`, resolved once against the style shape. */
const COLOR_KEYS: readonly string[] = Object.keys(DEFAULT_STYLE).filter((name) =>
  name.endsWith('Color'),
);
/** Sizes that belong to the global style and that no key may carry. */
const GLOBAL_ONLY: readonly (keyof GlobalStyle)[] = ['unit', 'gap'];
const GLOBAL_STYLE_KEYS = Object.keys(DEFAULT_STYLE) as readonly (keyof GlobalStyle)[];

/** Geometry has to be drawable, and JSON is happy to hand over Infinity. */
function isExtent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Positions are non-negative: the scene draws its viewBox from the origin, so
 * a key at `x: -1` is rendered outside the frame and never appears — with
 * nothing to explain its absence.
 */
function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Keeps the style properties we know, at the type we expect.
 *
 * Import is a trust boundary — the file may come from a forum post — and a
 * `unit` of `"wide"` propagates as `NaN` through every coordinate of the scene.
 * Comparing against the defaults covers the whole style in one rule: unknown
 * properties are dropped, wrong types are dropped, and so is any number JSON
 * managed to make infinite.
 *
 * `properties` is what separates a global style from a per-key one. The keys
 * inherit `unit` and `gap` from nobody: they are layout sizes, and letting one
 * through would be a setting the editor stores and the renderer ignores.
 */
function pickStyle(raw: unknown, properties: readonly (keyof GlobalStyle)[]): Loose {
  if (typeof raw !== 'object' || raw === null) return {};

  const source = raw as Loose;
  const style: Loose = {};
  for (const property of properties) {
    const value = source[property];
    const fallback = DEFAULT_STYLE[property];
    if (typeof value !== typeof fallback) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    if (property === 'fillDirection' && !FILL_DIRECTIONS.includes(value as string)) continue;
    if (COLOR_KEYS.includes(property) && !HEX_COLOR.test(value as string)) continue;
    // A unit of zero collapses the scene, a negative one produces an invalid
    // SVG width that browsers discard: a blank overlay, on air, in silence.
    if (property === 'unit' && !((value as number) > 0)) continue;
    if (property === 'gap' && (value as number) < 0) continue;
    style[property] = value;
  }
  return style;
}

function knownStyle(raw: unknown): Partial<GlobalStyle> {
  return pickStyle(raw, GLOBAL_STYLE_KEYS) as Partial<GlobalStyle>;
}

/**
 * The per-key style, which the review found crossing the boundary untouched.
 * A `restColor` of `42` reaches `contrastingLabel`, which calls `trim()` on it:
 * the overlay throws inside a `$derived` and stops rendering for good.
 */
function knownKeyStyle(raw: unknown): Partial<KeyStyle> {
  const inheritable = GLOBAL_STYLE_KEYS.filter((property) => !GLOBAL_ONLY.includes(property));
  return pickStyle(raw, inheritable) as Partial<KeyStyle>;
}

function isKeyConfig(value: unknown): value is KeyConfig {
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
    isExtent(key.h)
  );
}

/**
 * Keeps the first key of any duplicated id, the same rule the decoder applies
 * to the report. The id keys the overlay's SVG nodes, and a duplicate there
 * kills the render — mid-stream, on the one surface nobody is watching.
 */
function byUniqueId(keys: KeyConfig[]): KeyConfig[] {
  const seen = new Set<number>();
  return keys.filter((key) => {
    if (seen.has(key.id)) return false;
    seen.add(key.id);
    return true;
  });
}

export function migrate(raw: unknown): MigrationResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'unreadable' };

  let config = { ...(raw as Loose) };
  const version = typeof config.version === 'number' ? config.version : 0;

  if (version > CONFIG_VERSION) return { ok: false, reason: 'too-new' };

  for (let from = version; from < CONFIG_VERSION; from++) {
    const step = MIGRATIONS[from];
    if (!step) return { ok: false, reason: 'unreadable' };
    config = step(config);
  }

  // After the chain, not before: checked ahead of it, no future migration
  // could ever create or rename this field — the step would run and its own
  // result be refused.
  if (!Array.isArray(config.keys)) return { ok: false, reason: 'unreadable' };

  const override = config.layoutOverride;
  const submitted = config.keys as unknown[];
  // A malformed key is dropped: better to lose one key than to break the
  // rendering of all the others.
  const keys = byUniqueId(
    submitted.filter(isKeyConfig).map((key) => ({ ...key, style: knownKeyStyle(key.style) })),
  );

  return {
    ok: true,
    dropped: submitted.length - keys.length,
    config: {
      version: CONFIG_VERSION,
      layout: config.layout === 'ansi' ? 'ansi' : 'iso',
      layoutOverride: LAYOUT_OVERRIDES.includes(override as string)
        ? (override as LayoutOverride)
        : 'auto',
      style: { ...DEFAULT_STYLE, ...knownStyle(config.style) },
      keys,
    },
  };
}
