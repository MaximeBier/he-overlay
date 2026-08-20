import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import LayoutEditor from './LayoutEditor.svelte';
import { DEFAULT_STYLE, defaultConfig, type OverlayConfig } from '../config/schema';
import { setKeyStyle } from '../config/edit';

afterEach(cleanup);

// Two whole key widths, read from the default rather than written as a pixel
// count: the mockup moved the tile from 56 px to 72 px on 2026-08-20, and a
// literal here silently became "1.55 units", which the quarter-key grid then
// snapped to 1.5.
const TWO_KEYS_ACROSS = 2 * DEFAULT_STYLE.unit;

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
    move(stage, { clientX: TWO_KEYS_ACROSS, clientY: 0 });
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
    move(stage, { clientX: TWO_KEYS_ACROSS, clientY: 0 });
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].keys[0]).toMatchObject({ x: 2 });
  });
});

describe('LayoutEditor - the popover is a place you go, not one you fall into', () => {
  const isOpen = (container: Element) => container.querySelector('[role="dialog"]') !== null;

  it('selects on a plain click without opening anything', () => {
    // The mockup is explicit (spec §16.5): a click selects, and that is all.
    // Opening the editor on every click puts a panel over the layout being
    // arranged, which is what one is looking at.
    const { handles, container } = editor();

    handles[0]!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }),
    );
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));

    expect(isOpen(container)).toBe(false);
  });

  it('opens on a double click', async () => {
    const { handles, container } = editor();

    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();

    expect(isOpen(container)).toBe(true);
  });

  it('opens on Enter, so the keyboard reaches it too', async () => {
    const { handles, container } = editor();

    handles[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();

    expect(isOpen(container)).toBe(true);
  });

  it('opens on a right click, and swallows the native menu', async () => {
    const { handles, container } = editor();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    handles[0]!.dispatchEvent(event);
    await tick();

    expect(isOpen(container)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('hides while a key is dragged and comes back on the drop', async () => {
    const { handles, container } = editor();
    const stage = container.querySelector('.stage')!;

    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();

    press(handles[0]!);
    move(stage, { clientX: TWO_KEYS_ACROSS, clientY: 0 });
    await tick();
    // A panel that follows the key across the stage is unreadable, and one
    // that stays put covers where the key is going.
    expect(isOpen(container)).toBe(false);

    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    await tick();
    expect(isOpen(container)).toBe(true);
  });

  it('closes when the press lands on a key outside the selection', async () => {
    const { handles, container } = editor();

    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();

    press(handles[1]!);
    await tick();

    expect(isOpen(container)).toBe(false);
  });

  it('gives Escape the popover before the selection', async () => {
    // Two things to undo and one key to do it with. Clearing the selection
    // first would leave the popover anchored to nothing.
    const { handles, container } = editor();

    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(isOpen(container)).toBe(false);
    expect(handles[0]!.getAttribute('aria-pressed')).toBe('true');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(handles[0]!.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('LayoutEditor - a customized key says so', () => {
  it('marks the keys that override something', () => {
    // Without it: you style one key, forget, and hunt months later for why it
    // does not react like the others (spec §8.2).
    const { handles } = editor(setKeyStyle(twoKeys(), [2], 'activeColor', '#ff0000'));

    expect(handles[0]!.classList.contains('overridden')).toBe(false);
    expect(handles[1]!.classList.contains('overridden')).toBe(true);
  });
});

describe('LayoutEditor - pressing nothing means nothing selected', () => {
  it('drops the selection when the press lands on bare stage', async () => {
    const { handles, container } = editor();
    const stage = container.querySelector('.stage')!;

    press(handles[0]!);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    await tick();
    expect(handles[0]!.getAttribute('aria-pressed')).toBe('true');

    stage.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2 }),
    );
    await tick();

    expect(handles[0]!.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the selection when the press lands on a key', async () => {
    // The handles are children of the stage, so an unguarded handler would
    // clear the selection on the way to every key it is meant to select.
    const { handles } = editor();

    press(handles[0]!);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    await tick();

    expect(handles[0]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('closes the popover too', async () => {
    const { handles, container } = editor();
    const stage = container.querySelector('.stage')!;

    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();

    stage.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2 }),
    );
    await tick();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('LayoutEditor - the popover belongs to one selection', () => {
  const isOpen = (container: Element) => container.querySelector('[role="dialog"]') !== null;

  it('stays closed after the selection is emptied and refilled', async () => {
    // The sidebar's "Delete N selected keys" empties `selectedIds` the same
    // way this Delete does. A boolean flag survived it, hidden behind an empty
    // selection — and the next Ctrl+A reopened a panel nobody had asked for.
    const { handles, container } = editor();

    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    expect(isOpen(container)).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await tick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await tick();

    expect(isOpen(container)).toBe(false);
  });

  it('closes when the selection grows', async () => {
    const { handles, container } = editor();

    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();

    handles[1]!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3, shiftKey: true }),
    );
    await tick();

    expect(isOpen(container)).toBe(false);
  });
});

describe('LayoutEditor - a half-typed field is not thrown away', () => {
  it('blurs the popover before taking it down', async () => {
    // The fields commit on `change`, which fires on blur — and blur is part of
    // the default action of a press elsewhere, so it happens after this
    // handler. Unmounting first detaches a focused input, which then fires
    // neither blur nor change, and the label just typed is lost.
    const { handles, container } = editor();
    const stage = container.querySelector('.stage')!;

    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();

    const label = container.querySelector<HTMLInputElement>('input[name="label"]')!;
    label.focus();

    // Asserted on the event, not on `document.activeElement`: removing a
    // focused element already moves the focus elsewhere, so the obvious
    // assertion would have passed with or without the fix. Detaching the
    // input fires no blur at all, which is precisely the defect.
    const blurred = vi.fn();
    label.addEventListener('blur', blurred);

    stage.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 4 }),
    );

    expect(blurred).toHaveBeenCalled();
  });
});

describe('LayoutEditor - lasso selection', () => {
  // jsdom gives every element a zero-origin bounding box, so a client
  // coordinate is a stage coordinate. One key is `DEFAULT_STYLE.unit` across.
  const HALF_KEY = DEFAULT_STYLE.unit / 2;

  const selected = (container: HTMLElement) =>
    [...container.querySelectorAll('button.handle')]
      .map((handle, index) => (handle.getAttribute('aria-pressed') === 'true' ? index + 1 : 0))
      .filter(Boolean);

  const marquee = (container: HTMLElement) => container.querySelector('.lasso');

  const release = () =>
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));

  it('takes the keys the rectangle covers', async () => {
    const { container } = editor();
    const stage = container.querySelector('.stage')!;

    press(stage, { clientX: 1, clientY: 1 });
    move(stage, { clientX: TWO_KEYS_ACROSS, clientY: HALF_KEY });
    await tick();

    expect(selected(container)).toEqual([1, 2]);
  });

  it('stops where the rectangle stops', async () => {
    const { container } = editor();
    const stage = container.querySelector('.stage')!;

    press(stage, { clientX: 1, clientY: 1 });
    move(stage, { clientX: HALF_KEY, clientY: HALF_KEY });
    await tick();

    expect(selected(container)).toEqual([1]);
  });

  it('works drawn backwards, up and to the left', async () => {
    // Half of all lassos are. Left to a negative extent this selects nothing,
    // and the gesture appears to fail at random.
    const { container } = editor();
    const stage = container.querySelector('.stage')!;

    press(stage, { clientX: HALF_KEY, clientY: HALF_KEY });
    move(stage, { clientX: 1, clientY: 1 });
    await tick();

    expect(selected(container)).toEqual([1]);
  });

  it('shows the rectangle while it is being drawn, and not after', async () => {
    const { container } = editor();
    const stage = container.querySelector('.stage')!;

    press(stage, { clientX: 1, clientY: 1 });
    move(stage, { clientX: HALF_KEY, clientY: HALF_KEY });
    await tick();
    expect(marquee(container)).not.toBeNull();

    release();
    await tick();
    expect(marquee(container)).toBeNull();
  });

  it('adds to the selection when Shift is held, as Shift+click does', async () => {
    const { container, handles } = editor();
    const stage = container.querySelector('.stage')!;

    press(handles[1]!);
    release();
    await tick();

    press(stage, { clientX: 1, clientY: 1, shiftKey: true });
    move(stage, { clientX: HALF_KEY, clientY: HALF_KEY });
    await tick();

    expect(selected(container)).toEqual([1, 2]);
  });

  it('still clears the selection on a press that goes nowhere', async () => {
    // The behaviour bare stage had before the lasso existed. A marquee of no
    // size must not become a way to keep a selection one clicked away from.
    const { container, handles } = editor();

    press(handles[0]!);
    release();
    await tick();
    expect(selected(container)).toEqual([1]);

    press(container.querySelector('.stage')!, { clientX: 1, clientY: 1 });
    release();
    await tick();

    expect(selected(container)).toEqual([]);
  });

  it('never starts from a key: pressing one drags it', async () => {
    const { container, handles } = editor();

    press(handles[0]!, { clientX: 1, clientY: 1 });
    move(container.querySelector('.stage')!, { clientX: HALF_KEY, clientY: HALF_KEY });
    await tick();

    expect(marquee(container)).toBeNull();
  });

  it('takes the rectangle away with the gesture on Escape', async () => {
    const { container } = editor();
    const stage = container.querySelector('.stage')!;

    press(stage, { clientX: 1, clientY: 1 });
    move(stage, { clientX: TWO_KEYS_ACROSS, clientY: HALF_KEY });
    await tick();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();

    expect(marquee(container)).toBeNull();
    expect(selected(container)).toEqual([]);
  });

  it('drops the rectangle when the release happened out of sight', async () => {
    // Same failure the drag has: a pointerup outside the window leaves the
    // marquee following the mouse with nothing held down.
    const { container } = editor();
    const stage = container.querySelector('.stage')!;

    press(stage, { clientX: 1, clientY: 1 });
    move(stage, { clientX: HALF_KEY, clientY: HALF_KEY, buttons: 0 });
    await tick();

    expect(marquee(container)).toBeNull();
  });
});
