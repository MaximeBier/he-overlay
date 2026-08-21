import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import Host from './Collapsible.harness.svelte';

afterEach(cleanup);

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

const fold = (props: Record<string, unknown> = {}) => {
  const storage = (props.storage as ReturnType<typeof memoryStorage>) ?? memoryStorage();
  return { ...render(Host, { props: { storage, ...props } }), storage };
};

const details = (c: HTMLElement) => c.querySelector('details')!;
const summary = (c: HTMLElement) => c.querySelector('summary')!;

describe('opening and closing', () => {
  it('starts from the default when nothing was ever written', () => {
    expect(details(fold().container).open).toBe(false);
    expect(details(fold({ defaultOpen: true }).container).open).toBe(true);
  });

  it('starts from what was written, against the default', () => {
    // The whole point: the default is a first-run guess, the stored value is
    // a decision. A decision that a reload undoes was never a decision.
    const storage = memoryStorage({ 'he-overlay:open:style': '0' });

    expect(details(fold({ storage, defaultOpen: true }).container).open).toBe(false);
  });

  it('writes the choice down as it is made', async () => {
    const { container, storage } = fold();

    details(container).open = true;
    details(container).dispatchEvent(new Event('toggle'));
    await tick();

    expect(storage.map.get('he-overlay:open:style')).toBe('1');
  });

  it('shows its contents only while open', async () => {
    // Not merely hidden: a shut fold must cost nothing to keep current, which
    // is what lets the live reading of the diagnostics panel be free.
    const { container } = fold();
    expect(container.textContent).not.toContain('the contents');

    const { container: opened } = fold({ defaultOpen: true });
    expect(opened.textContent).toContain('the contents');
  });
});

describe('what the header says while shut', () => {
  it('names itself', () => {
    expect(summary(fold().container).textContent).toContain('Global style');
  });

  it('marks a fold whose contents departs from the defaults', () => {
    // Spec §9.3. Hiding a setting is acceptable; hiding an *active* one is
    // how someone spends an evening wondering why one key behaves oddly.
    expect(summary(fold().container).querySelector('[data-modified]')).toBeNull();
    expect(
      summary(fold({ modified: true }).container).querySelector('[data-modified]'),
    ).not.toBeNull();
  });

  it('carries a count or a warning without being opened', () => {
    const { container } = fold({ note: '2 to report', warn: true });

    const note = summary(container).querySelector('[data-note]')!;
    expect(note.textContent).toContain('2 to report');
    expect(note.getAttribute('data-warn')).toBe('true');
  });
});
