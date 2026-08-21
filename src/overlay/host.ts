/** What the decision needs from `window`, and nothing more. */
export interface HostWindow {
  /** Injected by the browser source of OBS. Presence is the signal, not shape. */
  obsstudio?: unknown;
  navigator: { userAgent: string };
}

/** OBS appends its own product token; `\b` keeps "Mobsafari" out of it. */
const OBS_AGENT = /\bOBS\b/i;

/**
 * Whether a person is looking at this page in an ordinary browser (spec §16.7).
 *
 * There is exactly one defect worth preventing here, and it is spectacular:
 * the diagnostic decoration going out on air. Two independent signals guard
 * it, and either one alone is enough to keep the page bare:
 *
 * - `window.obsstudio` present: OBS said so itself. This is the documented
 *   signal, injected into every browser source.
 * - the user agent names OBS: kept in case the injected object ever goes away
 *   without notice — it appears in no changelog, including OBS 32.2's.
 *
 * **A third rule was tried and withdrawn on 2026-08-21.** It compared
 * `outerHeight` against `innerHeight`, on the reasoning that a browser puts an
 * address bar above the page and a browser source does not, and it was meant
 * as *positive* proof: decorate only when certain, so that an embedding nobody
 * had foreseen came out bare rather than decorated by default.
 *
 * The reasoning was sound. The measurement was not: the two figures are not in
 * the same unit. `innerHeight` counts CSS pixels, which **page zoom** resizes;
 * `outerHeight` measures the window, which it does not. At 90 % zoom on a
 * maximised window the inner height overtakes the outer one and the difference
 * goes negative — found in the field at 1440p, and zoom is a per-site setting
 * people set once and forget. Anyone who had ever pressed Ctrl+minus on this
 * page would never have seen the decoration again.
 *
 * The lesson is worth more than the rule: **a measurement is not proof unless
 * the platform promises what it measures.** What remains is "bare unless OBS
 * can be ruled out" — weaker in principle, correct in practice, since this
 * page has exactly two hosts and one of them announces itself twice.
 */
export function isOrdinaryBrowser(host: HostWindow): boolean {
  if (host.obsstudio !== undefined) return false;
  return !OBS_AGENT.test(host.navigator.userAgent);
}
