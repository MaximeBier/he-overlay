import { describe, it, expect } from 'vitest';
import { envelope, parseMessage, PROTOCOL_VERSION } from './messages';

describe('protocol envelope', () => {
  it('wraps a message under the heOverlay key', () => {
    expect(envelope({ v: PROTOCOL_VERSION, t: 'hello' })).toEqual({
      heOverlay: { v: 1, t: 'hello' },
    });
  });

  it('reads back a wrapped message', () => {
    const parsed = parseMessage({ heOverlay: { v: 1, t: 'frame', k: [[174, 996, 1]] } });

    expect(parsed).toEqual({ v: 1, t: 'frame', k: [[174, 996, 1]] });
  });

  it('ignores an unknown protocol version', () => {
    expect(parseMessage({ heOverlay: { v: 2, t: 'hello' } })).toBeNull();
  });

  it('ignores an unknown message type', () => {
    expect(parseMessage({ heOverlay: { v: 1, t: 'yolo' } })).toBeNull();
  });

  // Any obs-websocket client can emit a CustomEvent, so this is a trust
  // boundary, not our own input. A frame without `k` would set the overlay's
  // key list to undefined, and the very next render would throw — killing the
  // overlay for the rest of the stream.
  it('rejects a malformed frame instead of trusting its shape', () => {
    expect(parseMessage({ heOverlay: { v: 1, t: 'frame' } })).toBeNull();
    expect(parseMessage({ heOverlay: { v: 1, t: 'frame', k: 'nope' } })).toBeNull();
    expect(parseMessage({ heOverlay: { v: 1, t: 'frame', k: [[174, 996]] } })).toBeNull();
    expect(parseMessage({ heOverlay: { v: 1, t: 'frame', k: [[174, 996, 7]] } })).toBeNull();
    expect(parseMessage({ heOverlay: { v: 1, t: 'frame', k: [['a', 996, 1]] } })).toBeNull();
  });

  it('accepts an empty frame: every key released is a legitimate frame', () => {
    expect(parseMessage({ heOverlay: { v: 1, t: 'frame', k: [] } })).toEqual({
      v: 1,
      t: 'frame',
      k: [],
    });
  });

  it('rejects a config message that carries no object', () => {
    expect(parseMessage({ heOverlay: { v: 1, t: 'config' } })).toBeNull();
    expect(parseMessage({ heOverlay: { v: 1, t: 'config', config: 'nope' } })).toBeNull();
  });

  it('ignores a foreign payload', () => {
    expect(parseMessage({ someOtherApp: { hello: true } })).toBeNull();
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage('hello')).toBeNull();
  });
});
