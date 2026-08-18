/**
 * Default appearance of the keys on the broadcast. These values travel inside
 * the resolved configuration over obs-websocket and end up as SVG `fill`
 * attributes: they have to be literals, never CSS variables.
 *
 * A selection criterion no ordinary design system has: they must stay readable
 * over any game background, light or dark.
 */
export const OVERLAY_TOKENS = {
  keyRest: '#151823',
  keyBorder: '#232838',
  keyActive: '#7C9EFF',
  keyFill: '#3D4A78',
  keyLabel: '#DDE1E9',
  /** Inverted contrast, for when the fill passes under the text. */
  keyLabelInverted: '#0E1015',
  keyRadius: 5,
  keyOpacity: 1,
  keyFontFamily: "'Archivo', system-ui, sans-serif",
  keyFontWeight: 700,
  /** Label height, as a fraction of the key height (spec §16.3). */
  keyLabelRatio: 0.4,
} as const;

/** Settings interface only. Nothing from here goes out on the broadcast. */
export const UI_TOKENS = {
  bg: '#0E1015',
  stage: '#0B0D11',
  surface: '#151823',
  popover: '#141722',
  border: '#1B1E27',
  borderPopover: '#262B3A',
  accent: '#7C9EFF',
  accentHover: '#a5bcff',
  override: '#D9A05B',
  danger: '#E06C5B',
  ok: '#4CAF7D',
  text: '#DDE1E9',
  textMuted: '#8B90A0',
  textFaint: '#5A5F70',
  textGhost: '#4A4F60',
  font: "400 14px 'Archivo', system-ui, sans-serif",
  fontMono: "400 12px 'IBM Plex Mono', ui-monospace, monospace",
  radius: '4px',
  space: '0.5rem',
  headerHeight: '50px',
  panelWidth: '300px',
} as const;

const CSS_PREFIX = '--he-';

export function cssVariables(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(UI_TOKENS).map(([name, value]) => [
      `${CSS_PREFIX}${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      String(value),
    ]),
  );
}

export function applyTokens(root: {
  style: { setProperty(name: string, value: string): void };
}): void {
  for (const [name, value] of Object.entries(cssVariables())) {
    root.style.setProperty(name, value);
  }
}
