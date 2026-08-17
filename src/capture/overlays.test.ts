import { describe, it, expect } from 'vitest';
import { createOverlayRegistry, OVERLAY_TIMEOUT_MS } from './overlays';

describe('createOverlayRegistry', () => {
  it('counts an overlay that just reported in', () => {
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);

    expect(registry.count(1000)).toBe(1);
  });

  it('counts two distinct overlays', () => {
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);
    registry.seen('b', 1000);

    expect(registry.count(1000)).toBe(2);
  });

  it('does not count the same overlay twice', () => {
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);
    registry.seen('a', 2000);

    expect(registry.count(2000)).toBe(1);
  });

  // Expiry is computed on read: no timer on the capture side, where it would
  // be throttled to one tick per minute in the background (spec §2.2).
  it('forgets an overlay that has been silent for too long', () => {
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);

    expect(registry.count(1000 + OVERLAY_TIMEOUT_MS + 1)).toBe(0);
  });

  it('keeps the overlays that are still beating when one expires', () => {
    // Deleting while iterating is the obvious way to write this, and the one
    // place it could silently skip the entry that follows.
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);
    registry.seen('b', 1000);
    registry.seen('c', 1000);
    registry.seen('b', 9000);
    registry.seen('c', 9000);

    expect(registry.count(9000)).toBe(2);
  });

  it('picks up an overlay that starts beating again', () => {
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);
    registry.count(1000 + OVERLAY_TIMEOUT_MS + 1);
    registry.seen('a', 20000);

    expect(registry.count(20000)).toBe(1);
  });

  it('reports none before anything has reported in', () => {
    expect(createOverlayRegistry().count(0)).toBe(0);
  });
});

describe('createOverlayRegistry — announced departures', () => {
  // Without this, reloading a browser source counts twice: the reloaded page
  // draws a fresh id while the old one sits out its six seconds. Ten reloads in
  // a row — which is what setting up an overlay looks like — read as eleven
  // listeners, and the count is at its most wrong exactly while it is watched.
  it('drops an overlay that said goodbye, without waiting for it to expire', () => {
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);

    registry.forget('a');

    expect(registry.count(1000)).toBe(0);
  });

  it('leaves the other overlays alone', () => {
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);
    registry.seen('b', 1000);

    registry.forget('a');

    expect(registry.count(1000)).toBe(1);
  });

  it('ignores a goodbye from an overlay it never saw', () => {
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);

    expect(() => registry.forget('never-seen')).not.toThrow();
    expect(registry.count(1000)).toBe(1);
  });

  it('counts an overlay that comes back after saying goodbye', () => {
    // A reload is a goodbye followed by a hello under a new name. Nothing must
    // make the registry refuse an id it has already buried.
    const registry = createOverlayRegistry();
    registry.seen('a', 1000);
    registry.forget('a');
    registry.seen('a', 2000);

    expect(registry.count(2000)).toBe(1);
  });
});
