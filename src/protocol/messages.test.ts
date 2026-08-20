import { describe, it, expect } from 'vitest';
import { envelope, foreignVersion, parseMessage, PROTOCOL_VERSION } from './messages';

describe('protocol envelope', () => {
  it('wraps a message under the heOverlay key', () => {
    expect(envelope({ v: PROTOCOL_VERSION, t: 'hello', id: 'test' })).toEqual({
      heOverlay: { v: 1, t: 'hello', id: 'test' },
    });
  });

  it('reads back a wrapped message', () => {
    const parsed = parseMessage({ heOverlay: { v: 1, t: 'frame', k: [[174, 996, 1]] } });

    expect(parsed).toEqual({ v: 1, t: 'frame', k: [[174, 996, 1]] });
  });

  it('ignores an unknown protocol version', () => {
    expect(parseMessage({ heOverlay: { v: 2, t: 'hello', id: 'a' } })).toBeNull();
  });

  it('ignores an unknown message type', () => {
    expect(parseMessage({ heOverlay: { v: 1, t: 'yolo' } })).toBeNull();
  });

  it('carries the overlay id in hello, beat and bye', () => {
    for (const t of ['hello', 'beat', 'bye'] as const) {
      expect(parseMessage({ heOverlay: { v: 1, t, id: 'abc' } })).toEqual({ v: 1, t, id: 'abc' });
    }
  });

  // Without this the capture page would register an overlay keyed `undefined`:
  // one phantom listener, counted forever, and never expiring in step with any
  // real one. The status bar would then claim someone is watching.
  it('rejects an overlay message with no usable id', () => {
    expect(parseMessage({ heOverlay: { v: 1, t: 'beat' } })).toBeNull();
    expect(parseMessage({ heOverlay: { v: 1, t: 'hello', id: 42 } })).toBeNull();
    expect(parseMessage({ heOverlay: { v: 1, t: 'hello', id: '' } })).toBeNull();
    // A bye is the one that removes a listener, so an unchecked id here would
    // let anyone on the same obs-websocket blank the count.
    expect(parseMessage({ heOverlay: { v: 1, t: 'bye' } })).toBeNull();
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

describe('a frame is numbers the renderer will divide by', () => {
  // Shape was hardened in milestone 1, finiteness was not. NaN survives the
  // scene's clamp — Math.min(1, Math.max(0, NaN)) is NaN — and reaches the SVG
  // as height="NaN".
  it('rejects a travel that is not a finite number', () => {
    expect(parseMessage({ heOverlay: { v: 1, t: 'frame', k: [[1, Number.NaN, 0]] } })).toBeNull();
    expect(
      parseMessage({ heOverlay: { v: 1, t: 'frame', k: [[1, Number.POSITIVE_INFINITY, 0]] } }),
    ).toBeNull();
  });

  it('rejects an identifier that is not a finite number', () => {
    expect(parseMessage({ heOverlay: { v: 1, t: 'frame', k: [[Number.NaN, 10, 0]] } })).toBeNull();
  });
});

describe('naming a version we cannot read', () => {
  it('returns the version of a message plainly meant for us', () => {
    expect(foreignVersion({ heOverlay: { v: 7, t: 'hello' } })).toBe(7);
  });

  it('says nothing about a message at our own version', () => {
    expect(foreignVersion({ heOverlay: { v: PROTOCOL_VERSION, t: 'hello', id: 'a' } })).toBeNull();
  });

  it('says nothing about another application entirely', () => {
    // OBS carries everyone's custom events. Reporting "an overlay is on
    // protocol v3" because some other tool broadcast its own envelope would
    // send someone reloading a page that was never ours.
    expect(foreignVersion({ someOtherApp: { v: 3 } })).toBeNull();
    expect(foreignVersion({ heOverlay: 'not an object' })).toBeNull();
    expect(foreignVersion(null)).toBeNull();
    expect(foreignVersion(42)).toBeNull();
  });

  it('says nothing when the envelope carries no version at all', () => {
    expect(foreignVersion({ heOverlay: { t: 'hello' } })).toBeNull();
    expect(foreignVersion({ heOverlay: { v: 'one', t: 'hello' } })).toBeNull();
  });

  it('reports a version older than ours as readily as a newer one', () => {
    // An overlay left open across a deployment is the common case, and it is
    // behind, not ahead. Only answering for the future would miss it.
    expect(foreignVersion({ heOverlay: { v: 0, t: 'hello' } })).toBe(0);
  });
});
