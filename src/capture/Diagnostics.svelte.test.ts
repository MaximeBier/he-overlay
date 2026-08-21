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
  it('says which build is running', () => {
    // A report that cannot name its build is a report about an unknown program.
    expect(panel().container.querySelector('[data-build]')!.textContent).toBeTruthy();
  });
});

describe('what it costs while shut', () => {
  it('reads no frame until something renders it', () => {
    // The fold around this one only renders the body while open, so passing a
    // function rather than a list is what makes a shut panel free: nothing
    // calls it, so nothing reads `frame` sixty times a second.
    let calls = 0;
    panel({
      readings: () => {
        calls += 1;
        return [];
      },
    });

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
