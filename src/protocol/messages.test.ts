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

  it('ignores a foreign payload', () => {
    expect(parseMessage({ someOtherApp: { hello: true } })).toBeNull();
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage('hello')).toBeNull();
  });
});
