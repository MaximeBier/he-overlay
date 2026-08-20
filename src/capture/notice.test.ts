import { describe, it, expect } from 'vitest';
import { importToast, loadToast, profileStatus, READ_FAILED } from './notice';
import { defaultConfig } from '../config/schema';

describe('what an import says, once', () => {
  it('confirms a clean import in the success tone', () => {
    expect(importToast({ ok: true, config: defaultConfig(), dropped: 0 })).toEqual({
      tone: 'success',
      message: 'Profile imported',
    });
  });

  it('warns, rather than confirms, when keys were skipped', () => {
    // The import worked: nothing was lost, and calling it an error is how
    // someone concludes their file is broken when it is merely from another
    // keyboard (spec §16.6).
    expect(importToast({ ok: true, config: defaultConfig(), dropped: 2 })).toEqual({
      tone: 'warning',
      message: 'Profile imported · 2 keys skipped (not on this keyboard)',
    });
  });

  it('counts one skipped key without pluralising it', () => {
    expect(importToast({ ok: true, config: defaultConfig(), dropped: 1 }).message).toContain(
      '1 key skipped',
    );
  });

  it('says the current profile was kept when the file was unreadable', () => {
    // The one thing to say here is what did *not* happen. A bare "import
    // failed" leaves people reloading to check they still have their layout.
    expect(importToast({ ok: false, reason: 'unreadable' })).toEqual({
      tone: 'error',
      message: 'Import failed · unreadable file · current profile kept',
    });
  });

  it('names the version as the reason when that is what it is', () => {
    const message = importToast({ ok: false, reason: 'too-new' }).message;

    expect(message).toContain('newer version');
    expect(message).toContain('current profile kept');
  });

  it('has an error to show for a file the browser could not even read', () => {
    expect(READ_FAILED.tone).toBe('error');
  });
});

describe('what a profile says when it will not open', () => {
  it('stays quiet about a profile that opened normally', () => {
    expect(loadToast(null)).toBeNull();
  });

  it('says it out loud, and never as a loss', () => {
    // Nothing was overwritten: the stored copy is kept aside. Saying "unreadable"
    // without saying that is how someone concludes their work is gone.
    const notice = loadToast('unreadable')!;

    expect(notice.tone).toBe('error');
    expect(notice.message).toContain('kept aside');
  });

  it('separates a profile ahead of this build from a broken one', () => {
    expect(loadToast('too-new')!.message).toContain('newer version');
  });
});

describe('what the profile menu says, permanently', () => {
  it('names the profile and counts its keys', () => {
    expect(profileStatus('Apex', 6, { problem: null, dropped: 0, from: 'load' })).toBe(
      'Apex · 6 keys',
    );
  });

  it('counts a single key without pluralising it', () => {
    expect(profileStatus('Apex', 1, { problem: null, dropped: 0, from: 'load' })).toBe(
      'Apex · 1 key',
    );
  });

  it('keeps the skipped count long after the toast has gone', () => {
    // The whole reason the two exist side by side: the toast says it happened,
    // the line says what the profile is worth (spec §16.6).
    expect(profileStatus('Apex', 4, { problem: null, dropped: 2, from: 'import' })).toBe(
      'Apex · 4 keys · 2 skipped on the last import',
    );
  });

  it('does not blame an import for keys the saved profile itself had lost', () => {
    // The same count reaches this line from two places, and they mean opposite
    // things: a file from another keyboard is normal, a saved profile that lost
    // keys is damage. Sending someone to look for an import they never did is
    // the worse of the two mistakes.
    expect(profileStatus('Apex', 4, { problem: null, dropped: 2, from: 'load' })).toBe(
      'Apex · 4 keys · 2 could not be read',
    );
  });

  it('says where an unreadable saved profile left us', () => {
    expect(profileStatus('Apex', 0, { problem: 'unreadable', dropped: 0, from: 'load' })).toBe(
      'Apex · unreadable · started from the defaults',
    );
  });

  it('separates a profile from a newer version from a broken one', () => {
    // They fail identically on screen and mean opposite things: one is corrupt,
    // the other is intact and simply ahead of this build.
    expect(profileStatus('Apex', 0, { problem: 'too-new', dropped: 0, from: 'load' })).toBe(
      'Apex · written by a newer version · started from the defaults',
    );
  });
});
