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
  /**
   * Outline drawn around the label, never a second label colour.
   *
   * Named `Inverted` until 2026-08-20, when the contrast computed from the
   * fill was dropped: it worked, but the text flickered while a key travelled
   * and the eye followed the flicker instead of the key (spec §16.3).
   */
  keyLabelOutline: '#0E1015',
  keyRadius: 5,
  /** Tile side and spacing in pixels, from the mockup: 72 with an 8 px gap. */
  keyUnit: 72,
  keyGap: 8,
  keyOpacity: 1,
  keyFontFamily: "'Archivo', system-ui, sans-serif",
  keyFontWeight: 700,
  /** Label height, as a fraction of the key height (spec §16.3). */
  keyLabelRatio: 0.4,
} as const;
