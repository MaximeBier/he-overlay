import type { HidLike } from './device';

/**
 * WebHID is missing from the DOM type library. Rather than pulling in a
 * third-party @types package, we declare the one property we touch, typed with
 * our own structural interface — the real API is a superset of it.
 *
 * Optional on purpose: `navigator.hid` is undefined outside Chromium, and
 * that absence is a state the product handles (spec §2.1).
 */
declare global {
  interface Navigator {
    readonly hid?: HidLike;
  }
}

export {};
