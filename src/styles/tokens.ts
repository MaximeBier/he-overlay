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
