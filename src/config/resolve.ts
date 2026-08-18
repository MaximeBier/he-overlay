import {
  STYLE_KEYS,
  type GlobalStyle,
  type KeyConfig,
  type KeyStyle,
  type OverlayConfig,
  type ResolvedConfig,
} from './schema';

/**
 * What a key actually overrides for one property, or `undefined`.
 *
 * The single place that decides what counts as an override, so that resolution
 * and the editor's markers can never disagree. `null` counts as absent: it
 * cannot be typed, but it arrives from imported JSON, and a property the editor
 * flags as customized while the renderer inherits it is the exact confusion
 * these markers exist to prevent.
 *
 * Zero, on the other hand, is a value. An opacity of zero, a radius of zero are
 * legitimate choices, and a truthiness test would hand the key back its
 * inherited value behind the user's back.
 */
function overrideOf<P extends keyof KeyStyle>(
  key: KeyConfig,
  property: P,
): KeyStyle[P] | undefined {
  return key.style?.[property] ?? undefined;
}

/**
 * Effective style of a key. Written once only: duplicating this rule between
 * the preview and the overlay would guarantee one copy drifts (spec §8.2).
 */
export function effectiveStyle(global: GlobalStyle, key: KeyConfig): KeyStyle {
  // Built by iteration so the inheritable set lives in exactly one place. The
  // cast is the price of that: TypeScript cannot see that STYLE_KEYS covers
  // every property of KeyStyle. What makes it safe is the
  // `Record<keyof KeyStyle, true>` the list is derived from, which refuses to
  // compile if a property is missing — plus a test on the produced keys.
  const style = {} as Record<keyof KeyStyle, unknown>;
  for (const property of STYLE_KEYS) {
    style[property] = overrideOf(key, property) ?? global[property];
  }
  return style as KeyStyle;
}

export function overriddenKeys(key: KeyConfig): (keyof KeyStyle)[] {
  return STYLE_KEYS.filter((property) => overrideOf(key, property) !== undefined);
}

/** Visible marker in the editor: without it, months later you are left hunting
 *  for why one key does not react like the others (spec §8.2). */
export function hasOverrides(key: KeyConfig): boolean {
  return overriddenKeys(key).length > 0;
}

export function resolve(config: OverlayConfig): ResolvedConfig {
  return {
    version: config.version,
    unit: config.style.unit,
    gap: config.style.gap,
    keys: config.keys.map((key) => ({
      id: key.id,
      usage: key.usage,
      mode: key.mode,
      label: key.label,
      x: key.x,
      y: key.y,
      w: key.w,
      h: key.h,
      style: effectiveStyle(config.style, key),
    })),
  };
}
