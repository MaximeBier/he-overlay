import { describe, it, expect } from 'vitest';
import { readOverlayParams } from './params';

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

  it('accepts a missing password: the server may not ask for one', () => {
    expect(readOverlayParams('?port=4455').password).toBe('');
  });

  it('decodes a password containing reserved characters', () => {
    expect(readOverlayParams('?password=a%26b%3Dc').password).toBe('a&b=c');
  });
});
