import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import Wizard from './Wizard.svelte';
import type { WizardStep } from './wizard';
import type { KeyboardStatus } from '../keyboard/device';

afterEach(cleanup);

function wizard(step: WizardStep, overrides: Record<string, unknown> = {}) {
  const handlers = { onAllowKeyboard: vi.fn(), onReconnect: vi.fn(), onSkip: vi.fn() };
  const props = {
    step,
    keyboard: 'disconnected' as KeyboardStatus,
    device: null,
    settings: { port: 4455, password: 'hunter2' },
    url: 'https://he-overlay.example/overlay.html?port=4455#password=hunter2',
    learning: false,
    added: null,
    ...handlers,
    ...overrides,
  };
  return { ...render(Wizard, { props }), ...handlers };
}

const card = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-card]');
const banner = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-banner]');
const row = (c: HTMLElement, step: string) => c.querySelector<HTMLElement>(`[data-row="${step}"]`);
const button = (c: HTMLElement, name: string) =>
  c.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);

describe('the setup card', () => {
  it('numbers itself out of three', () => {
    expect(card(wizard('keyboard').container)!.textContent).toContain('SETUP 1/3');
    expect(card(wizard('obs').container)!.textContent).toContain('SETUP 2/3');
  });

  it('marks the steps already behind it', () => {
    const { container } = wizard('obs', { keyboard: 'connected', device: 'Wooting 60HE' });

    expect(row(container, 'keyboard')!.dataset.state).toBe('done');
    expect(row(container, 'obs')!.dataset.state).toBe('current');
    expect(row(container, 'keys')!.dataset.state).toBe('pending');
  });

  it('names the keyboard it found, rather than only ticking it', () => {
    // A green dot says a keyboard answered, not which one — and the question
    // is asked precisely on the machine with two analog boards in it.
    const { container } = wizard('obs', { keyboard: 'connected', device: 'Wooting 60HE' });

    expect(row(container, 'keyboard')!.textContent).toContain('Wooting 60HE');
  });

  it('asks for permission before offering to look again', () => {
    // "Rescan devices" in front of someone who has never granted WebHID is a
    // button that appears to do nothing: the browser needs the gesture named.
    expect(
      button(wizard('keyboard', { keyboard: 'no-permission' }).container, 'keyboard')!.textContent,
    ).toContain('Allow');
    expect(
      button(wizard('keyboard', { keyboard: 'disconnected' }).container, 'keyboard')!.textContent,
    ).toContain('Rescan');
  });

  it('hands over the URL to paste into OBS, and copies it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { container } = wizard('obs');

    expect(container.querySelector<HTMLInputElement>('[data-url]')!.value).toContain(
      'overlay.html',
    );
    button(container, 'copy')!.click();
    await tick();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('overlay.html'));
    vi.unstubAllGlobals();
  });

  it('says the credentials never leave the machine', () => {
    // The one page that hands out a URL with a password in it owes the reader
    // this sentence (spec §16.8).
    expect(card(wizard('obs').container)!.textContent).toMatch(/never receive|your machine/i);
  });

  it('can be put aside from any step', () => {
    const { container, onSkip } = wizard('obs');

    button(container, 'skip')!.click();

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('the last step is not a card', () => {
  it('gets out of the way so the keys can be seen landing', () => {
    // A 410 px card in the middle of the stage would cover the very thing
    // step 3 exists to show (mockup 6c).
    const { container } = wizard('keys', { keyboard: 'connected', learning: true });

    expect(card(container)).toBeNull();
    expect(banner(container)).not.toBeNull();
  });

  it('confirms the key that just landed', () => {
    const { container } = wizard('keys', { keyboard: 'connected', learning: true, added: 'D' });

    expect(banner(container)!.textContent).toContain('D added');
  });
});

describe('arming the capture', () => {
  it('starts listening the moment the last step opens', async () => {
    // The mockup shows step 3 already listening: asking for one more click to
    // begin the step one just arrived at is a click that explains nothing.
    const listening: boolean[] = [];
    const { rerender } = render(Wizard, {
      props: {
        step: 'obs' as WizardStep,
        keyboard: 'connected' as KeyboardStatus,
        device: 'Wooting 60HE',
        settings: { port: 4455, password: '' },
        url: 'https://he-overlay.example/overlay.html?port=4455',
        get learning() {
          return listening.at(-1) ?? false;
        },
        set learning(value: boolean) {
          listening.push(value);
        },
        added: null,
        onAllowKeyboard: vi.fn(),
        onReconnect: vi.fn(),
        onSkip: vi.fn(),
      },
    });

    expect(listening).toEqual([]);

    await rerender({ step: 'keys' });
    await tick();

    expect(listening).toEqual([true]);
  });

  it('does not arm it again after it was called off', async () => {
    // Cancelling and being re-armed by the same effect is a fight the user
    // cannot win: the button would refuse to turn off.
    const listening: boolean[] = [];
    let value = false;
    const { rerender } = render(Wizard, {
      props: {
        step: 'keys' as WizardStep,
        keyboard: 'connected' as KeyboardStatus,
        device: 'Wooting 60HE',
        settings: { port: 4455, password: '' },
        url: 'https://he-overlay.example/overlay.html?port=4455',
        get learning() {
          return value;
        },
        set learning(next: boolean) {
          value = next;
          listening.push(next);
        },
        added: null,
        onAllowKeyboard: vi.fn(),
        onReconnect: vi.fn(),
        onSkip: vi.fn(),
      },
    });
    await tick();
    expect(listening).toEqual([true]);

    value = false;
    await rerender({ added: 'D' });
    await tick();

    expect(listening).toEqual([true]);
  });
});

describe('putting the setup aside', () => {
  it('stops listening on the way out of the last step', async () => {
    // Arriving at step 3 arms the capture. Skipping from there used to unmount
    // the card with the capture still armed: the banner vanished, and the next
    // key the person brushed was added to the layout in silence.
    const listening: boolean[] = [];
    let value = false;
    const { container } = render(Wizard, {
      props: {
        step: 'keys' as WizardStep,
        keyboard: 'connected' as KeyboardStatus,
        device: 'Wooting 60HE',
        settings: { port: 4455, password: '' },
        url: 'https://he-overlay.example/overlay.html?port=4455',
        get learning() {
          return value;
        },
        set learning(next: boolean) {
          value = next;
          listening.push(next);
        },
        added: null,
        onAllowKeyboard: vi.fn(),
        onReconnect: vi.fn(),
        onSkip: vi.fn(),
      },
    });
    await tick();
    expect(listening).toEqual([true]);

    container.querySelector<HTMLButtonElement>('[data-action="skip"]')!.click();
    await tick();

    expect(value).toBe(false);
  });
});
