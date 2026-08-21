import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Host from './Gated.harness.svelte';

afterEach(cleanup);

const gated = (available: boolean, reason = 'Available once a keyboard is detected') =>
  render(Host, { props: { available, reason } });

const region = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-gated]')!;

describe('a section that cannot be used yet', () => {
  it('shows what it will be, rather than hiding it', () => {
    // Spec §16.8: not hidden, dimmed. Someone who cannot see a feature cannot
    // plan for it, and cannot tell "not yet" from "not here".
    const { container } = gated(false);

    expect(container.querySelector('button')).not.toBeNull();
    expect(region(container).dataset.available).toBe('false');
  });

  it('says what is missing, not merely that something is', () => {
    // "Unavailable" sends someone hunting. "Available once a keyboard is
    // detected" tells them what to go and do.
    expect(gated(false).container.textContent).toContain('once a keyboard is detected');
  });

  it('cannot be reached by pointer or keyboard while it waits', () => {
    // Dimming is a look; `inert` is the behaviour. Without it the button is
    // still clickable and still in the tab order — greyed out and working.
    // The property, not the attribute: Svelte sets `inert` through the DOM
    // property when the element has one, and jsdom does not reflect it back.
    expect(region(gated(false).container).inert).toBe(true);
  });

  it('gets out of the way entirely once it can be used', () => {
    const { container } = gated(true);

    expect(region(container).inert).toBe(false);
    expect(region(container).dataset.available).toBe('true');
    expect(container.textContent).not.toContain('once a keyboard is detected');
  });
});

describe('when what is missing is a gesture, not a device', () => {
  const withAction = (action: string | null) => {
    const onAction = vi.fn();
    return {
      ...render(Host, {
        props: { available: false, reason: 'No keyboard access yet', action, onAction },
      }),
      onAction,
    };
  };

  it('offers nothing when there is nothing to press', () => {
    // A missing keyboard is not a missing click. Offering a button that cannot
    // help is how someone presses it four times and concludes it is broken.
    expect(withAction(null).container.querySelector('[data-gated-action]')).toBeNull();
  });

  it('offers the gesture when the browser is only waiting to be asked', () => {
    // WebHID needs a click to hang its prompt on. Once the setup wizard is
    // gone for good, this gate is the only place left offering one.
    const { container, onAction } = withAction('Allow keyboard');
    const button = container.querySelector<HTMLButtonElement>('[data-gated-action]')!;

    expect(button.textContent).toContain('Allow keyboard');
    button.click();

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('leaves the action outside the inert region, or it could not be pressed', () => {
    const { container } = withAction('Allow keyboard');
    const button = container.querySelector<HTMLElement>('[data-gated-action]')!;

    expect(button.closest('[data-gated]')).toBeNull();
  });
});
