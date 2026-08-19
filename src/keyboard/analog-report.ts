/**
 * Shape of the Wooting analog report (spec §3.1, §3.2).
 *
 * Constants only, and no code at all — which is the point. `scene.ts` needs
 * `MAX_TRAVEL` to turn a travel into a ratio, and importing it from `decode.ts`
 * pulled the whole decoder into the chunk shared by both entry points: the
 * overlay was carrying a HID decoder it can never call. Bundlers split by
 * module, so a constant kept next to code travels with that code.
 */

/** Usage page of the Wooting Two HE ARM analog interfaces (spec §3.2). */
export const ANALOG_USAGE_PAGE = 0xff53;
/** Exact size of an analog report. Used as a sanity check. */
export const ANALOG_REPORT_BYTES = 64;
export const ENTRY_BYTES = 4;
/** 64 / 4: a full report carries no end sentinel. */
export const MAX_ENTRIES = ANALOG_REPORT_BYTES / ENTRY_BYTES;
/** Maximum travel, bounded by construction: a uint16 shifted right by 6 bits. */
export const MAX_TRAVEL = 1023;
/** Bits 1..5: entry type tags. A primary entry has all of them clear. */
export const LOW_BITS_MASK = 0x3e;
/** Only bits 3 and 4 have ever been observed set. Anything else is unexpected. */
export const KNOWN_LOW_BITS = 0x18;
