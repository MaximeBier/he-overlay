import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ProfileBar from './ProfileBar.svelte';

afterEach(cleanup);

const COUNTS: Record<string, number> = { Apex: 6, 'ZQSD minimal': 4, Default: 0 };

function bar(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onDuplicate: vi.fn(),
    onRename: vi.fn(),
    onRemove: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
  };
  const props = {
    names: ['Apex', 'ZQSD minimal'],
    active: 'Apex',
    keyCount: (name: string) => COUNTS[name] ?? 0,
    status: 'Apex · 6 keys',
    ...handlers,
    ...overrides,
  };
  return { ...render(ProfileBar, { props }), ...handlers };
}

const trigger = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('[data-trigger]')!;
const menu = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-menu]');
const item = (c: HTMLElement, name: string) =>
  c.querySelector<HTMLElement>(`[data-profile="${name}"]`)!;
const action = (c: HTMLElement, name: string) =>
  c.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);

async function open(c: HTMLElement) {
  trigger(c).click();
  await Promise.resolve();
}

describe('the profile trigger', () => {
  it('names the active profile without opening anything', () => {
    const { container } = bar();

    expect(trigger(container).textContent).toContain('Apex');
    expect(menu(container)).toBeNull();
    expect(trigger(container).getAttribute('aria-expanded')).toBe('false');
  });

  it('opens and closes on its own click', async () => {
    const { container } = bar();

    await open(container);
    expect(menu(container)).not.toBeNull();
    expect(trigger(container).getAttribute('aria-expanded')).toBe('true');

    await open(container);
    expect(menu(container)).toBeNull();
  });

  it('closes on Escape, leaving the trigger to reopen it', async () => {
    const { container } = bar();
    await open(container);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();

    expect(menu(container)).toBeNull();
  });
});

describe('choosing a profile', () => {
  it('quotes the key count of every profile but the current one', async () => {
    // The count is what tells two similar names apart months later; on the
    // active row the tick says the same thing more usefully (mockup 6d).
    const { container } = bar();
    await open(container);

    expect(item(container, 'ZQSD minimal').textContent).toContain('4 keys');
    expect(item(container, 'Apex').textContent).not.toContain('6 keys');
  });

  it('marks the active profile', async () => {
    const { container } = bar();
    await open(container);

    expect(item(container, 'Apex').getAttribute('aria-current')).toBe('true');
    expect(item(container, 'ZQSD minimal').getAttribute('aria-current')).toBeNull();
  });

  it('switches and closes on a click', async () => {
    const { container, onSelect } = bar();
    await open(container);

    item(container, 'ZQSD minimal').click();
    await Promise.resolve();

    expect(onSelect).toHaveBeenCalledWith('ZQSD minimal');
    expect(menu(container)).toBeNull();
  });

  it('does not switch to the profile already open', async () => {
    // Switching reloads from storage. On the active profile that is a no-op at
    // best; it also runs while the menu is the only thing on screen, so a
    // stray reload is invisible until something is missing.
    const { container, onSelect } = bar();
    await open(container);

    item(container, 'Apex').click();
    await Promise.resolve();

    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('making profiles', () => {
  it('asks for a name before creating anything', async () => {
    const { container, onCreate } = bar();
    await open(container);

    action(container, 'new')!.click();
    await Promise.resolve();

    const field = container.querySelector<HTMLInputElement>('[data-name-field]')!;
    expect(onCreate).not.toHaveBeenCalled();

    field.value = 'Valorant';
    field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(onCreate).toHaveBeenCalledWith('Valorant');
    expect(menu(container)).toBeNull();
  });

  it('creates nothing from an empty name', async () => {
    const { container, onCreate } = bar();
    await open(container);
    action(container, 'new')!.click();
    await Promise.resolve();

    const field = container.querySelector<HTMLInputElement>('[data-name-field]')!;
    field.value = '   ';
    field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(onCreate).not.toHaveBeenCalled();
  });

  it('duplicates the profile it names', async () => {
    const { container, onDuplicate } = bar();
    await open(container);

    expect(action(container, 'duplicate')!.textContent).toContain('Apex');
    action(container, 'duplicate')!.click();
    await Promise.resolve();

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(menu(container)).toBeNull();
  });
});

describe('renaming a profile', () => {
  it('starts from the name it already has', async () => {
    // Renaming is almost always a correction, not a fresh idea: an empty field
    // makes someone retype what they can see two rows above.
    const { container } = bar();
    await open(container);

    action(container, 'rename')!.click();
    await Promise.resolve();

    expect(container.querySelector<HTMLInputElement>('[data-name-field]')!.value).toBe('Apex');
  });

  it('renames on submit', async () => {
    const { container, onRename } = bar();
    await open(container);
    action(container, 'rename')!.click();
    await Promise.resolve();

    const field = container.querySelector<HTMLInputElement>('[data-name-field]')!;
    field.value = '  Apex Legends  ';
    field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(onRename).toHaveBeenCalledWith('Apex Legends');
    expect(menu(container)).toBeNull();
  });

  it('renames nothing from an empty field', async () => {
    const { container, onRename } = bar();
    await open(container);
    action(container, 'rename')!.click();
    await Promise.resolve();

    const field = container.querySelector<HTMLInputElement>('[data-name-field]')!;
    field.value = '';
    field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(onRename).not.toHaveBeenCalled();
  });

  it('offers no second way to type a name while one is open', async () => {
    // One field, one meaning. With a creation and a rename open together, the
    // wrong submit renames the profile that is loaded instead of making a new
    // one — and both fields look identical.
    const { container } = bar();
    await open(container);

    action(container, 'rename')!.click();
    await Promise.resolve();

    expect(container.querySelectorAll('[data-name-field]')).toHaveLength(1);
    expect(action(container, 'new')).toBeNull();
    expect(action(container, 'rename')).toBeNull();
  });

  it('gives the field up on Escape without closing the menu', async () => {
    const { container, onRename } = bar();
    await open(container);
    action(container, 'rename')!.click();
    await Promise.resolve();

    container
      .querySelector<HTMLInputElement>('[data-name-field]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();

    expect(onRename).not.toHaveBeenCalled();
    expect(action(container, 'rename')).not.toBeNull();
  });
});

describe('deleting a profile', () => {
  it('takes two clicks, because the first one destroys a layout', async () => {
    // Not in the mockup, which offers no delete at all. A confirmation step in
    // the row itself is the smallest thing that keeps a misclick from costing
    // an evening of work.
    const { container, onRemove } = bar();
    await open(container);

    action(container, 'remove')!.click();
    await Promise.resolve();
    expect(onRemove).not.toHaveBeenCalled();
    expect(action(container, 'remove')!.textContent).toContain('Really delete');

    action(container, 'remove')!.click();
    await Promise.resolve();
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('forgets the confirmation when the menu closes', async () => {
    const { container } = bar();
    await open(container);
    action(container, 'remove')!.click();
    await Promise.resolve();

    await open(container);
    await open(container);

    expect(action(container, 'remove')!.textContent).not.toContain('Really delete');
  });

  it('offers nothing to delete when a single profile is left', async () => {
    const { container } = bar({ names: ['Apex'] });
    await open(container);

    expect(action(container, 'remove')).toBeNull();
  });
});

describe('the file on disk', () => {
  it('exports under the name of the profile', async () => {
    const { container, onExport } = bar();
    await open(container);

    expect(action(container, 'export')!.textContent).toContain('Apex');
    action(container, 'export')!.click();

    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('hands the chosen file over, and clears the input for the next try', async () => {
    // Left uncleared, picking the same file twice fires nothing at all — which
    // is exactly what one does after fixing it by hand.
    const { container, onImport } = bar();
    await open(container);

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['{}'], 'apex.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    // The assignment is watched, not the property: jsdom holds a file input's
    // value at '' whatever happens to it, so `expect(input.value).toBe('')`
    // passes before the component has done anything at all.
    const assigned: string[] = [];
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => 'C:\\fakepath\\apex.json',
      set: (written: string) => void assigned.push(written),
    });

    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(onImport).toHaveBeenCalledWith(file);
    expect(assigned).toEqual(['']);
  });
});

describe('the line that stays', () => {
  it('carries the permanent status inside the menu', async () => {
    const { container } = bar({ status: 'Apex · 4 keys · 2 skipped on the last import' });
    await open(container);

    expect(menu(container)!.textContent).toContain('2 skipped on the last import');
  });
});
