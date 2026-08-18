export const CONFIG_VERSION = 1;

export type KeyMode = 'key' | 'axis';

/**
 * **Physical** geometry of the keyboard: this is what gives keys their size
 * and position (spec §8.5). Not to be confused with `LayoutOverride`.
 */
export type KeyboardLayout = 'iso' | 'ansi';

/**
 * **Logical** layout, the one that decides which character a position
 * produces — hence the label (spec §8.6, §16.5). `auto` trusts
 * `getLayoutMap()`; the other values are the fallback when it gets it wrong.
 */
export type LayoutOverride = 'auto' | 'azerty' | 'qwerty' | 'qwertz';

/** Direction the fill progresses in. `up` = from the bottom upward. */
export type FillDirection = 'up' | 'down' | 'left' | 'right';

/** Appearance properties, the only ones subject to inheritance (spec §8.2). */
export interface KeyStyle {
  restColor: string;
  borderColor: string;
  activeColor: string;
  /**
   * Color of the progressive fill in "key" mode. Has no effect in "axis"
   * mode, which fills with `activeColor` — see "Deliberate deviations".
   */
  fillColor: string;
  /** An arrow ← reads better filled right to left, not bottom to top. */
  fillDirection: FillDirection;
  opacity: number;
  /** Corner radius, in pixels. */
  radius: number;
  /**
   * Family and weight only: the label size is computed from the key height
   * (spec §16.3), so it is never set here.
   */
  fontFamily: string;
  fontWeight: number;
}

export interface GlobalStyle extends KeyStyle {
  /** Pixels per key unit. */
  unit: number;
  /** Gap between keys, in pixels. */
  gap: number;
}

export interface KeyConfig {
  /** Matrix index: the configuration key (spec §3.4). */
  id: number;
  /** HID usage, kept so the label can be recomputed (spec §8.6). */
  usage: number;
  mode: KeyMode;
  label: string;
  /** Position and size in key units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Appearance overrides. Any missing property is inherited from the global. */
  style?: Partial<KeyStyle>;
}

export interface OverlayConfig {
  version: number;
  layout: KeyboardLayout;
  layoutOverride: LayoutOverride;
  style: GlobalStyle;
  keys: KeyConfig[];
}

export interface ResolvedKey {
  id: number;
  usage: number;
  mode: KeyMode;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style: KeyStyle;
}

/** Flattened shape sent to the overlay: no inheritance left to resolve. */
export interface ResolvedConfig {
  version: number;
  unit: number;
  gap: number;
  keys: ResolvedKey[];
}

/**
 * Exhaustiveness is enforced by the compiler, not by care.
 *
 * `STYLE_KEYS` drives inheritance resolution in task 13, so a property added to
 * `KeyStyle` and forgotten here would quietly stop being inheritable — an
 * override the editor accepts and the renderer never applies. A plain array
 * annotated `keyof KeyStyle` would check that each entry is valid, which is the
 * opposite of what matters; `Record<keyof KeyStyle, true>` refuses to compile
 * until every key is listed.
 */
const INHERITABLE: Record<keyof KeyStyle, true> = {
  restColor: true,
  borderColor: true,
  activeColor: true,
  fillColor: true,
  fillDirection: true,
  opacity: true,
  radius: true,
  fontFamily: true,
  fontWeight: true,
};

export const STYLE_KEYS = Object.keys(INHERITABLE) as readonly (keyof KeyStyle)[];

/**
 * Values from the mockup (spec §16.2). They get recentralized in
 * `src/styles/tokens.ts` in task 14b; they are the same values, not
 * placeholders.
 */
export const DEFAULT_STYLE: GlobalStyle = {
  restColor: '#151823',
  borderColor: '#232838',
  activeColor: '#7C9EFF',
  fillColor: '#3D4A78',
  fillDirection: 'up',
  opacity: 1,
  radius: 5,
  fontFamily: "'Archivo', system-ui, sans-serif",
  fontWeight: 700,
  unit: 56,
  gap: 6,
};

export function defaultConfig(): OverlayConfig {
  return {
    version: CONFIG_VERSION,
    layout: 'iso',
    layoutOverride: 'auto',
    style: { ...DEFAULT_STYLE },
    keys: [],
  };
}
