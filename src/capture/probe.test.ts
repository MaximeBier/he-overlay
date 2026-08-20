import { describe, it, expect } from 'vitest';
import { createStreamProbe } from './probe';

describe('the background stream probe', () => {
  it('reports nothing before it is started', () => {
    // Started by a click, not on load: the two figures only mean something for
    // a window someone chose, and a probe running since page load would blame
    // an hour of not typing on the browser.
    const probe = createStreamProbe();
    probe.observe(1000);

    expect(probe.running).toBe(false);
    expect(probe.reading()).toBeNull();
  });

  it('counts the reports that arrived while it ran', () => {
    const probe = createStreamProbe();
    probe.start(0);
    probe.observe(10);
    probe.observe(20);
    probe.observe(30);

    expect(probe.reading()!.reports).toBe(3);
  });

  it('keeps the widest silence between two reports', () => {
    // The one figure that answers spec §2.2: a background tab that throttled
    // the stream shows a gap in the seconds, not in the milliseconds.
    const probe = createStreamProbe();
    probe.start(0);
    probe.observe(100);
    probe.observe(150);
    probe.observe(2_150);
    probe.observe(2_200);

    expect(probe.reading()!.maxGapMs).toBe(2_000);
  });

  it('does not count the wait before the first report as a silence', () => {
    // Starting the probe and only then alt-tabbing to the game is the normal
    // gesture. Charging that delay to the keyboard would report throttling
    // that never happened.
    const probe = createStreamProbe();
    probe.start(0);
    probe.observe(30_000);

    expect(probe.reading()!.maxGapMs).toBe(0);
  });

  it('says how long it has been watching, so the count can be read', () => {
    // 400 reports means nothing on its own. Over four seconds it is a healthy
    // stream; over four minutes it is a stream that died and came back.
    const probe = createStreamProbe();
    probe.start(1_000);
    probe.observe(3_000);

    expect(probe.reading()!.sinceMs).toBe(2_000);
  });

  it('keeps its figures after it stops, which is when they get read', () => {
    const probe = createStreamProbe();
    probe.start(0);
    probe.observe(100);
    probe.stop(500);

    expect(probe.running).toBe(false);
    expect(probe.reading()).toEqual({ reports: 1, maxGapMs: 0, sinceMs: 500 });
  });

  it('ignores reports that arrive after it stopped', () => {
    const probe = createStreamProbe();
    probe.start(0);
    probe.observe(100);
    probe.stop(200);
    probe.observe(300);

    expect(probe.reading()!.reports).toBe(1);
    expect(probe.reading()!.sinceMs).toBe(200);
  });

  it('starts over rather than adding to the last run', () => {
    const probe = createStreamProbe();
    probe.start(0);
    probe.observe(100);
    probe.observe(5_100);

    probe.start(10_000);
    probe.observe(10_100);

    expect(probe.reading()).toEqual({ reports: 1, maxGapMs: 0, sinceMs: 100 });
  });
});
