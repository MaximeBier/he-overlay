import { describe, it, expect } from 'vitest';
import {
  loadStatus,
  nextStep,
  saveStatus,
  showsResume,
  showsWizard,
  stepNumber,
  type SetupState,
} from './wizard';

const nothing: SetupState = { keyboard: 'disconnected', obs: 'idle', overlays: 0, keyCount: 0 };
const ready: SetupState = { keyboard: 'connected', obs: 'identified', overlays: 1, keyCount: 0 };

describe('what is left to do', () => {
  it('starts at the keyboard, since nothing else can be tried without one', () => {
    expect(nextStep(nothing)).toBe('keyboard');
  });

  it('moves on to OBS once the keyboard answers', () => {
    expect(nextStep({ ...nothing, keyboard: 'connected' })).toBe('obs');
  });

  it('waits for the browser source, not merely for the socket', () => {
    // The socket is the easy half. The half that fails silently is the browser
    // source: a correct URL never pasted into OBS looks exactly like a wrong
    // one, and the whole point of the step is to prove otherwise (spec §9.1).
    expect(nextStep({ ...nothing, keyboard: 'connected', obs: 'identified' })).toBe('obs');
  });

  it('asks for keys once something is actually on screen in OBS', () => {
    expect(nextStep(ready)).toBe('keys');
  });

  it('is finished on the first key, which lands live in the overlay', () => {
    expect(nextStep({ ...ready, keyCount: 1 })).toBe('done');
  });

  it('reports what is missing, not how far one got', () => {
    // Derived from the state every time. A counter that only moves forward
    // would claim the setup is done for someone whose keyboard was unplugged
    // halfway; that it is the *status* which sticks, not the step, is what
    // keeps a finished install from reopening the wizard on an OBS restart.
    expect(nextStep({ ...ready, keyCount: 4, keyboard: 'disconnected' })).toBe('keyboard');
  });
});

describe('numbering the steps for the header', () => {
  it('numbers the three steps in the order they are done', () => {
    expect(stepNumber('keyboard')).toBe(1);
    expect(stepNumber('obs')).toBe(2);
    expect(stepNumber('keys')).toBe(3);
  });

  it('counts a finished setup as the last step, never a fourth', () => {
    // The label reads "Resume setup · N/3"; a 4 would be nonsense on screen.
    expect(stepNumber('done')).toBe(3);
  });
});

describe('whether anything shows at all', () => {
  it('shows the wizard on a first run', () => {
    expect(showsWizard('open', 'keyboard')).toBe(true);
    expect(showsResume('open', 'keyboard')).toBe(false);
  });

  it('shows nothing at all once everything works', () => {
    expect(showsWizard('open', 'done')).toBe(false);
    expect(showsResume('skipped', 'done')).toBe(false);
  });

  it('offers to resume after a skip, and only then', () => {
    expect(showsWizard('skipped', 'obs')).toBe(false);
    expect(showsResume('skipped', 'obs')).toBe(true);
  });

  it('never reopens a setup that was seen through', () => {
    // Someone whose OBS is merely off tonight is not being set up again.
    expect(showsWizard('done', 'obs')).toBe(false);
    expect(showsResume('done', 'obs')).toBe(false);
  });
});

describe('remembering across reloads', () => {
  const memory = (initial?: string) => {
    const map = new Map(initial === undefined ? [] : [['he-overlay:setup', initial]]);
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      map,
    };
  };

  it('opens on a browser that has never seen this application', () => {
    expect(loadStatus(memory())).toBe('open');
  });

  it('reads back what was written', () => {
    const storage = memory();
    saveStatus(storage, 'skipped');

    expect(loadStatus(storage)).toBe('skipped');
  });

  it('opens rather than trusting a value it does not recognise', () => {
    // Anything else would leave someone with no keyboard, no wizard, and no
    // clue — over a storage key they never touched on purpose.
    expect(loadStatus(memory('finished'))).toBe('open');
  });

  it('does not throw when the browser refuses to write', () => {
    const hostile = {
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    };

    expect(() => saveStatus(hostile, 'done')).not.toThrow();
  });
});
