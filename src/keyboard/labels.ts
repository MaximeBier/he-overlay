import { geometryFor } from './geometry';
import type { LayoutOverride } from '../config/schema';

export type LayoutMapLike = { get(code: string): string | undefined };

type KeyboardCapableNavigator = Navigator & {
  keyboard?: { getLayoutMap(): Promise<LayoutMapLike> };
};

/**
 * Chromium only — which costs nothing, since WebHID already limits us to
 * Chromium (spec §8.6). When it is unavailable, the fallbacks are the position
 * name, then editing the label by hand.
 */
export async function loadLayoutMap(nav: Navigator | undefined): Promise<LayoutMapLike | null> {
  const keyboard = (nav as KeyboardCapableNavigator | undefined)?.keyboard;
  if (!keyboard) return null;

  try {
    return await keyboard.getLayoutMap();
  } catch {
    return null;
  }
}

export function labelFor(usage: number, layout: LayoutMapLike | null): string {
  const geometry = geometryFor(usage);
  if (!geometry) return `HID 0x${usage.toString(16)}`;

  const produced = layout?.get(geometry.code);
  if (!produced) return geometry.code;

  return produced.length === 1 ? produced.toUpperCase() : produced;
}

/**
 * Fallback maps, limited to the positions whose character differs from one
 * layout to the next. Everywhere else, the position name is enough.
 *
 * The three cover **the same positions**, deliberately. They exist to be
 * swapped when detection gets it wrong, so a position listed in one and
 * missing from another would make that switch degrade a label into a position
 * name — `KeyY` reading "Y" on qwertz and "KeyY" on qwerty. A test holds the
 * three sets equal.
 */
export const FALLBACK_LAYOUTS: Record<Exclude<LayoutOverride, 'auto'>, LayoutMapLike> = {
  azerty: new Map([
    ['KeyQ', 'a'],
    ['KeyW', 'z'],
    ['KeyA', 'q'],
    ['KeyZ', 'w'],
    ['KeyY', 'y'],
    ['Semicolon', 'm'],
    ['KeyM', ','],
  ]),
  qwerty: new Map([
    ['KeyQ', 'q'],
    ['KeyW', 'w'],
    ['KeyA', 'a'],
    ['KeyZ', 'z'],
    ['KeyY', 'y'],
    ['Semicolon', ';'],
    ['KeyM', 'm'],
  ]),
  qwertz: new Map([
    ['KeyQ', 'q'],
    ['KeyW', 'w'],
    ['KeyA', 'a'],
    ['KeyZ', 'y'],
    ['KeyY', 'z'],
    ['Semicolon', 'ö'],
    ['KeyM', 'm'],
  ]),
};

/**
 * `auto` trusts `getLayoutMap()`. The other values are the explicit fallback
 * of §8.6, picked when detection gets it wrong — and that choice always wins
 * over detection, otherwise it would serve no purpose.
 */
export function resolveLayout(
  override: LayoutOverride,
  detected: LayoutMapLike | null,
): LayoutMapLike | null {
  return override === 'auto' ? detected : FALLBACK_LAYOUTS[override];
}
