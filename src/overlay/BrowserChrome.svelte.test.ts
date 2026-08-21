import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Host from './BrowserChrome.harness.svelte';

afterEach(cleanup);

const chrome = (props: Record<string, unknown> = {}) =>
  render(Host, { props: { decorated: true, connected: true, rate: 58, ...props } });

describe('what OBS gets', () => {
  it('adds nothing whatsoever when the page is not in a browser', () => {
    // The one defect that must never happen (spec §16.7). Not "hidden", not
    // "transparent": absent, so that a stray stylesheet or a mistaken
    // `visibility` cannot bring it back on air.
    const { container } = chrome({ decorated: false });

    expect(container.querySelector('[data-chrome]')).toBeNull();
    expect(container.textContent).toBe('the keys');
  });

  it('still renders what it wraps', () => {
    expect(chrome({ decorated: false }).container.textContent).toContain('the keys');
    expect(chrome().container.textContent).toContain('the keys');
  });
});

describe('what a person gets', () => {
  it('names the page, so a correct URL stops looking like a broken one', () => {
    // Today a working URL and a wrong one both render a black empty page.
    // This line is the whole reason the decoration exists.
    const { container } = chrome();

    expect(container.querySelector('[data-chrome]')!.textContent).toContain('overlay.html');
  });

  it('says whether frames are actually arriving, and how fast', () => {
    const { container } = chrome();
    const pill = container.querySelector('[data-link]')!;

    expect(pill.textContent).toContain('58');
    expect(pill.getAttribute('data-connected')).toBe('true');
  });

  it('says when nothing is coming through', () => {
    const { container } = chrome({ connected: false, rate: 0 });

    expect(container.querySelector('[data-link]')!.getAttribute('data-connected')).toBe('false');
  });

  it('warns that none of this reaches the stream', () => {
    // Someone seeing a grid and a frame around their keys will otherwise
    // wonder why their overlay has a border on it.
    expect(chrome().container.textContent).toMatch(/browser[- ]only|transparen/i);
  });
});
