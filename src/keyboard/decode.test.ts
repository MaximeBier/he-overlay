import { describe, it, expect } from 'vitest';
import { decodeAnalogReport, MAX_TRAVEL } from './decode';
import { entry, report } from '../test/fixtures';

describe('decodeAnalogReport', () => {
  it('decodes a primary entry: travel and actuation', () => {
    const { entries, anomalies } = decodeAnalogReport(report(entry(174, 0x50, 996, 0x01)));

    expect(anomalies).toEqual([]);
    expect(entries).toEqual([{ index: 174, usage: 0x50, travel: 996, active: true }]);
  });

  it('reports a zero travel without stopping: a released key stays present', () => {
    const { entries } = decodeAnalogReport(
      report(entry(174, 0x50, 0, 0x00), entry(175, 0x51, 500, 0x01)),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ index: 174, usage: 0x50, travel: 0, active: false });
    expect(entries[1]?.travel).toBe(500);
  });

  it('stops at the sentinel: zero index and zero usage', () => {
    const { entries } = decodeAnalogReport(
      report(entry(174, 0x50, 500, 0x01), [0, 0, 0, 0], entry(9, 0x1a, 700, 0x01)),
    );

    expect(entries).toHaveLength(1);
  });

  // Test 4 of spec §12.1 — without this filtering the index is not a unique key.
  it('ignores tagged entries and keeps a single entry per index', () => {
    const { entries } = decodeAnalogReport(
      report(entry(174, 0x04, 996, 0x19), entry(174, 0x50, 996, 0x01)),
    );

    expect(entries).toEqual([{ index: 174, usage: 0x50, travel: 996, active: true }]);
  });

  // The matrix index keys the overlay's SVG nodes. Two primary entries sharing
  // one index would make Svelte throw on a duplicate key and freeze the overlay
  // mid-stream — on the one surface where a failure is invisible to whoever is
  // configuring it and visible to every viewer.
  it('keeps one entry per index and logs the duplicate', () => {
    const { entries, anomalies } = decodeAnalogReport(
      report(entry(174, 0x50, 996, 0x01), entry(174, 0x50, 100, 0x00)),
    );

    expect(entries).toEqual([{ index: 174, usage: 0x50, travel: 996, active: true }]);
    expect(anomalies).toEqual([{ kind: 'duplicate-index', index: 174 }]);
  });

  // Test 5 of spec §12.1 — a full report has no end sentinel.
  it('decodes sixteen entries without a sentinel and does not overrun the buffer', () => {
    const full = report(
      ...Array.from({ length: 16 }, (_, i) => entry(10 + i, 0x20 + i, 100 + i, 0x01)),
    );

    const { entries } = decodeAnalogReport(full);

    expect(entries).toHaveLength(16);
    expect(entries[15]).toEqual({ index: 25, usage: 0x2f, travel: 115, active: true });
  });

  // Test 6 of spec §12.1 — the real maximum is 0xFFC1, not 0xFFFF.
  it('yields a full travel of 1023 for 0xFFC1', () => {
    const buf = new Uint8Array(64);
    buf.set([200, 0x2c, 0xc1, 0xff]);

    const { entries } = decodeAnalogReport(buf);

    expect(entries[0]?.travel).toBe(MAX_TRAVEL);
    expect(entries[0]?.active).toBe(true);
  });

  // Test 8 of spec §12.1 — the 0x3E mask is deliberately wide.
  it('logs an undocumented low bit instead of decoding it', () => {
    const { entries, anomalies } = decodeAnalogReport(report(entry(30, 0x16, 500, 0x02)));

    expect(entries).toEqual([]);
    expect(anomalies).toEqual([{ kind: 'unknown-low-bits', index: 30, field: (500 << 6) | 0x02 }]);
  });

  it('does not log bits 3 and 4, which are documented', () => {
    const { anomalies } = decodeAnalogReport(report(entry(30, 0x04, 500, 0x18)));

    expect(anomalies).toEqual([]);
  });

  it('rejects a buffer whose length is not 64 bytes', () => {
    const { entries, anomalies } = decodeAnalogReport(new Uint8Array(14));

    expect(entries).toEqual([]);
    expect(anomalies).toEqual([{ kind: 'bad-length', length: 14 }]);
  });
});
