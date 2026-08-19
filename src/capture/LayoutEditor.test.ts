import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import LayoutEditor from './LayoutEditor.svelte';
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

function editor(config = twoKeys()) {
  const onChange = vi.fn();
  const view = render(LayoutEditor, { props: { config, frame: [], selectedIds: [], onChange } });
  const handles = [...view.container.querySelectorAll('button.handle')] as HTMLElement[];
  // jsdom has no pointer capture; the editor only ever asks for it.
  for (const handle of handles) {
    handle.setPointerCapture = () => {};
    handle.releasePointerCapture = () => {};
  }
  return { ...view, onChange, handles };
}

const press = (target: Element, init: PointerEventInit = {}) =>
  target.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...init }),
  );

const move = (target: Element, init: PointerEventInit = {}) =>
  target.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, buttons: 1, pointerId: 1, ...init }),
  );

describe('LayoutEditor - a drag that never ends', () => {
  // Every one of these leaves the editor in a state the user cannot get out
  // of: the draft stays on screen, disagreeing with what was persisted and
  // broadcast, and plain mouse movement keeps dragging the selection.

  it('ignores a right-click, which the context menu would swallow', () => {
    const { handles, container, onChange } = editor();

    press(handles[0]!, { button: 2 });
    move(container.querySelector('.stage')!, { clientX: 200, clientY: 200 });
    container
      .querySelector('.stage')!
      .dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops dragging when the pointer is cancelled', async () => {
    // Touch scrolling cancels the pointer, and nothing else would close it.
    // Checked on the handle rather than on onChange: with the drag still
    // armed the key follows the pointer on screen long before anything is
    // written, and that is what the user sees.
    const { handles, container } = editor();
    const before = handles[0]!.style.left;

    press(handles[0]!);
    window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    move(container.querySelector('.stage')!, { clientX: 300, clientY: 0 });
    await tick();

    expect(handles[0]!.style.left).toBe(before);
  });

  it('stops dragging when the button is no longer held', async () => {
    // A pointerup lost outside the stage used to leave the key following the
    // mouse with nothing pressed at all.
    const { handles, container } = editor();
    const before = handles[0]!.style.left;

    press(handles[0]!);
    move(container.querySelector('.stage')!, { clientX: 300, clientY: 0, buttons: 0 });
    await tick();

    expect(handles[0]!.style.left).toBe(before);
  });

  it('commits on a release anywhere, not only over the stage', () => {
    const { handles, container, onChange } = editor();

    press(handles[0]!);
    move(container.querySelector('.stage')!, { clientX: 112, clientY: 0 });
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('abandons a drag on Escape instead of leaving it armed', async () => {
    const { handles, container, onChange } = editor();
    const stage = container.querySelector('.stage')!;
    const before = handles[0]!.style.left;

    press(handles[0]!);
    move(stage, { clientX: 112, clientY: 0 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();

    expect(handles[0]!.style.left).toBe(before);

    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('LayoutEditor - writing only what changed', () => {
  it('writes nothing when a click wobbles by a pixel', () => {
    // `moved` used to mean "a pointermove happened", not "the position
    // changed": a one-pixel twitch during a click persisted and broadcast a
    // configuration identical to the stored one.
    const { handles, container, onChange } = editor();
    const stage = container.querySelector('.stage')!;

    press(handles[0]!);
    move(stage, { clientX: 1, clientY: 1 });
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('writes once when the key really moved', () => {
    const { handles, container, onChange } = editor();
    const stage = container.querySelector('.stage')!;

    press(handles[0]!);
    move(stage, { clientX: 112, clientY: 0 });
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].keys[0]).toMatchObject({ x: 2 });
  });
});
