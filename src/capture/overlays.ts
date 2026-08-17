/** Three missed beats: the overlay beats every 2 s. */
export const OVERLAY_TIMEOUT_MS = 6000;

export interface OverlayRegistry {
  seen(id: string, now: number): void;
  /**
   * Drops an overlay that announced it was leaving, rather than waiting out
   * its timeout. A reload draws a new id, so an overlay that leaves silently
   * is still counted alongside the page that replaced it — and ten reloads in
   * a row, which is what setting an overlay up looks like, read as eleven
   * listeners.
   */
  forget(id: string): void;
  /** Number of live overlays, computed lazily on read. */
  count(now: number): number;
}

/**
 * Who is listening, worked out from the heartbeats.
 *
 * BroadcastCustomEvent never says whether anyone is on the other end: a capture
 * page talking to nobody looks exactly like one feeding four scenes. This is
 * the only thing that tells them apart (spec §11).
 */
export function createOverlayRegistry(timeoutMs: number = OVERLAY_TIMEOUT_MS): OverlayRegistry {
  const lastSeen = new Map<string, number>();

  return {
    seen(id, now) {
      lastSeen.set(id, now);
    },
    forget(id) {
      lastSeen.delete(id);
    },
    count(now) {
      let live = 0;
      for (const [id, at] of lastSeen) {
        if (now - at > timeoutMs) lastSeen.delete(id);
        else live++;
      }
      return live;
    },
  };
}
