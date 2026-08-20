import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import KeyPopover from './KeyPopover.svelte';
import { setKeyStyle } from '../config/edit';
import { defaultConfig, type OverlayConfig } from '../config/schema';

afterEach(cleanup);

function twoKeys(): OverlayConfig {
  const config = defaultConfig();
  config.keys.push(
    { id: 1, usage: 0x14, mode: 'key', label: 'A', x: 0, y: 0, w: 1, h: 1 },
    { id: 2, usage: 0x16, mode: 'key', label: 'S', x: 1, y: 0, w: 1, h: 1 },
  );
  return config;
}

function popover(config = twoKeys(), selectedIds = [1]) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  return {
    ...render(KeyPopover, { props: { config, selectedIds, onChange, onClose } }),
    onChange,
    onClose,
    config,
  };
}

const change = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const reset = (container: Element) =>
  container.querySelector<HTMLButtonElement>('button[data-reset="activeColor"]');

describe('KeyPopover', () => {
  it('overrides the active colour of the selection only', () => {
    const { container, onChange } = popover();

    change(container.querySelector<HTMLInputElement>('input[name="activeColor"]')!, '#ff0000');

    const next = onChange.mock.calls[0]![0];
    expect(next.keys[0].style).toEqual({ activeColor: '#ff0000' });
    expect(next.keys[1].style).toBeUndefined();
    expect(next.style.activeColor).toBe(defaultConfig().style.activeColor);
  });

  it('overrides a whole group in one gesture', () => {
    const { container, onChange } = popover(twoKeys(), [1, 2]);

    change(container.querySelector<HTMLInputElement>('input[name="activeColor"]')!, '#ff0000');

    expect(onChange.mock.calls[0]![0].keys.map((k: { style?: unknown }) => k.style)).toEqual([
      { activeColor: '#ff0000' },
      { activeColor: '#ff0000' },
    ]);
  });

  it('offers no way back to the global on a key that inherits', () => {
    // The button is the override marker as much as it is a control: offering
    // it unconditionally says every key is customized, which is the confusion
    // the markers exist to prevent (spec §8.2).
    const { container } = popover();

    expect(reset(container)).toBeNull();
  });

  it('offers the way back once the key overrides', () => {
    const { container } = popover(setKeyStyle(twoKeys(), [1], 'activeColor', '#ff0000'));

    expect(reset(container)).not.toBeNull();
  });

  it('returns the key to inheritance', () => {
    const { container, onChange } = popover(setKeyStyle(twoKeys(), [1], 'activeColor', '#ff0000'));

    reset(container)!.click();

    expect(onChange.mock.calls[0]![0].keys[0].style).toBeUndefined();
  });

  it('switches the selection to axis mode', () => {
    const { container, onChange } = popover(twoKeys(), [1, 2]);

    container.querySelector<HTMLButtonElement>('button[data-mode="axis"]')!.click();

    expect(onChange.mock.calls[0]![0].keys.map((k: { mode: string }) => k.mode)).toEqual([
      'axis',
      'axis',
    ]);
  });

  it('renames a single key', () => {
    const { container, onChange } = popover();

    change(container.querySelector<HTMLInputElement>('input[name="label"]')!, 'Sprint');

    expect(onChange.mock.calls[0]![0].keys[0].label).toBe('Sprint');
  });

  it('offers no label field on a group', () => {
    // A label is individual by nature, and a group field would have to either
    // overwrite two names with one or show nothing useful.
    const { container } = popover(twoKeys(), [1, 2]);

    expect(container.querySelector('input[name="label"]')).toBeNull();
  });

  it('deletes the selection and closes', () => {
    const { container, onChange, onClose } = popover(twoKeys(), [1, 2]);

    container.querySelector<HTMLButtonElement>('button[data-delete]')!.click();

    expect(onChange.mock.calls[0]![0].keys).toEqual([]);
    // Left open, it would anchor to a selection that no longer exists.
    expect(onClose).toHaveBeenCalled();
  });

  it('says how many keys it speaks for', () => {
    const { container } = popover(twoKeys(), [1, 2]);

    expect(container.textContent).toContain('2 keys');
  });
});

describe('KeyPopover - fine adjustment', () => {
  it('moves a key by typed coordinates', () => {
    // Spec §8.7: drag alone stops being enough the moment two keys have to
    // line up exactly.
    const { container, onChange } = popover();

    change(container.querySelector<HTMLInputElement>('input[name="x"]')!, '2.5');

    expect(onChange.mock.calls[0]![0].keys[0]).toMatchObject({ x: 2.5, y: 0 });
  });

  it('puts an emptied coordinate back instead of teleporting the key', () => {
    // `+''` is 0: clearing X to retype it used to move the key to the origin,
    // persist it and broadcast it, on the blur.
    const { container, onChange } = popover();
    const x = container.querySelector<HTMLInputElement>('input[name="x"]')!;

    change(x, '');

    expect(onChange).not.toHaveBeenCalled();
    expect(x.value).toBe('0');
  });

  it('offers no position field on a group', () => {
    const { container } = popover(twoKeys(), [1, 2]);

    expect(container.querySelector('input[name="x"]')).toBeNull();
    expect(container.querySelector('input[name="width"]')).not.toBeNull();
  });

  it('resizes the whole selection', () => {
    const { container, onChange } = popover(twoKeys(), [1, 2]);

    change(container.querySelector<HTMLInputElement>('input[name="width"]')!, '2');

    expect(onChange.mock.calls[0]![0].keys.map((k: { w: number }) => k.w)).toEqual([2, 2]);
  });
});
