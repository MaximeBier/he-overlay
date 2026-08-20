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

/**
 * What a keycap prints for the keys that produce no character.
 *
 * `getLayoutMap()` only speaks for the writing keys, so everything else used to
 * fall back to its position name — "ArrowLeft", "ControlRight". Those are
 * debugging strings; they have no business on a stream.
 *
 * Text over symbols wherever a symbol is not universally cut: the label is
 * drawn with the configured font, and a glyph the font lacks renders as an
 * empty box on air. The four arrows are the exception — they exist everywhere,
 * and no wording beats them.
 *
 * Left and right variants share one label, exactly as both keycaps do; the
 * position on the board is what tells them apart.
 */
const KEYCAP_LABELS: Record<string, string> = {
  Escape: 'Esc',
  PrintScreen: 'Prt Sc',
  ScrollLock: 'Scroll',
  Pause: 'Pause',
  Backspace: 'Bksp',
  Insert: 'Ins',
  Home: 'Home',
  PageUp: 'Pg Up',
  Delete: 'Del',
  End: 'End',
  PageDown: 'Pg Dn',
  Tab: 'Tab',
  CapsLock: 'Caps',
  Enter: 'Enter',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  MetaLeft: 'Win',
  MetaRight: 'Win',
  ContextMenu: 'Menu',
  Space: 'Space',
  ArrowLeft: '←',
  ArrowDown: '↓',
  ArrowRight: '→',
  ArrowUp: '↑',
  NumLock: 'Num',
  NumpadDivide: '/',
  NumpadMultiply: '*',
  NumpadSubtract: '-',
  NumpadAdd: '+',
  NumpadEnter: 'Enter',
  NumpadDecimal: '.',
  Numpad0: '0',
  Numpad1: '1',
  Numpad2: '2',
  Numpad3: '3',
  Numpad4: '4',
  Numpad5: '5',
  Numpad6: '6',
  Numpad7: '7',
  Numpad8: '8',
  Numpad9: '9',
};

export function labelFor(usage: number, layout: LayoutMapLike | null): string {
  const geometry = geometryFor(usage);
  if (!geometry) return `HID 0x${usage.toString(16)}`;

  // Trimmed, because `getLayoutMap()` answers " " for Space. Taken at face
  // value that is a label made of one space: invisible on air, and impossible
  // to tell apart from a missing label.
  const produced = layout?.get(geometry.code)?.trim();
  if (produced) return produced.length === 1 ? produced.toUpperCase() : produced;

  // The detected layout always wins; this only fills the silence it leaves.
  return KEYCAP_LABELS[geometry.code] ?? geometry.code;
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
 * of §8.6, picked when detection gets it wrong.
 *
 * **The choice corrects detection; it does not replace it.** The tables above
 * hold seven positions — the ones the three layouts disagree on — and reading
 * them as the whole answer is a defect found in review on 2026-08-20: forcing
 * a layout renamed every key outside those seven to its position name, because
 * `KEYCAP_LABELS` covers no letter and no digit. Someone whose detection was
 * right for `D` and wrong for `Q` fixed the `Q` and lost the `D`.
 *
 * So the forced table answers first and detection answers the rest. On the
 * seven positions the choice still wins outright, which is the whole point of
 * having it; everywhere else the layouts agree anyway, so detection is as good
 * an answer as exists.
 */
export function resolveLayout(
  override: LayoutOverride,
  detected: LayoutMapLike | null,
): LayoutMapLike | null {
  if (override === 'auto') return detected;

  const forced = FALLBACK_LAYOUTS[override];
  if (detected === null) return forced;
  return { get: (code) => forced.get(code) ?? detected.get(code) };
}
