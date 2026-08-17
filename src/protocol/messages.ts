export const PROTOCOL_VERSION = 1;

/** [matrix index, travel 0..1023, actuation]. `active` is always transmitted. */
export type FrameKey = readonly [id: number, travel: number, active: 0 | 1];

export type HelloMessage = { v: typeof PROTOCOL_VERSION; t: 'hello' };
export type BeatMessage = { v: typeof PROTOCOL_VERSION; t: 'beat' };
export type ConfigMessage = { v: typeof PROTOCOL_VERSION; t: 'config'; config: unknown };
export type FrameMessage = { v: typeof PROTOCOL_VERSION; t: 'frame'; k: FrameKey[] };

export type OverlayMessage = HelloMessage | BeatMessage | ConfigMessage | FrameMessage;

const KNOWN_TYPES = ['hello', 'beat', 'config', 'frame'] as const;

export function envelope(message: OverlayMessage): { heOverlay: OverlayMessage } {
  return { heOverlay: message };
}

/**
 * Returns the message when it matches our version, `null` otherwise. Each page
 * then silently ignores the types that do not concern it (spec §6).
 */
export function parseMessage(payload: unknown): OverlayMessage | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const inner = (payload as { heOverlay?: unknown }).heOverlay;
  if (typeof inner !== 'object' || inner === null) return null;

  const { v, t } = inner as { v?: unknown; t?: unknown };
  if (v !== PROTOCOL_VERSION) return null;
  if (typeof t !== 'string' || !KNOWN_TYPES.includes(t as (typeof KNOWN_TYPES)[number])) return null;

  return inner as OverlayMessage;
}
