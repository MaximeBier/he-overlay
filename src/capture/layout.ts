import type { KeyConfig, KeyMode, OverlayConfig } from '../config/schema';

/** A quarter key: enough for a ZQSD cross block (spec §8.7). */
export const GRID = 0.25;

/**
 * Snaps to the grid, and refuses anything that is not a number.
 *
 * Not for the numeric fields — `<input type="number">` reports `''` when it is
 * empty, and `+''` is zero, so the editor guards that itself. This is for the
 * values that reach here without passing through a field: an imported profile,
 * a config message off the wire. `NaN` survives every clamp and lands in the
 * SVG as an attribute the browser discards, taking the key off the screen with
 * no error anywhere.
 */
export function snap(value: number, grid: number = GRID): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / grid) * grid;
}

export function pixelsToUnits(pixels: number, unit: number): number {
  return pixels / unit;
}

function patchKey(
  config: OverlayConfig,
  id: number,
  patch: (key: KeyConfig) => KeyConfig,
): OverlayConfig {
  if (!config.keys.some((key) => key.id === id)) return config;
  return { ...config, keys: config.keys.map((key) => (key.id === id ? patch(key) : key)) };
}

export function moveKey(config: OverlayConfig, id: number, x: number, y: number): OverlayConfig {
  return patchKey(config, id, (key) => ({
    ...key,
    x: Math.max(0, snap(x)),
    y: Math.max(0, snap(y)),
  }));
}

/**
 * Moves a group. It is the **offset** that gets snapped, not the final
 * positions: snapping each key separately would destroy the relative
 * alignments of any group laid out off-grid.
 *
 * `origins` is recorded when the drag starts: starting again from the origin
 * positions rather than accumulating offsets avoids any floating-point drift.
 */
export function moveKeysBy(
  config: OverlayConfig,
  origins: ReadonlyMap<number, { x: number; y: number }>,
  dx: number,
  dy: number,
): OverlayConfig {
  if (origins.size === 0) return config;

  const positions = [...origins.values()];
  // The group stops at the edge instead of crushing against the origin.
  const shiftX = Math.max(snap(dx), -Math.min(...positions.map((p) => p.x)));
  const shiftY = Math.max(snap(dy), -Math.min(...positions.map((p) => p.y)));

  return {
    ...config,
    keys: config.keys.map((key) => {
      const origin = origins.get(key.id);
      return origin ? { ...key, x: origin.x + shiftX, y: origin.y + shiftY } : key;
    }),
  };
}

export function resizeKeys(
  config: OverlayConfig,
  ids: readonly number[],
  w: number,
  h: number,
): OverlayConfig {
  const width = Math.max(GRID, snap(w));
  const height = Math.max(GRID, snap(h));

  return {
    ...config,
    keys: config.keys.map((key) => (ids.includes(key.id) ? { ...key, w: width, h: height } : key)),
  };
}

/**
 * Switches the display mode of the selection.
 *
 * The mode changes nothing about how the key is read — the actuation bit
 * arrives either way — only how it is drawn (spec §7.4). Task 23 adds the
 * suggestion that goes with it; this is the manual switch, without which the
 * axis mode exists in the renderer and nowhere else.
 */
export function setMode(
  config: OverlayConfig,
  ids: readonly number[],
  mode: KeyMode,
): OverlayConfig {
  return {
    ...config,
    keys: config.keys.map((key) => (ids.includes(key.id) ? { ...key, mode } : key)),
  };
}
