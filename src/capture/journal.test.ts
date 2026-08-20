import { describe, it, expect } from 'vitest';
import { createJournal, describeAnomaly, hexDump } from './journal';

describe('what the journal keeps', () => {
  it('timestamps and classifies an entry', () => {
    const journal = createJournal();
    journal.add('user', 'Keyboard unplugged', 1000);

    expect(journal.entries()).toEqual([{ at: 1000, kind: 'user', message: 'Keyboard unplugged' }]);
  });

  it('separates what someone can fix from what is ours to fix', () => {
    // The whole point of the split (spec §11): a reader has to be able to tell
    // "plug your keyboard back in" from "this keyboard says something we never
    // documented", because only one of the two is worth reporting.
    const journal = createJournal();
    journal.add('user', 'OBS unreachable', 1);
    journal.add('bug', 'Unknown low bits', 2);

    expect(journal.entries().filter((entry) => entry.kind === 'bug')).toHaveLength(1);
  });

  it('drops the oldest rather than growing without end', () => {
    // A session lasts a whole stream. Unbounded, this is a memory leak on the
    // page that must never stutter.
    const journal = createJournal(2);
    journal.add('user', 'a', 1);
    journal.add('user', 'b', 2);
    journal.add('user', 'c', 3);

    expect(journal.entries().map((entry) => entry.message)).toEqual(['b', 'c']);
  });

  it('hands out a list that cannot be written into', () => {
    // `entries()` feeds the diagnostics panel, which renders it. Handing out
    // the live array makes the panel able to corrupt the log it is displaying.
    const journal = createJournal();
    journal.add('user', 'a', 1);

    // The cast is the point: `readonly` stops an honest caller, not a mistake
    // made through `any`, a spread, or a component that mutates what it renders.
    (journal.entries() as unknown as { message: string }[])[0]!.message = 'tampered';

    expect(journal.entries()[0]!.message).toBe('a');
  });
});

describe('the text one pastes into a bug report', () => {
  it('puts one entry per line, oldest first', () => {
    const journal = createJournal();
    journal.add('user', 'first', 0);
    journal.add('bug', 'second', 1);

    const lines = journal.asText().split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('second');
  });

  it('says how long into the session each line happened', () => {
    // A raw `performance.now()` float means nothing to a reader. What answers
    // "what were you doing when it broke" is the time since the page opened.
    const journal = createJournal();
    journal.add('bug', 'Unknown low bits', 12_340);

    expect(journal.asText()).toContain('12.3s');
  });

  it('carries the kind, so a reader can skip the ordinary lines', () => {
    const journal = createJournal();
    journal.add('bug', 'Unknown low bits', 1234);

    expect(journal.asText()).toContain('bug');
    expect(journal.asText()).toContain('Unknown low bits');
  });

  it('says so rather than handing over an empty string', () => {
    // An empty clipboard reads as "the copy button is broken".
    expect(createJournal().asText()).toMatch(/no entries|nothing/i);
  });
});

describe('putting an anomaly into words', () => {
  it('describes an undocumented low bit with the field that carried it', () => {
    // The field is the whole report: without it there is nothing to decode
    // afterwards, and the entry exists precisely to be decoded afterwards.
    const text = describeAnomaly({ kind: 'unknown-low-bits', index: 30, field: 0x7d02 });

    expect(text).toContain('30');
    expect(text).toContain('0x7d02');
  });

  it('describes a report of the wrong length', () => {
    expect(describeAnomaly({ kind: 'bad-length', length: 14 })).toContain('14');
  });

  it('describes a repeated index, which the plan forgot', () => {
    // Three kinds, not two. A branch that reads `field` off this one does not
    // even compile — and one that skips it drops the anomaly that says the
    // report layout is not what we think it is.
    expect(describeAnomaly({ kind: 'duplicate-index', index: 30 })).toContain('30');
  });

  it('never says the same thing for two different kinds', () => {
    const said = [
      describeAnomaly({ kind: 'unknown-low-bits', index: 1, field: 2 }),
      describeAnomaly({ kind: 'duplicate-index', index: 1 }),
      describeAnomaly({ kind: 'bad-length', length: 1 }),
    ];

    expect(new Set(said).size).toBe(3);
  });
});

describe('the raw snapshot', () => {
  it('renders sixteen bytes to a line, zero-padded', () => {
    const dump = hexDump(new Uint8Array([0x00, 0xff, 0x10]));

    expect(dump).toBe('00 ff 10');
  });

  it('wraps at sixteen, so the columns line up against the report layout', () => {
    // Spec §3.1 describes the report in pairs of bytes. Lines of sixteen put
    // every entry at the same column on every line, which is what makes an
    // unknown layout readable at a glance.
    const dump = hexDump(new Uint8Array(Array.from({ length: 20 }, (_, i) => i)));
    const lines = dump.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]!.split(' ')).toHaveLength(16);
    expect(lines[1]).toBe('10 11 12 13');
  });

  it('says so rather than rendering nothing at all', () => {
    expect(hexDump(new Uint8Array())).toMatch(/empty|no data/i);
  });
});
