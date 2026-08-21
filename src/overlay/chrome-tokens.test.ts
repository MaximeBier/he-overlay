import { describe, it, expect } from 'vitest';
import { applyChromeTokens, CHROME_TOKENS } from './chrome-tokens';
import { cssVariables } from '../styles/ui-tokens';
// Vite hands the file over as a string; `import.meta.url` is not a file URL
// under the test transform, so reading it from disk is not an option.
import chromeSource from './BrowserChrome.svelte?raw';

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

describe('every variable the decoration uses is declared', () => {
  it('finds no `--he-*` in BrowserChrome that CHROME_TOKENS does not carry', () => {
    // The half that matters, and the half the value check misses. The
    // decoration is the one component that writes `var(--he-x)` **without a
    // fallback** — every capture component passes one — precisely because
    // `main.ts` is supposed to declare the nine. Adding `var(--he-accent)` to
    // it compiles, ships, and renders an undefined property with nothing
    // failing anywhere.
    const used = [...new Set(chromeSource.match(/--he-[a-z-]+/g) ?? [])];

    expect(used.filter((name) => !(name in CHROME_TOKENS))).toEqual([]);
  });

  it('really did read a component that uses them', () => {
    // Guards the guard: a source that failed to load, or a regex that matched
    // nothing, would make the assertion above pass for ever.
    expect(chromeSource.match(/--he-[a-z-]+/g)?.length ?? 0).toBeGreaterThan(5);
  });
});
