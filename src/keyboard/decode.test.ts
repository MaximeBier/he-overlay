import { describe, it, expect } from 'vitest';
import { decodeAnalogReport, MAX_TRAVEL } from './decode';

/**
 * Construit une entrée de 4 octets.
 * `low` porte les bits 0..5 du champ 16 bits : bit 0 = verdict d'actuation,
 * bits 1..5 = étiquettes de type d'entrée (spec §3.1).
 */
function entry(index: number, usage: number, travel: number, low: number): number[] {
  const field = (travel << 6) | low;
  return [index, usage, field & 0xff, (field >> 8) & 0xff];
}

function report(...entries: number[][]): Uint8Array {
  const buf = new Uint8Array(64);
  buf.set(entries.flat());
  return buf;
}

describe('decodeAnalogReport', () => {
  it('décode une entrée principale : course et actuation', () => {
    const { entries, anomalies } = decodeAnalogReport(report(entry(174, 0x50, 996, 0x01)));

    expect(anomalies).toEqual([]);
    expect(entries).toEqual([{ index: 174, usage: 0x50, travel: 996, active: true }]);
  });

  it('rapporte une course nulle sans s’arrêter : une touche relâchée reste présente', () => {
    const { entries } = decodeAnalogReport(
      report(entry(174, 0x50, 0, 0x00), entry(175, 0x51, 500, 0x01)),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ index: 174, usage: 0x50, travel: 0, active: false });
    expect(entries[1]?.travel).toBe(500);
  });

  it('s’arrête à la sentinelle : index et usage nuls', () => {
    const { entries } = decodeAnalogReport(
      report(entry(174, 0x50, 500, 0x01), [0, 0, 0, 0], entry(9, 0x1a, 700, 0x01)),
    );

    expect(entries).toHaveLength(1);
  });

  // Test 4 de la spec §12.1 — sans ce filtrage l'index n'est pas une clé unique.
  it('ignore les entrées étiquetées et garde une seule entrée par index', () => {
    const { entries } = decodeAnalogReport(
      report(entry(174, 0x04, 996, 0x19), entry(174, 0x50, 996, 0x01)),
    );

    expect(entries).toEqual([{ index: 174, usage: 0x50, travel: 996, active: true }]);
  });

  // Test 5 de la spec §12.1 — un rapport plein n'a pas de sentinelle de fin.
  it('décode seize entrées sans sentinelle et ne déborde pas du tampon', () => {
    const full = report(
      ...Array.from({ length: 16 }, (_, i) => entry(10 + i, 0x20 + i, 100 + i, 0x01)),
    );

    const { entries } = decodeAnalogReport(full);

    expect(entries).toHaveLength(16);
    expect(entries[15]).toEqual({ index: 25, usage: 0x2f, travel: 115, active: true });
  });

  // Test 6 de la spec §12.1 — le maximum réel est 0xFFC1, pas 0xFFFF.
  it('donne une course pleine de 1023 pour 0xFFC1', () => {
    const buf = new Uint8Array(64);
    buf.set([200, 0x2c, 0xc1, 0xff]);

    const { entries } = decodeAnalogReport(buf);

    expect(entries[0]?.travel).toBe(MAX_TRAVEL);
    expect(entries[0]?.active).toBe(true);
  });

  // Test 8 de la spec §12.1 — le masque 0x3E est volontairement large.
  it('journalise un bit de poids faible non documenté au lieu de le décoder', () => {
    const { entries, anomalies } = decodeAnalogReport(report(entry(30, 0x16, 500, 0x02)));

    expect(entries).toEqual([]);
    expect(anomalies).toEqual([{ kind: 'unknown-low-bits', index: 30, field: (500 << 6) | 0x02 }]);
  });

  it('ne journalise pas les bits 3 et 4, qui sont documentés', () => {
    const { anomalies } = decodeAnalogReport(report(entry(30, 0x04, 500, 0x18)));

    expect(anomalies).toEqual([]);
  });

  it('refuse un tampon dont la longueur n’est pas de 64 octets', () => {
    const { entries, anomalies } = decodeAnalogReport(new Uint8Array(14));

    expect(entries).toEqual([]);
    expect(anomalies).toEqual([{ kind: 'bad-length', length: 14 }]);
  });
});
