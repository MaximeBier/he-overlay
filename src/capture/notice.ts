import type { MigrationResult } from '../config/migrate';

export type Tone = 'success' | 'warning' | 'error';

/** One sentence and the tone to say it in. */
export interface Notice {
  tone: Tone;
  message: string;
}

/**
 * Two devices, two jobs (spec §16.6).
 *
 * The toast says something just happened and leaves; the profile line says
 * what the loaded profile is worth, and stays. One place doing both is the
 * failure the mockup removed: a "2 keys skipped" left on screen for hours, in
 * the same spot that later announces an unreadable file.
 */

/** Shared with the profile menu, which counts the same things the same way. */
export const keysLabel = (count: number) => `${count} key${count === 1 ? '' : 's'}`;

/** Nothing was imported, so nothing was lost — and that is the part to say. */
const KEPT = 'current profile kept';

export const READ_FAILED: Notice = {
  tone: 'error',
  message: `Import failed · the file could not be read · ${KEPT}`,
};

export function importToast(result: MigrationResult): Notice {
  if (!result.ok) {
    return {
      tone: 'error',
      message:
        result.reason === 'too-new'
          ? `Import failed · written by a newer version of HE Overlay · ${KEPT}`
          : `Import failed · unreadable file · ${KEPT}`,
    };
  }

  // A warning, never an error: the import worked. Calling it a failure is how
  // someone concludes their file is broken when it merely came from another
  // keyboard.
  return result.dropped > 0
    ? {
        tone: 'warning',
        message: `Profile imported · ${keysLabel(result.dropped)} skipped (not on this keyboard)`,
      }
    : { tone: 'success', message: 'Profile imported' };
}

/**
 * The toast for a saved profile that would not open (spec §16.6).
 *
 * It says where we landed, not merely what failed: the stored copy is put
 * aside by the store, and a message that omits that reads as "your layout is
 * gone" — which is the one thing that did not happen.
 */
export function loadToast(problem: 'unreadable' | 'too-new' | null): Notice | null {
  if (problem === null) return null;

  const cause =
    problem === 'too-new' ? 'written by a newer version of HE Overlay' : 'could not be read';
  return {
    tone: 'error',
    message: `Saved profile ${cause} · started from the defaults · the copy is kept aside`,
  };
}

/** Where the profile on screen came from, because the same count means two things. */
export interface Health {
  problem: 'unreadable' | 'too-new' | null;
  dropped: number;
  from: 'load' | 'import';
}

export function profileStatus(name: string, keyCount: number, health: Health): string {
  if (health.problem !== null) {
    const cause = health.problem === 'too-new' ? 'written by a newer version' : 'unreadable';
    return `${name} · ${cause} · started from the defaults`;
  }

  // Keys dropped by an import came from someone else's keyboard, which is
  // ordinary; keys dropped while loading were lost out of this very profile,
  // which is damage. Sending someone to look for an import they never made is
  // the worse of the two mistakes.
  const lost =
    health.dropped === 0
      ? ''
      : health.from === 'import'
        ? ` · ${health.dropped} skipped on the last import`
        : ` · ${health.dropped} could not be read`;

  return `${name} · ${keysLabel(keyCount)}${lost}`;
}
