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

  it('draws a fully pressed active key entirely in the active color', () => {
    // Background and fill both, because the fill covers the whole key: what
    // the viewer sees is the active colour and nothing else.
    const { container, getByText } = render(KeyboardView, {
      props: { config, frame: [[174, 1023, 1] as const] },
    });

    const rects = container.querySelectorAll('rect');
    expect(rects[0]?.getAttribute('fill')).toBe('#ffffff'); // fill colour behind
    expect(rects[1]?.getAttribute('fill')).toBe('#00ff00'); // active colour on top
    expect(rects[1]?.getAttribute('height')).toBe('90');
    expect(getByText('Q')).toBeTruthy();
  });

  it('never displays the raw value', () => {
    const { queryByText } = render(KeyboardView, {
      props: { config, frame: [[174, 1023, 1] as const] },
    });

    expect(queryByText('1023')).toBeNull();
  });

  it('keeps one label colour and outlines it, whatever sits behind', () => {
    const shallow = render(KeyboardView, { props: { config, frame: [] } });
    const shallowLabel = shallow.container.querySelector('text')!;
    expect(shallowLabel.getAttribute('fill')).toBe(OVERLAY_TOKENS.keyLabel);
    cleanup();

    const deep = render(KeyboardView, { props: { config, frame: [[174, 900, 1] as const] } });
    const deepLabel = deep.container.querySelector('text')!;

    expect(deepLabel.getAttribute('fill')).toBe(OVERLAY_TOKENS.keyLabel);
    expect(deepLabel.getAttribute('stroke')).toBe(OVERLAY_TOKENS.keyLabelOutline);
    expect(deepLabel.getAttribute('paint-order')).toBe('stroke fill');
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

  it('adds decorations without touching anything the broadcast shows', () => {
    // The whole point of the shared component (spec 5.2): were the editor and
    // the broadcast ever to differ on fill, colour or geometry, every style
    // adjustment would be a guess. Comparing the default against an explicit
    // `decorations: false` proved nothing — both take the same branch. What
    // has to hold is that turning it on adds the dashed border and the AXIS
    // label, and changes nothing else.
    const frame = [[174, 700, 1] as const];

    const plain = render(KeyboardView, { props: { config: axisConfig, frame } });
    const broadcastHtml = plain.container.innerHTML;
    cleanup();

    const decorated = render(KeyboardView, {
      props: { config: axisConfig, frame, decorations: true },
    });
    const stripped = decorated.container.innerHTML
      .replace(/<text[^>]*>AXIS<[/]text>/, '')
      .replace(/ stroke-dasharray="[^"]*"/, '');

    expect(stripped).toBe(broadcastHtml);
  });
});
