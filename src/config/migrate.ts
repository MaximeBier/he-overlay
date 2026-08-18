import {
  CONFIG_VERSION,
  DEFAULT_STYLE,
  type GlobalStyle,
  type KeyConfig,
  type LayoutOverride,
  type OverlayConfig,
} from './schema';

export type MigrationResult =
  | { ok: true; config: OverlayConfig }
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

/** Geometry has to be drawable, and JSON is happy to hand over Infinity. */
function isExtent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
 * Keeps the style properties we know, at the type we expect.
 *
 * Import is a trust boundary — the file may come from a forum post — and a
 * `unit` of `"wide"` propagates as `NaN` through every coordinate of the scene.
 * Comparing against the defaults covers the whole style in one rule: unknown
 * properties are dropped, wrong types are dropped, and so is any number JSON
 * managed to make infinite.
 */
function knownStyle(raw: unknown): Partial<GlobalStyle> {
  if (typeof raw !== 'object' || raw === null) return {};

  const source = raw as Loose;
  const style: Loose = {};
  for (const [property, fallback] of Object.entries(DEFAULT_STYLE)) {
    const value = source[property];
    if (typeof value !== typeof fallback) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    if (property === 'fillDirection' && !FILL_DIRECTIONS.includes(value as string)) continue;
    style[property] = value;
  }
  return style as Partial<GlobalStyle>;
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
  if (!Array.isArray(config.keys)) return { ok: false, reason: 'unreadable' };

  for (let from = version; from < CONFIG_VERSION; from++) {
    const step = MIGRATIONS[from];
    if (!step) return { ok: false, reason: 'unreadable' };
    config = step(config);
  }

  const override = config.layoutOverride;

  return {
    ok: true,
    config: {
      version: CONFIG_VERSION,
      layout: config.layout === 'ansi' ? 'ansi' : 'iso',
      layoutOverride: LAYOUT_OVERRIDES.includes(override as string)
        ? (override as LayoutOverride)
        : 'auto',
      style: { ...DEFAULT_STYLE, ...knownStyle(config.style) },
      // A malformed key is dropped: better to lose one key than to break the
      // rendering of all the others.
      keys: byUniqueId((config.keys as unknown[]).filter(isKeyConfig)),
    },
  };
}
