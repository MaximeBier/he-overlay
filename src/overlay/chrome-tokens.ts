/**
 * The nine colours the browser-only decoration needs (spec §16.7).
 *
 * **Copied from `UI_TOKENS`, on purpose, and pinned by a test.** Importing
 * that module here would drag the whole settings palette into the bundle OBS
 * keeps loaded, which `check-bundle.sh` refuses outright — the separation is a
 * guarded boundary, not a preference (spec §5.1).
 *
 * Duplication is only acceptable because `chrome-tokens.test.ts` asserts every
 * entry equals its counterpart. Change one side and the suite says so; there
 * is no version of this that silently drifts.
 *
 * Keyed by the CSS variable name rather than by a camelCase property, so that
 * the naming rule of `ui-tokens.ts` does not have to be copied as well.
 */
export const CHROME_TOKENS: Readonly<Record<string, string>> = {
  '--he-bg': '#0E1015',
  '--he-stage': '#0B0D11',
  '--he-border': '#1B1E27',
  '--he-border-control': '#232838',
  '--he-ok': '#4CAF7D',
  '--he-danger': '#E06C5B',
  '--he-text': '#DDE1E9',
  '--he-text-muted': '#8B90A0',
  '--he-text-faint': '#5A5F70',
};

/**
 * Declares them on the page — and is called only for a browser.
 *
 * In OBS nothing here ever runs, so the on-air page carries these nine strings
 * as data and not one applied rule. That is also a second lock on the defect
 * that matters: even if the decoration rendered by mistake, no variable would
 * be defined to paint it with.
 */
export function applyChromeTokens(root: {
  style: { setProperty(name: string, value: string): void };
}): void {
  for (const [name, value] of Object.entries(CHROME_TOKENS)) {
    root.style.setProperty(name, value);
  }
}
