export interface KeyGeometry {
  /** HID usage, keyboard usage page (0x07). A positional identifier (spec §3.4). */
  readonly usage: number;
  /** Matching `KeyboardEvent.code`: the getLayoutMap() entry (spec §8.6). */
  readonly code: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const k = (usage: number, code: string, x: number, y: number, w = 1, h = 1): KeyGeometry => ({
  usage,
  code,
  x,
  y,
  w,
  h,
});

/** ISO 105-key keyboard. The ANSI variant is a future avenue (spec §15). */
export const ISO_GEOMETRY: readonly KeyGeometry[] = [
  // Function row
  k(0x29, 'Escape', 0, 0),
  k(0x3a, 'F1', 2, 0),
  k(0x3b, 'F2', 3, 0),
  k(0x3c, 'F3', 4, 0),
  k(0x3d, 'F4', 5, 0),
  k(0x3e, 'F5', 6.5, 0),
  k(0x3f, 'F6', 7.5, 0),
  k(0x40, 'F7', 8.5, 0),
  k(0x41, 'F8', 9.5, 0),
  k(0x42, 'F9', 11, 0),
  k(0x43, 'F10', 12, 0),
  k(0x44, 'F11', 13, 0),
  k(0x45, 'F12', 14, 0),
  k(0x46, 'PrintScreen', 15.25, 0),
  k(0x47, 'ScrollLock', 16.25, 0),
  k(0x48, 'Pause', 17.25, 0),

  // Number row
  k(0x35, 'Backquote', 0, 1.5),
  k(0x1e, 'Digit1', 1, 1.5),
  k(0x1f, 'Digit2', 2, 1.5),
  k(0x20, 'Digit3', 3, 1.5),
  k(0x21, 'Digit4', 4, 1.5),
  k(0x22, 'Digit5', 5, 1.5),
  k(0x23, 'Digit6', 6, 1.5),
  k(0x24, 'Digit7', 7, 1.5),
  k(0x25, 'Digit8', 8, 1.5),
  k(0x26, 'Digit9', 9, 1.5),
  k(0x27, 'Digit0', 10, 1.5),
  k(0x2d, 'Minus', 11, 1.5),
  k(0x2e, 'Equal', 12, 1.5),
  k(0x2a, 'Backspace', 13, 1.5, 2),
  k(0x49, 'Insert', 15.25, 1.5),
  k(0x4a, 'Home', 16.25, 1.5),
  k(0x4b, 'PageUp', 17.25, 1.5),
  k(0x53, 'NumLock', 18.5, 1.5),
  k(0x54, 'NumpadDivide', 19.5, 1.5),
  k(0x55, 'NumpadMultiply', 20.5, 1.5),
  k(0x56, 'NumpadSubtract', 21.5, 1.5),

  // Top row
  k(0x2b, 'Tab', 0, 2.5, 1.5),
  k(0x14, 'KeyQ', 1.5, 2.5),
  k(0x1a, 'KeyW', 2.5, 2.5),
  k(0x08, 'KeyE', 3.5, 2.5),
  k(0x15, 'KeyR', 4.5, 2.5),
  k(0x17, 'KeyT', 5.5, 2.5),
  k(0x1c, 'KeyY', 6.5, 2.5),
  k(0x18, 'KeyU', 7.5, 2.5),
  k(0x0c, 'KeyI', 8.5, 2.5),
  k(0x12, 'KeyO', 9.5, 2.5),
  k(0x13, 'KeyP', 10.5, 2.5),
  k(0x2f, 'BracketLeft', 11.5, 2.5),
  k(0x30, 'BracketRight', 12.5, 2.5),
  // L-shaped ISO Enter, treated as a rectangle (spec §8.5).
  k(0x28, 'Enter', 13.75, 2.5, 1.25, 2),
  k(0x4c, 'Delete', 15.25, 2.5),
  k(0x4d, 'End', 16.25, 2.5),
  k(0x4e, 'PageDown', 17.25, 2.5),
  k(0x5f, 'Numpad7', 18.5, 2.5),
  k(0x60, 'Numpad8', 19.5, 2.5),
  k(0x61, 'Numpad9', 20.5, 2.5),
  k(0x57, 'NumpadAdd', 21.5, 2.5, 1, 2),

  // Home row
  k(0x39, 'CapsLock', 0, 3.5, 1.75),
  k(0x04, 'KeyA', 1.75, 3.5),
  k(0x16, 'KeyS', 2.75, 3.5),
  k(0x07, 'KeyD', 3.75, 3.5),
  k(0x09, 'KeyF', 4.75, 3.5),
  k(0x0a, 'KeyG', 5.75, 3.5),
  k(0x0b, 'KeyH', 6.75, 3.5),
  k(0x0d, 'KeyJ', 7.75, 3.5),
  k(0x0e, 'KeyK', 8.75, 3.5),
  k(0x0f, 'KeyL', 9.75, 3.5),
  k(0x33, 'Semicolon', 10.75, 3.5),
  k(0x34, 'Quote', 11.75, 3.5),
  k(0x31, 'Backslash', 12.75, 3.5),
  k(0x5c, 'Numpad4', 18.5, 3.5),
  k(0x5d, 'Numpad5', 19.5, 3.5),
  k(0x5e, 'Numpad6', 20.5, 3.5),

  // Bottom row
  k(0xe1, 'ShiftLeft', 0, 4.5, 1.25),
  k(0x64, 'IntlBackslash', 1.25, 4.5),
  k(0x1d, 'KeyZ', 2.25, 4.5),
  k(0x1b, 'KeyX', 3.25, 4.5),
  k(0x06, 'KeyC', 4.25, 4.5),
  k(0x19, 'KeyV', 5.25, 4.5),
  k(0x05, 'KeyB', 6.25, 4.5),
  k(0x11, 'KeyN', 7.25, 4.5),
  k(0x10, 'KeyM', 8.25, 4.5),
  k(0x36, 'Comma', 9.25, 4.5),
  k(0x37, 'Period', 10.25, 4.5),
  k(0x38, 'Slash', 11.25, 4.5),
  k(0xe5, 'ShiftRight', 12.25, 4.5, 2.75),
  k(0x52, 'ArrowUp', 16.25, 4.5),
  k(0x59, 'Numpad1', 18.5, 4.5),
  k(0x5a, 'Numpad2', 19.5, 4.5),
  k(0x5b, 'Numpad3', 20.5, 4.5),
  k(0x58, 'NumpadEnter', 21.5, 4.5, 1, 2),

  // Modifier row
  k(0xe0, 'ControlLeft', 0, 5.5, 1.25),
  k(0xe3, 'MetaLeft', 1.25, 5.5, 1.25),
  k(0xe2, 'AltLeft', 2.5, 5.5, 1.25),
  k(0x2c, 'Space', 3.75, 5.5, 6.25),
  k(0xe6, 'AltRight', 10, 5.5, 1.25),
  k(0xe7, 'MetaRight', 11.25, 5.5, 1.25),
  k(0x65, 'ContextMenu', 12.5, 5.5, 1.25),
  k(0xe4, 'ControlRight', 13.75, 5.5, 1.25),
  k(0x50, 'ArrowLeft', 15.25, 5.5),
  k(0x51, 'ArrowDown', 16.25, 5.5),
  k(0x4f, 'ArrowRight', 17.25, 5.5),
  k(0x62, 'Numpad0', 18.5, 5.5, 2),
  k(0x63, 'NumpadDecimal', 20.5, 5.5),
];

const BY_USAGE = new Map(ISO_GEOMETRY.map((entry) => [entry.usage, entry]));

export function geometryFor(usage: number): KeyGeometry | undefined {
  return BY_USAGE.get(usage);
}

export interface Placement {
  x: number;
  y: number;
}

/**
 * Places a learned key at its position relative to the keys already placed,
 * reframing the whole set if the new one falls before the origin: learning
 * A, Z, E, R lines them up the way a keyboard does (spec §8.5).
 *
 * Returns the positions of every key, the new one last. Existing keys move
 * only for the reframing — never otherwise, or a placement made by hand
 * would be overwritten by the next learned key.
 */
export function placeNewKey(
  existing: readonly { usage: number; x: number; y: number }[],
  usage: number,
): Placement[] {
  const kept: Placement[] = existing.map(({ x, y }) => ({ x, y }));
  const geometry = BY_USAGE.get(usage);

  /**
   * The placed key that sits closest to the new one **on the reference board**,
   * not on screen.
   *
   * Anchoring on the first key learned only works while the whole board is
   * being translated. Rearrange it — a tight WASD block in one corner, the
   * arrows elsewhere — and a new key measured from a distant anchor lands
   * nowhere near the group being worked on. The nearest neighbour follows the
   * local arrangement instead, and on a row learned left to right the two rules
   * agree, which is why the common case is unchanged.
   */
  let anchor: { key: { x: number; y: number }; geometry: KeyGeometry } | null = null;
  if (geometry) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const key of existing) {
      const reference = BY_USAGE.get(key.usage);
      if (!reference) continue;
      const distance = Math.abs(reference.x - geometry.x) + Math.abs(reference.y - geometry.y);
      // Strictly closer, so ties go to the first key learned. Ties are
      // common — A and D are equidistant from S — and the winner therefore
      // depends on an order the user cannot see. It is deterministic and the
      // result is sane either way; it is not an asymmetry to "fix".
      if (distance < nearest) {
        nearest = distance;
        anchor = { key, geometry: reference };
      }
    }
  }

  let placed: Placement;
  if (!geometry || !anchor) {
    // Unknown usage, or no reference at all: right of the set.
    placed =
      kept.length === 0
        ? { x: 0, y: 0 }
        : {
            x: Math.max(...kept.map((key) => key.x)) + 1,
            y: Math.min(...kept.map((key) => key.y)),
          };
  } else {
    placed = {
      x: anchor.key.x + (geometry.x - anchor.geometry.x),
      y: anchor.key.y + (geometry.y - anchor.geometry.y),
    };
  }

  const all = [...kept, placed];
  const shiftX = Math.min(0, ...all.map((key) => key.x));
  const shiftY = Math.min(0, ...all.map((key) => key.y));

  return all.map((key) => ({ x: key.x - shiftX, y: key.y - shiftY }));
}
