import { describe, it, expect } from 'vitest';
import { newOverlayId } from './identity';

describe('newOverlayId', () => {
  it('uses randomUUID when the browser offers one', () => {
    const id = newOverlayId({ randomUUID: () => 'uuid-from-the-browser' });

    expect(id).toBe('uuid-from-the-browser');
  });

  // `crypto.randomUUID` only exists in a secure context. An overlay served from
  // http://<lan-ip>:8080 — the fallback documented in docs/deploy.md — has none,
  // and a bare call would throw during setup: not a missing count, a blank
  // overlay for the whole stream.
  it('still produces an id outside a secure context', () => {
    expect(newOverlayId(undefined)).toMatch(/\S/);
    expect(newOverlayId({})).toMatch(/\S/);
  });

  it('produces a different id every time, fallback included', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newOverlayId({})));

    expect(ids.size).toBe(100);
  });
});
