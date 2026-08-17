import { describe, it, expect } from 'vitest';
import { readOverlayParams, DEFAULT_OBS_PORT } from './params';

describe('readOverlayParams', () => {
  // A fragment is never sent to the server — a property of HTTP itself, not a
  // setting. It is the only place the OBS password can travel without ending up
  // in our own access log, now that we host the page (spec §5.5, §10).
  it('reads the password from the fragment', () => {
    expect(readOverlayParams('', '#port=4456&password=hunter2')).toEqual({
      port: 4456,
      password: 'hunter2',
    });
  });

  it('strips the leading hash', () => {
    expect(readOverlayParams('', '#password=hunter2').password).toBe('hunter2');
    expect(readOverlayParams('', 'password=hunter2').password).toBe('hunter2');
  });

  // The port is not a secret, and seeing it in the logs helps diagnose. The
  // password is another matter: reading it from the query string would keep
  // alive the very path that leaks it to whoever hosts the page.
  it('reads the port from either place, the fragment winning', () => {
    expect(readOverlayParams('?port=4456', '').port).toBe(4456);
    expect(readOverlayParams('', '#port=4456').port).toBe(4456);
    expect(readOverlayParams('?port=1111', '#port=4456').port).toBe(4456);
  });

  it('refuses to read a password from the query string', () => {
    expect(readOverlayParams('?password=hunter2', '').password).toBe('');
    expect(readOverlayParams('?port=4456&password=hunter2', '')).toEqual({
      port: 4456,
      password: '',
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
    expect(readOverlayParams('', '#password=a%26b%3Dc').password).toBe('a&b=c');
  });
});
