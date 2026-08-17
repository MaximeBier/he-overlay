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

export interface AnalogEntry {
  /** Matrix index: the stable identity of a key (spec §3.4). */
  index: number;
  /** HID usage, positional: used to look up a label, never displayed. */
  usage: number;
  /** Native travel, 0 to 1023. */
  travel: number;
  /** Firmware actuation verdict: the key produces a keystroke. */
  active: boolean;
}

export type DecodeAnomaly =
  | { kind: 'unknown-low-bits'; index: number; field: number }
  | { kind: 'duplicate-index'; index: number }
  | { kind: 'bad-length'; length: number };

export interface DecodeResult {
  entries: AnalogEntry[];
  anomalies: DecodeAnomaly[];
}

export function decodeAnalogReport(data: Uint8Array): DecodeResult {
  const entries: AnalogEntry[] = [];
  const anomalies: DecodeAnomaly[] = [];
  /** Filtering tagged entries is what makes the index unique (spec §3.1). We
   * enforce that invariant rather than trust it: downstream, the index keys the
   * overlay's SVG nodes, and a duplicate there is fatal. */
  const seen = new Set<number>();

  if (data.length !== ANALOG_REPORT_BYTES) {
    return { entries, anomalies: [{ kind: 'bad-length', length: data.length }] };
  }

  for (let i = 0; i < MAX_ENTRIES; i++) {
    const offset = i * ENTRY_BYTES;
    const index = data[offset]!;
    const usage = data[offset + 1]!;

    // End of list. A zero travel is not enough: a key that was just released
    // stays in the report with a zero value (spec §3.1).
    if (index === 0 && usage === 0) break;

    const field = data[offset + 2]! | (data[offset + 3]! << 8);
    const low = field & LOW_BITS_MASK;

    if (low !== 0) {
      // Tagged entry: it carries the actuation from before Rappy Snappy
      // arbitration, never the one we display. A bit outside the two observed
      // ones is logged rather than decoded on a guess.
      if ((low & ~KNOWN_LOW_BITS) !== 0) {
        anomalies.push({ kind: 'unknown-low-bits', index, field });
      }
      continue;
    }

    if (seen.has(index)) {
      // Keep the first one, log the rest: the same rule as unknown-low-bits —
      // report what we do not understand instead of guessing at it.
      anomalies.push({ kind: 'duplicate-index', index });
      continue;
    }
    seen.add(index);

    entries.push({
      index,
      usage,
      travel: field >> 6,
      active: (field & 1) === 1,
    });
  }

  return { entries, anomalies };
}
