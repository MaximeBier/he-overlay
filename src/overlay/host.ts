/** What the decision needs from `window`, and nothing more. */
export interface HostWindow {
  /** Injected by the browser source of OBS. Presence is the signal, not shape. */
  obsstudio?: unknown;
  innerHeight: number;
  outerHeight: number;
  navigator: { userAgent: string };
}

/** OBS appends its own product token; `\b` keeps "Mobsafari" out of it. */
const OBS_AGENT = /\bOBS\b/i;

/**
 * Whether a person is looking at this page in an ordinary browser (spec §16.7).
 *
 * There is exactly one defect worth preventing here, and it is spectacular:
 * the diagnostic decoration going out on air. So the rule is written to fail
 * *closed* — undecorated — and the answer is only yes on positive proof.
 *
 * Two negatives and one positive:
 *
 * - `window.obsstudio` present: OBS said so itself.
 * - the user agent names OBS: a second, independent signal, kept in case the
 *   injected object ever goes away.
 * - the window is taller outside than in: a browser puts an address bar above
 *   the page, and a browser source does not. This is the positive half — it
 *   is what makes an embedding we have never seen come out undecorated rather
 *   than decorated by default.
 *
 * Measured on Chrome / Windows 11, 2026-08-21: windowed, the difference is
 * +121; in F11 fullscreen it is -16, so the rule really is false there. The
 * defect that produces is narrow, because `main.ts` decides once before the
 * first render: pressing F11 later re-evaluates nothing and the decoration
 * stays. Only a page *loaded* while already fullscreen comes out bare.
 *
 * That is the price. The price of dropping the rule is a page that decorates
 * itself in any embedding we failed to recognise, which is not a trade worth
 * making.
 */
export function isOrdinaryBrowser(host: HostWindow): boolean {
  if (host.obsstudio !== undefined) return false;
  if (OBS_AGENT.test(host.navigator.userAgent)) return false;
  return host.outerHeight > host.innerHeight;
}
