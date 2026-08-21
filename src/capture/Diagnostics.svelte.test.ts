import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import Diagnostics from './Diagnostics.svelte';
import type { JournalEntry } from './journal';

afterEach(cleanup);

const ENTRIES: JournalEntry[] = [
  { at: 1_000, kind: 'user', message: 'OBS unreachable' },
  { at: 12_340, kind: 'bug', message: 'Key 30 reported undocumented low bits' },
];

function panel(overrides: Record<string, unknown> = {}) {
  const handlers = { onCaptureRaw: vi.fn(), onToggleProbe: vi.fn(), onTestObs: vi.fn() };
  const props = {
    entries: ENTRIES,
    logText: () => '+1.0s\tuser\tOBS unreachable',
    readings: () => [{ id: 174, label: 'Q', travel: 996, active: true }],
    snapshot: null,
    capturing: false,
    probing: false,
    probe: null,
    obsProbe: null,
    ...handlers,
    ...overrides,
  };
  return { ...render(Diagnostics, { props }), ...handlers };
}

const button = (c: HTMLElement, name: string) =>
  c.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;

describe('the journal', () => {
  it('shows every entry under its kind', () => {
    const { container } = panel();
    const lines = container.querySelectorAll('[data-kind]');

    expect(lines).toHaveLength(2);
    expect(lines[1]!.getAttribute('data-kind')).toBe('bug');
    expect(lines[1]!.textContent).toContain('undocumented low bits');
  });

  it('says it is empty rather than showing an empty box', () => {
    expect(panel({ entries: [] }).container.textContent).toMatch(/nothing|no entries/i);
  });

  it('copies the log with the build and the browser attached', async () => {
    // The two facts a reader needs before reading a single line, and the two
    // nobody thinks to paste. Attaching them to the button is the only way
    // they travel with the report.
    const writeText = vi.fn((_text: string) => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText }, userAgent: 'OBS/30.0' });
    const { container } = panel();

    button(container, 'copy').click();
    await tick();

    const written = writeText.mock.calls[0]![0];
    expect(written).toContain('OBS unreachable');
    expect(written).toContain('OBS/30.0');
    vi.unstubAllGlobals();
  });
});

describe('the live reading', () => {
  it('is the one place the raw travel is shown', () => {
    // The overlay never shows a number (deliberate deviation); this is where
    // one goes to see 0..1023 and the actuation bit as the keyboard sends them.
    const { container } = panel();
    const row = container.querySelector('[data-reading="174"]')!;

    expect(row.textContent).toContain('996');
    expect(row.textContent).toContain('174');
  });

  it('tells an actuated key from a merely pressed one', () => {
    const { container } = panel({
      readings: () => [{ id: 174, label: 'Q', travel: 1023, active: false }],
    });

    expect(container.querySelector('[data-reading="174"]')!.getAttribute('data-active')).toBe(
      'false',
    );
  });
});

describe('the raw snapshot', () => {
  it('arms on demand and says it is waiting', async () => {
    const { container, onCaptureRaw } = panel();

    button(container, 'capture').click();
    await tick();

    expect(onCaptureRaw).toHaveBeenCalledTimes(1);
    expect(panel({ capturing: true }).container.textContent).toMatch(/press any key|waiting/i);
  });

  it('shows the bytes once one arrived', () => {
    const { container } = panel({ snapshot: '00 ff 10' });

    expect(container.querySelector('[data-snapshot]')!.textContent).toBe('00 ff 10');
  });
});

describe('the background probe', () => {
  it('starts and stops from one button', async () => {
    const { container, onToggleProbe } = panel();

    button(container, 'probe').click();
    await tick();

    expect(onToggleProbe).toHaveBeenCalledTimes(1);
    expect(button(panel({ probing: true }).container, 'probe').textContent).toMatch(/stop/i);
  });

  it('shows the two figures that answer the question', () => {
    // Reports alone prove nothing: 400 over four seconds is a healthy stream,
    // 400 over four minutes is a stream that died and came back (spec §2.2).
    const { container } = panel({ probe: { reports: 412, maxGapMs: 34, sinceMs: 8_000 } });

    expect(container.textContent).toContain('412');
    expect(container.textContent).toContain('34');
    expect(container.textContent).toContain('8.0');
  });
});

describe('naming itself', () => {
  it('says which build is running, and not merely its own name', () => {
    // `toBeTruthy` passed on the literal "HE Overlay " alone, so it could not
    // notice `__BUILD__` going empty — the one failure the whole mechanism
    // exists to prevent, and the one a lost `define` in vite.config produces.
    const shown = panel().container.querySelector('[data-build]')!.textContent ?? '';

    expect(shown.replace('HE Overlay', '').trim()).not.toBe('');
  });
});

describe('what it costs while shut', () => {
  it('takes the reading as a function, so a shut fold can skip it', () => {
    // What the shape actually guarantees, tested where it is observable. The
    // fold above renders this body only while open; the cost of a shut one is
    // therefore whatever the *parent* evaluates, and a function is what lets
    // it evaluate nothing.
    //
    // The previous version mounted the panel open and asserted the reading had
    // been called — the opposite of its own name, true whether it ran once or
    // sixty times a second, and still true if someone swapped the function for
    // an eagerly-built list. It guarded nothing.
    let calls = 0;
    const readings = () => {
      calls += 1;
      return [];
    };

    expect(calls).toBe(0);
    panel({ readings });
    expect(calls).toBeGreaterThan(0);
  });
});

describe('the OBS probe', () => {
  it('asks on demand, and says nothing before it was asked', () => {
    const { container, onTestObs } = panel();

    expect(container.querySelector('[data-obs-probe]')).toBeNull();
    button(container, 'test-obs').click();

    expect(onTestObs).toHaveBeenCalledTimes(1);
  });

  it('shows what the throwaway connection answered', () => {
    const { container } = panel({ obsProbe: 'auth-failed' });

    expect(container.querySelector('[data-obs-probe]')!.textContent).toContain('auth-failed');
  });

  it('warns that OBS will briefly show two clients', () => {
    // Someone watching the OBS side while debugging a connection is exactly
    // who presses this, and an unexplained second client is a new mystery.
    // \s+, not a space: prettier wraps the sentence and `textContent` keeps
    // the newline. An assertion that breaks on reflow tests the formatter.
    expect(panel().container.textContent).toMatch(/two\s+clients/i);
  });
});

describe('a copy button that cannot lie', () => {
  it('says it failed when there is no clipboard to write to', async () => {
    // `navigator.clipboard` is undefined outside a secure context — the LAN
    // host `http://<ip>:8080` this product documents as a real deployment.
    // The button used to say "Copied" over an empty clipboard, and the person
    // walked away, pasted nothing, and blamed the paste.
    vi.stubGlobal('navigator', { userAgent: 'test' });
    const { container } = panel();

    button(container, 'copy').click();
    await tick();

    expect(button(container, 'copy').textContent).toMatch(/failed/i);
    vi.unstubAllGlobals();
  });

  it('re-arms on blur, since no timer may reset it', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    vi.stubGlobal('navigator', { userAgent: 'test', clipboard: { writeText } });
    const { container } = panel();

    button(container, 'copy').click();
    // `waitFor`, not a single tick: the success path awaits the clipboard
    // promise, so the label settles a microtask after the scheduler has run.
    await vi.waitFor(() => expect(button(container, 'copy').textContent).toMatch(/copied/i));

    button(container, 'copy').dispatchEvent(new FocusEvent('blur'));
    await tick();

    expect(button(container, 'copy').textContent).toMatch(/copy log/i);
    vi.unstubAllGlobals();
  });
});
