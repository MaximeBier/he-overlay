import { describe, it, expect } from 'vitest';
import { isOrdinaryBrowser } from './host';

/** A window with the address bar a browser puts above the page. */
const browser = (over: Record<string, unknown> = {}) => ({
  innerHeight: 900,
  outerHeight: 1000,
  navigator: { userAgent: 'Mozilla/5.0 Chrome/128.0 Safari/537.36' },
  ...over,
});

describe('deciding whether anyone can see this page', () => {
  it('says yes for a browser window with chrome above the page', () => {
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

  it('says no to a window with no chrome at all, whatever it claims to be', () => {
    // The positive half of the rule (spec §16.7). An OBS browser source has no
    // address bar, so its outer and inner heights are equal — and so does any
    // other embedding we have never seen. Refusing them costs a bare page to
    // someone who pressed F11; accepting them risks the one defect that must
    // never happen.
    expect(isOrdinaryBrowser(browser({ outerHeight: 900 }))).toBe(false);
  });

  it('treats an obsstudio that is present but empty as OBS', () => {
    // Presence is the signal, not shape. A host that defines the property at
    // all is claiming to be OBS, and believing it errs on the safe side.
    expect(isOrdinaryBrowser(browser({ obsstudio: null }))).toBe(false);
  });
});
