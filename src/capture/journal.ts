import type { DecodeAnomaly } from '../keyboard/decode';

/**
 * Who a line is for.
 *
 * `user` is something to act on — plug the keyboard back in, start OBS.
 * `bug` is something we got wrong, or a keyboard saying what no document
 * describes. A reader has to be able to skip one and report the other; one
 * undifferentiated stream makes both invisible (spec §11).
 */
export type JournalKind = 'user' | 'bug';

export interface JournalEntry {
  at: number;
  kind: JournalKind;
  message: string;
}

export interface Journal {
  add(kind: JournalKind, message: string, now: number): void;
  entries(): readonly JournalEntry[];
  /** Text to paste into a bug report (spec §11). */
  asText(): string;
}

const EMPTY = 'No entries yet.';

export function createJournal(limit = 200): Journal {
  const entries: JournalEntry[] = [];

  return {
    add(kind, message, now) {
      entries.push({ at: now, kind, message });
      // A session lasts a whole stream, and anomalies can arrive at the report
      // rate. Unbounded, this is a memory leak on the page that must not stutter.
      if (entries.length > limit) entries.splice(0, entries.length - limit);
    },

    entries() {
      // Copied, not handed over: this feeds the panel that renders it, and a
      // live array makes the display able to corrupt the log it displays.
      return entries.map((entry) => ({ ...entry }));
    },

    asText() {
      if (entries.length === 0) return EMPTY;
      return entries
        .map((entry) => `${elapsed(entry.at)}\t${entry.kind}\t${entry.message}`)
        .join('\n');
    },
  };
}

/**
 * Time since the page opened, which is what the reader of a report has.
 *
 * A bare `performance.now()` float means nothing to anyone; "what were you
 * doing 12 seconds in" is a question someone can actually answer.
 */
function elapsed(at: number): string {
  return `+${(at / 1000).toFixed(1)}s`;
}

export function describeAnomaly(anomaly: DecodeAnomaly): string {
  switch (anomaly.kind) {
    case 'bad-length':
      return `Report was ${anomaly.length} bytes, not 64; ignored.`;
    case 'duplicate-index':
      return (
        `Key ${anomaly.index} appeared twice in one report; the repeat was ignored. ` +
        `The report layout is not what we assume.`
      );
    case 'unknown-low-bits':
      // The field, not just the index: the entry exists to be decoded later,
      // and without the raw value there is nothing left to decode.
      return (
        `Key ${anomaly.index} reported undocumented low bits ` +
        `(field 0x${anomaly.field.toString(16)}); entry ignored.`
      );
  }
}

const BYTES_PER_LINE = 16;

/**
 * Raw snapshot, to identify the report format of an unknown keyboard (§11).
 *
 * Sixteen to a line because spec §3.1 reads the report in pairs of bytes: a
 * fixed, even width puts every entry at the same column on every line, which
 * is what makes a layout nobody documented readable at a glance.
 */
export function hexDump(data: Uint8Array): string {
  if (data.length === 0) return 'No data.';

  const lines: string[] = [];
  for (let offset = 0; offset < data.length; offset += BYTES_PER_LINE) {
    lines.push(
      [...data.slice(offset, offset + BYTES_PER_LINE)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' '),
    );
  }
  return lines.join('\n');
}
