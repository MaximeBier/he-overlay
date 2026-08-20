import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Toast from './Toast.svelte';
import type { Notice } from './notice';

afterEach(cleanup);

function toast(notice: Notice | null) {
  const onDismiss = vi.fn();
  return { ...render(Toast, { props: { notice, onDismiss } }), onDismiss };
}

const shown = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-tone]');

describe('Toast', () => {
  it('shows nothing when there is nothing to say', () => {
    const { container } = toast(null);

    expect(shown(container)).toBeNull();
  });

  it('shows the message under its tone', () => {
    const { container } = toast({ tone: 'warning', message: 'Profile imported · 2 keys skipped' });

    expect(shown(container)!.dataset.tone).toBe('warning');
    expect(shown(container)!.textContent).toContain('2 keys skipped');
  });

  it('announces itself without stealing the focus', () => {
    // The toast appears while someone is mid-gesture in the profile menu.
    // Anything that moves the focus would close the menu they are still using.
    const { container } = toast({ tone: 'success', message: 'Profile imported' });

    expect(shown(container)!.getAttribute('role')).toBe('status');
    expect(document.activeElement).toBe(document.body);
  });

  it('goes away on the end of its own fade, never on a timer', async () => {
    // Global constraint 1: no timer in the capture page. Chrome throttles them
    // to a minute in the background, and a toast pinned to the corner of the
    // screen for a minute is worse than one that never showed.
    vi.useFakeTimers();
    try {
      const { container, onDismiss } = toast({ tone: 'success', message: 'Profile imported' });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(onDismiss).not.toHaveBeenCalled();

      shown(container)!.dispatchEvent(new Event('animationend', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a second message from scratch, not on the remains of the first fade', async () => {
    // Updating the text in place would leave the four seconds running from the
    // first message: a toast raised at 3.9 s would be gone in a tenth of one.
    // Only a new element restarts the animation, so that is what is asserted.
    const { container, rerender } = toast({ tone: 'success', message: 'Profile imported' });
    const first = shown(container);

    await rerender({ notice: { tone: 'error', message: 'Import failed' } });

    expect(container.querySelectorAll('[data-tone]')).toHaveLength(1);
    expect(shown(container)).not.toBe(first);
    expect(shown(container)!.textContent).toContain('Import failed');
  });
});
