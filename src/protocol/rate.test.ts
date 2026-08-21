import { describe, it, expect } from 'vitest';
import { createRateCounter, RATE_WINDOW_MS } from './rate';

describe('counting what happened in the last second', () => {
  it('counts nothing before anything has', () => {
    expect(createRateCounter().read(0)).toBe(0);
  });

  it('counts every tick still inside the window', () => {
    const counter = createRateCounter();
    for (const at of [0, 100, 200, 300]) counter.tick(at);

    expect(counter.read(400)).toBe(4);
  });

  it('slides rather than tumbling', () => {
    // A window that resets on a boundary splits a burst in two and understates
    // the peak. Sliding, the answer is the same wherever it is asked from.
    const counter = createRateCounter();
    for (let at = 0; at < 2000; at += 100) counter.tick(at);

    expect(counter.read(1050)).toBe(10);
    expect(counter.read(1450)).toBe(10);
  });

  it('drops what has aged out, exactly at the edge', () => {
    const counter = createRateCounter();
    counter.tick(0);
    counter.tick(500);

    expect(counter.read(999)).toBe(2);
    expect(counter.read(1000)).toBe(1);
  });

  it('falls back to zero when nothing arrives any more', () => {
    // The reason `read` takes the clock instead of being a getter. A counter
    // that only ages on new events freezes at its last value the moment the
    // stream stops — a rate of 58/s printed beside a dead link.
    const counter = createRateCounter();
    counter.tick(0);

    expect(counter.read(5_000)).toBe(0);
  });

  it('reads as a figure per second, whatever the window', () => {
    expect(RATE_WINDOW_MS).toBe(1000);
  });

  it('does not grow without end while nobody reads it', () => {
    // Both callers are on a hot path — a keyboard report, an incoming frame —
    // and the overlay can go a whole stream without anyone opening the page
    // that displays the figure.
    const counter = createRateCounter();
    for (let at = 0; at < 100_000; at += 1) counter.tick(at);

    expect(counter.size).toBeLessThanOrEqual(RATE_WINDOW_MS + 1);
  });
});
