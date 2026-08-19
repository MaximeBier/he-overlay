import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { computeAuth } from './auth';

/** Independent oracle, written against a different API than the implementation. */
function reference(password: string, salt: string, challenge: string): string {
  const secret = createHash('sha256')
    .update(password + salt)
    .digest('base64');
  return createHash('sha256')
    .update(secret + challenge)
    .digest('base64');
}

describe('computeAuth', () => {
  it('matches the reference implementation', async () => {
    await expect(computeAuth('hunter2', 'saltysalt', 'chchch')).resolves.toBe(
      reference('hunter2', 'saltysalt', 'chchch'),
    );
  });

  it('handles non-ASCII characters in the password', async () => {
    // Accented fixtures on purpose: UTF-8 must be hashed byte for byte, and a
    // latin-1 encoding somewhere in the chain would only show up here.
    await expect(computeAuth('päss-wörd-é', 'sält', 'challengé')).resolves.toBe(
      reference('päss-wörd-é', 'sält', 'challengé'),
    );
  });

  it('produces a 44-character base64 digest', async () => {
    await expect(computeAuth('a', 'b', 'c')).resolves.toHaveLength(44);
  });

  it('changes as soon as the challenge changes', async () => {
    const first = await computeAuth('p', 's', 'c1');
    const second = await computeAuth('p', 's', 'c2');

    expect(first).not.toBe(second);
  });
});
