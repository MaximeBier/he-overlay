import { describe, it, expect } from 'vitest';
import { loadOpenState, saveOpenState } from './collapse';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

describe('remembering which folds are open', () => {
  it('uses the fallback the first time, whichever way it points', () => {
    expect(loadOpenState(memoryStorage(), 'style', true)).toBe(true);
    expect(loadOpenState(memoryStorage(), 'style', false)).toBe(false);
  });

  it('keeps each fold apart from the others', () => {
    // One key per fold. A single shared value would tie the journal to the
    // layout selector, and closing one would close both.
    const storage = memoryStorage();
    saveOpenState(storage, 'style', false);
    saveOpenState(storage, 'diagnostics', true);

    expect(loadOpenState(storage, 'style', true)).toBe(false);
    expect(loadOpenState(storage, 'diagnostics', false)).toBe(true);
  });

  it('falls back rather than trusting a value it does not recognise', () => {
    // Anything other than the two it writes. Reading "0" as open, or a stray
    // string as closed, silently reverses a choice someone made on purpose.
    expect(loadOpenState(memoryStorage({ 'he-overlay:open:style': 'yes' }), 'style', true)).toBe(
      true,
    );
    expect(loadOpenState(memoryStorage({ 'he-overlay:open:style': 'yes' }), 'style', false)).toBe(
      false,
    );
  });

  it('does not throw when the browser refuses to write', () => {
    // Same bargain as everywhere else: a browser with storage blocked loses
    // the memory of a fold, not the use of the page.
    const hostile = {
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    };

    expect(() => saveOpenState(hostile, 'style', true)).not.toThrow();
  });
});
