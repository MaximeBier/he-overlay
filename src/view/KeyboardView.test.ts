import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import KeyboardView from './KeyboardView.svelte';
import { OVERLAY_TOKENS } from '../styles/tokens';
import { DEFAULT_STYLE, type ResolvedConfig } from '../config/schema';

afterEach(cleanup);

const config: ResolvedConfig = {
  version: 1,
  unit: 100,
  gap: 10,
  keys: [
    {
      id: 174,
      usage: 0x50,
      mode: 'key',
      label: 'Q',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      style: {
        restColor: '#111111',
        borderColor: '#232838',
        activeColor: '#00ff00',
        fillColor: '#ffffff',
        fillDirection: 'up',
        opacity: 1,
        radius: 4,
        fontFamily: DEFAULT_STYLE.fontFamily,
        fontWeight: DEFAULT_STYLE.fontWeight,
      },
    },
  ],
};

const axisConfig: ResolvedConfig = {
  ...config,
  keys: [{ ...config.keys[0]!, mode: 'axis' }],
};

describe('KeyboardView', () => {
  it('draws a released key with the rest color', () => {
    const { container } = render(KeyboardView, { props: { config, frame: [] } });

    const rects = container.querySelectorAll('rect');
    expect(rects[0]?.getAttribute('fill')).toBe('#111111');
  });

  it('draws an active key with the active color and its label', () => {
    const { container, getByText } = render(KeyboardView, {
      props: { config, frame: [[174, 1023, 1] as const] },
    });

    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#00ff00');
    expect(getByText('Q')).toBeTruthy();
  });

  it('never displays the raw value', () => {
    const { queryByText } = render(KeyboardView, {
      props: { config, frame: [[174, 1023, 1] as const] },
    });

    expect(queryByText('1023')).toBeNull();
  });

  it('inverts the label as soon as the light fill moves underneath', () => {
    const { container } = render(KeyboardView, {
      props: { config, frame: [[174, 900, 0] as const] },
    });

    expect(container.querySelector('text')?.getAttribute('fill')).toBe(
      OVERLAY_TOKENS.keyLabelInverted,
    );
  });
});

describe('KeyboardView - what OBS sees and what the editor sees', () => {
  it('displays no editor decoration by default: this is what OBS sees', () => {
    const { container, queryByText } = render(KeyboardView, {
      props: { config: axisConfig, frame: [] },
    });

    expect(queryByText('AXIS')).toBeNull();
    expect(container.querySelector('[stroke-dasharray]')).toBeNull();
  });

  it('displays the dashed border and the AXIS label when the editor asks for it', () => {
    const { container, getByText } = render(KeyboardView, {
      props: { config: axisConfig, frame: [], decorations: true },
    });

    expect(getByText('AXIS')).toBeTruthy();
    expect(container.querySelector('[stroke-dasharray]')).not.toBeNull();
  });

  it('produces a deterministic SVG for the same configuration-state pair', () => {
    const first = render(KeyboardView, { props: { config, frame: [[174, 400, 0] as const] } });
    const html = first.container.innerHTML;
    cleanup();
    const second = render(KeyboardView, { props: { config, frame: [[174, 400, 0] as const] } });

    expect(second.container.innerHTML).toBe(html);
  });

  it('renders preview and broadcast identically for the same inputs', () => {
    // The whole point of the shared component (spec 5.2): were these two ever
    // to differ, every style adjustment would be a guess.
    const preview = render(KeyboardView, { props: { config, frame: [[174, 700, 1] as const] } });
    const previewHtml = preview.container.innerHTML;
    cleanup();
    const broadcast = render(KeyboardView, {
      props: { config, frame: [[174, 700, 1] as const], decorations: false },
    });

    expect(broadcast.container.innerHTML).toBe(previewHtml);
  });
});
