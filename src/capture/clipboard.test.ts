import { describe, it, expect, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copying, and knowing whether it worked', () => {
  it('reports success when the text really left', async () => {
    const writeText = vi.fn(() => Promise.resolve());

    expect(await copyToClipboard({ clipboard: { writeText } }, 'hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('reports failure when there is no clipboard at all', async () => {
    // `navigator.clipboard` is undefined outside a secure context — which is
    // exactly the LAN host `http://<ip>:8080` that the deployment documents.
    // Optional chaining made the call evaluate to `undefined`, the `await`
    // resolved, and the button said "Copied" over an empty clipboard.
    expect(await copyToClipboard({}, 'hello')).toBe(false);
  });

  it('reports failure when the browser refuses', async () => {
    // A document that is not focused, or a permission denied. The promise
    // rejects, and an unhandled rejection is a lie plus a console error.
    const writeText = vi.fn(() => Promise.reject(new Error('not focused')));

    expect(await copyToClipboard({ clipboard: { writeText } }, 'hello')).toBe(false);
  });

  it('never throws, whatever the host does', async () => {
    const writeText = vi.fn(() => {
      throw new TypeError('gone');
    });

    await expect(copyToClipboard({ clipboard: { writeText } }, 'hello')).resolves.toBe(false);
  });
});
