/**
 * Settings interface only. Nothing from here goes out on the broadcast — and
 * nothing from here reaches the overlay's bundle either, which is why it lives
 * in its own file: the overlay imports the configuration schema, the schema
 * imports the broadcast tokens, and a single module would have dragged this
 * palette into the chunk OBS keeps loaded (spec §5.1).
 */
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
