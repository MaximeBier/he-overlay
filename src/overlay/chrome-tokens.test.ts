import { describe, it, expect } from 'vitest';
import { applyChromeTokens, CHROME_TOKENS } from './chrome-tokens';
import { cssVariables } from '../styles/ui-tokens';

describe('the copy that is not allowed to drift', () => {
  it('matches the settings palette, entry for entry', () => {
    // The reason this file may duplicate `UI_TOKENS` at all. Importing that
    // module into the overlay drags the whole palette into the bundle OBS
    // keeps loaded, and `check-bundle.sh` fails the build over it — so the
    // copy stays, and this test is what makes it safe.
    const ui = cssVariables();

    for (const [name, value] of Object.entries(CHROME_TOKENS)) {
      expect(ui[name], `${name} has drifted from UI_TOKENS`).toBe(value);
    }
  });

  it('copies only what the decoration uses', () => {
    // Not a mirror of the palette: a growing copy is a copy nobody prunes,
    // and every entry here is weight on the page that must stay small.
    expect(Object.keys(CHROME_TOKENS).length).toBeLessThan(12);
  });
});

describe('declaring them', () => {
  it('sets every entry as a CSS variable', () => {
    const set: [string, string][] = [];
    applyChromeTokens({ style: { setProperty: (n, v) => void set.push([n, v]) } });

    expect(set).toEqual(Object.entries(CHROME_TOKENS));
  });
});
