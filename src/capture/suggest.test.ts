import { describe, it, expect } from 'vitest';
import { createAxisSuggester, FULL_TRAVEL_THRESHOLD } from './suggest';
import type { AnalogEntry } from '../keyboard/decode';

const entry = (index: number, travel: number, active: boolean): AnalogEntry => ({
  index,
  usage: 0x50,
  travel,
  active,
});

describe('createAxisSuggester', () => {
  it('suggests nothing until the key has been pressed all the way down', () => {
    const suggester = createAxisSuggester();
    suggester.observe([entry(1, FULL_TRAVEL_THRESHOLD - 1, false)]);

    expect(suggester.suggests(1)).toBe(false);
  });

  it('suggests the axis for a full-travel key that never produced a keystroke', () => {
    const suggester = createAxisSuggester();
    suggester.observe([entry(1, 1023, false)]);

    expect(suggester.suggests(1)).toBe(true);
  });

  it('suggests nothing once the key has produced a keystroke', () => {
    const suggester = createAxisSuggester();
    suggester.observe([entry(1, 1023, false)]);
    suggester.observe([entry(1, 1023, true)]);

    expect(suggester.suggests(1)).toBe(false);
  });

  it('never comes back after a keystroke, however many silent presses follow', () => {
    // One keystroke settles it: the key is mapped, and a hundred presses that
    // happen not to be reported active do not unmap it.
    const suggester = createAxisSuggester();
    suggester.observe([entry(1, 1023, true)]);
    suggester.observe([entry(1, 1023, false)]);

    expect(suggester.suggests(1)).toBe(false);
  });

  it('stays silent for a key it has never seen', () => {
    expect(createAxisSuggester().suggests(42)).toBe(false);
  });

  it('forgets a suggestion the user dismissed', () => {
    const suggester = createAxisSuggester();
    suggester.observe([entry(1, 1023, false)]);
    suggester.dismiss(1);
    suggester.observe([entry(1, 1023, false)]);

    expect(suggester.suggests(1)).toBe(false);
  });

  it('keeps its keys apart', () => {
    const suggester = createAxisSuggester();
    suggester.observe([entry(1, 1023, false), entry(2, 1023, true)]);

    expect([suggester.suggests(1), suggester.suggests(2)]).toEqual([true, false]);
  });
});

describe('createAxisSuggester - saying when it learned something', () => {
  // Reports arrive up to a thousand a second, and the interface has to know
  // when to look again. Without this the caller either polls on every report —
  // recomputing a suggestion list at report rate — or never notices at all.
  it('reports the first sighting of a key', () => {
    expect(createAxisSuggester().observe([entry(1, 1023, false)])).toBe(true);
  });

  it('reports nothing when it already knew', () => {
    const suggester = createAxisSuggester();
    suggester.observe([entry(1, 1023, false)]);

    expect(suggester.observe([entry(1, 1023, false)])).toBe(false);
  });

  it('reports the keystroke that withdraws a suggestion', () => {
    const suggester = createAxisSuggester();
    suggester.observe([entry(1, 1023, false)]);

    expect(suggester.observe([entry(1, 1023, true)])).toBe(true);
  });

  it('reports nothing for travel below the threshold', () => {
    // The common case by far: every report of a key on its way down. This is
    // the one that has to stay quiet.
    expect(createAxisSuggester().observe([entry(1, 500, false)])).toBe(false);
  });

  it('reports nothing for an empty report', () => {
    expect(createAxisSuggester().observe([])).toBe(false);
  });
});
