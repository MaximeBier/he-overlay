import { describe, it, expect } from 'vitest';
import { isOrdinaryBrowser } from './host';

const browser = (over: Record<string, unknown> = {}) => ({
  navigator: { userAgent: 'Mozilla/5.0 Chrome/128.0 Safari/537.36' },
  ...over,
});

describe('deciding whether anyone can see this page', () => {
  it('says yes for an ordinary browser', () => {
    expect(isOrdinaryBrowser(browser())).toBe(true);
  });

  it('says no the moment OBS announces itself', () => {
    // The object OBS injects. Nothing else on the page matters after this.
    expect(isOrdinaryBrowser(browser({ obsstudio: { pluginVersion: '2.18.2' } }))).toBe(false);
  });

  it('says no on the OBS user agent alone, in case the object ever goes', () => {
    // Two independent signals, because there is exactly one failure worth
    // preventing here and it is spectacular: decoration going out on air. If
    // OBS ever stops injecting `obsstudio`, this still catches it.
    expect(
      isOrdinaryBrowser(
        browser({ navigator: { userAgent: 'Mozilla/5.0 Chrome/128.0 Safari/537.36 OBS/30.0.2' } }),
      ),
    ).toBe(false);
  });

  it('is not fooled by "obs" inside another word', () => {
    expect(
      isOrdinaryBrowser(browser({ navigator: { userAgent: 'Mozilla/5.0 Mobsafari/1.0' } })),
    ).toBe(true);
  });

  it('treats an obsstudio that is present but empty as OBS', () => {
    // Presence is the signal, not shape. A host that defines the property at
    // all is claiming to be OBS, and believing it errs on the safe side.
    expect(isOrdinaryBrowser(browser({ obsstudio: null }))).toBe(false);
  });

  it('does not measure the window, whatever the display scaling says', () => {
    // The rule this replaces compared `outerHeight` against `innerHeight`,
    // reasoning that a browser puts an address bar above the page and a
    // browser source does not. Measured on Chrome / Windows 11 at 1440p on
    // 2026-08-21 at 90 % page zoom: the outer height comes out the smaller of
    // the two, because zoom resizes the CSS pixel `innerHeight` counts and
    // leaves `outerHeight` alone. The platform promises no relation.
    //
    // Zoom is a per-site setting people set once and forget, so this made the
    // failure routine rather than rare. Neither remaining signal reads a size.

    // Bound to a name first: passed as literals, the compiler rejects the two
    // properties outright — which is itself the point. They are gone from
    // `HostWindow`, so nothing can read them again by accident.
    const zoomedOut = { ...browser(), innerHeight: 1000, outerHeight: 900 };
    const plain = { ...browser(), innerHeight: 900, outerHeight: 1000 };

    expect(isOrdinaryBrowser(zoomedOut)).toBe(true);
    expect(isOrdinaryBrowser(plain)).toBe(true);
  });
});
