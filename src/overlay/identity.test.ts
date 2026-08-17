import { describe, it, expect } from 'vitest';
import { newOverlayId } from './identity';

/** Stands in for a context that has `crypto` but no `randomUUID` on it. */
const insecureContext = {};

describe('newOverlayId', () => {
  it('uses randomUUID when the browser offers one', () => {
    const id = newOverlayId({ randomUUID: () => 'uuid-from-the-browser' });

    expect(id).toBe('uuid-from-the-browser');
  });

  it('reaches for the global crypto by default', () => {
    // Node's global crypto has randomUUID, so this exercises the normal path —
    // not the fallback, whatever the absence of an argument might suggest.
    expect(newOverlayId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  // `crypto.randomUUID` only exists in a secure context. An overlay served from
  // http://<lan-ip>:8080 — the fallback documented in docs/deploy.md — has none,
  // and a bare call would throw during setup: not a missing count, a blank
  // overlay for the whole stream.
  it('still produces an id outside a secure context', () => {
    expect(newOverlayId(insecureContext)).toMatch(/^overlay-\S+/);
  });

  it('produces a different id every time, fallback included', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newOverlayId(insecureContext)));

    expect(ids.size).toBe(100);
  });

  // The counter cannot carry this: it is module state, so two OBS browser
  // sources are two contexts that both start at zero. Only the random draws and
  // timeOrigin separate them, and this test is the one that would notice if the
  // random part were ever dropped for the counter.
  it('does not lean on the counter to tell two contexts apart', () => {
    const random = Array.from({ length: 200 }, () => newOverlayId(insecureContext)).map((id) =>
      id.split('-').slice(3).join('-'),
    );

    expect(new Set(random).size).toBe(200);
  });

  it('never comes up short on the random part', () => {
    // `Math.random().toString(36)` returns fewer characters than expected often
    // enough to matter — `0.5` is `"0.i"`.
    for (let i = 0; i < 500; i++) {
      expect(newOverlayId(insecureContext).split('-').slice(3).join('-')).toHaveLength(16);
    }
  });
});
