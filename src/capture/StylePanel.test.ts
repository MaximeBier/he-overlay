import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import StylePanel from './StylePanel.svelte';
import { defaultConfig, type OverlayConfig } from '../config/schema';

afterEach(cleanup);

function panel(config: OverlayConfig = defaultConfig()) {
  const onChange = vi.fn();
  return { ...render(StylePanel, { props: { config, onChange } }), onChange, config };
}

/** `<input type="color">` reports its value lowercased, whatever was set. */
const change = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('StylePanel', () => {
  it('writes the global active colour', () => {
    const { container, onChange } = panel();

    change(container.querySelector<HTMLInputElement>('input[name="activeColor"]')!, '#ff0000');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].style.activeColor).toBe('#ff0000');
  });

  it('writes the global fill direction', () => {
    const { container, onChange } = panel();
    const select = container.querySelector<HTMLSelectElement>('select[name="fillDirection"]')!;

    select.value = 'left';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onChange.mock.calls[0]![0].style.fillDirection).toBe('left');
  });

  it('never touches a key', () => {
    // This panel is global and nothing else. It sat next to a per-key editor
    // in the plan, sharing one `apply` that chose its target from the
    // selection — a wrong branch there is invisible on screen, because the
    // preview renders the resolved style either way (spec §16.4).
    const config = defaultConfig();
    config.keys.push({ id: 1, usage: 0x14, mode: 'key', label: 'A', x: 0, y: 0, w: 1, h: 1 });
    const { container, onChange } = panel(config);

    change(container.querySelector<HTMLInputElement>('input[name="restColor"]')!, '#123456');

    expect(onChange.mock.calls[0]![0].keys[0].style).toBeUndefined();
  });

  it('writes an empty size field back rather than collapsing the layout', () => {
    // `+''` is 0, not NaN: clearing the field to retype it used to set every
    // key to zero pixels, persist it and broadcast it — the same defect the
    // position fields carry a guard for.
    const { container, onChange } = panel();
    const unit = container.querySelector<HTMLInputElement>('input[name="unit"]')!;

    unit.value = '';
    unit.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onChange).not.toHaveBeenCalled();
    expect(unit.value).toBe(String(defaultConfig().style.unit));
  });
});

describe('StylePanel - a size the renderer can survive', () => {
  // `min` and `max` bound the spinner arrows, not the keyboard. A typed zero
  // used to be stored, saved, and broadcast — where `isExtent(unit)` rejects
  // it and `parseMessage` throws away the whole configuration message, leaving
  // the overlay on the last good one with no way to say why.
  const write = (name: string, value: string) => {
    const { container, onChange } = panel();
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { input, onChange };
  };

  it('refuses a key size of zero', () => {
    const { onChange, input } = write('unit', '0');

    expect(onChange.mock.calls[0]![0].style.unit).toBe(16);
    expect(input.value).toBe('16');
  });

  it('refuses a negative gap', () => {
    const { onChange } = write('gap', '-8');

    expect(onChange.mock.calls[0]![0].style.gap).toBe(0);
  });

  it('caps a size nobody meant to type', () => {
    const { onChange } = write('unit', '99999');

    expect(onChange.mock.calls[0]![0].style.unit).toBe(200);
  });

  it('refuses text that parses to nothing', () => {
    // A number field can hold `e` and `-`, and `Number('e')` is NaN — which
    // `isExtent` rejects for the same reason zero is rejected.
    const { onChange, input } = write('unit', 'e');

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe(String(defaultConfig().style.unit));
  });
});
