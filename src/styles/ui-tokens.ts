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
  borderControl: '#232838',
  borderPopover: '#262B3A',
  /** Also the disabled dot. The mockup gives one value both jobs. */
  borderHover: '#3A4054',
  /**
   * Toast borders, one per tone (spec §16.6). Deeper than the dot they sit
   * beside — a toast reads as a message, not as an alert box, and a border in
   * the dot's own colour is the difference.
   */
  borderOk: '#2E5D42',
  borderWarn: '#4A3820',
  borderDanger: '#3A2226',
  accent: '#7C9EFF',
  accentHover: '#a5bcff',
  override: '#D9A05B',
  danger: '#E06C5B',
  ok: '#4CAF7D',
  text: '#DDE1E9',
  textMuted: '#8B90A0',
  textFaint: '#5A5F70',
  textGhost: '#4A4F60',
  /**
   * The type scale, one step per role, **taken from the lot** — not guessed.
   *
   * The mockup is drawn on an 1180 px board and its figures are absolute: 9.5
   * to 12.5 px. Applied literally to a real window they read as too small,
   * because the board was never the size of anybody's screen. These four steps
   * keep the mockup's *ratios* and lift the whole thing one notch; changing
   * them here changes the whole interface at once, which is the point of
   * having them rather than forty literals.
   */
  sizeXs: '14px',
  sizeSm: '15px',
  sizeMd: '16px',
  sizeLg: '18px',
  font: "400 16px 'Archivo', system-ui, sans-serif",
  fontMono: "400 15px 'IBM Plex Mono', ui-monospace, monospace",
  /**
   * Three radii, not one. The mockup gives inputs 4 px, tiles and buttons 5,
   * panels and popovers 6 — a hierarchy small enough to look accidental and
   * consistent enough that flattening it reads as sloppy at a glance.
   */
  radius: '4px',
  radiusControl: '5px',
  radiusPanel: '6px',
  space: '0.5rem',
  headerHeight: '62px',
  panelWidth: '380px',
  /** Read by the editor too, which has to keep the popover inside the stage. */
  popoverWidth: '284px',
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
