import { describe, it, expect } from 'vitest';
import { readOverlayParams, DEFAULT_OBS_PORT } from './params';

describe('readOverlayParams', () => {
  it('reads the port and the password from the URL', () => {
    expect(readOverlayParams('?port=4456&password=hunter2')).toEqual({
      port: 4456,
      password: 'hunter2',
    });
  });

  it('falls back to the default obs-websocket port', () => {
    expect(readOverlayParams('').port).toBe(4455);
    expect(readOverlayParams('?port=nope').port).toBe(4455);
  });

  it('rejects a port outside the 1..65535 range', () => {
    // `new WebSocket('ws://localhost:99999')` throws, and the throw happens
    // during component setup: the overlay would not mount at all, leaving a
    // blank browser source and no diagnostic whatsoever.
    expect(readOverlayParams('?port=99999').port).toBe(DEFAULT_OBS_PORT);
    expect(readOverlayParams('?port=0').port).toBe(DEFAULT_OBS_PORT);
    expect(readOverlayParams('?port=-1').port).toBe(DEFAULT_OBS_PORT);
    expect(readOverlayParams('?port=').port).toBe(DEFAULT_OBS_PORT);
  });

  it('accepts a missing password: the server may not ask for one', () => {
    expect(readOverlayParams('?port=4455').password).toBe('');
  });

  it('decodes a password containing reserved characters', () => {
    expect(readOverlayParams('?password=a%26b%3Dc').password).toBe('a&b=c');
  });
});
