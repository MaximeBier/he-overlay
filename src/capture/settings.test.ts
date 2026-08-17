import { describe, it, expect } from 'vitest';
import { loadSettings, saveSettings, overlayUrl, keyboardHint, obsHint } from './settings';
import { readOverlayParams } from '../overlay/params';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

describe('credential persistence', () => {
  it('falls back to port 4455 and an empty password', () => {
    expect(loadSettings(memoryStorage())).toEqual({ port: 4455, password: '' });
  });

  it('reads back what was saved', () => {
    const storage = memoryStorage();
    saveSettings(storage, { port: 4456, password: 'hunter2' });

    expect(loadSettings(storage)).toEqual({ port: 4456, password: 'hunter2' });
  });

  it('survives a corrupted value in storage', () => {
    expect(loadSettings(memoryStorage({ 'he-overlay:connection': '{{{' }))).toEqual({
      port: 4455,
      password: '',
    });
  });

  it('refuses a port no URL could carry', () => {
    const stored = JSON.stringify({ port: 99999, password: 'hunter2' });

    expect(loadSettings(memoryStorage({ 'he-overlay:connection': stored }))).toEqual({
      port: 4455,
      password: 'hunter2',
    });
  });
});

describe('overlayUrl', () => {
  it('carries the password in the fragment, never in the query string', () => {
    // A query string lands in the access log of whoever hosts the page — us.
    // This URL is the one place the capture page hands a password to the user,
    // so it is the one place that decides where their credentials travel.
    expect(overlayUrl('https://he-overlay.example', { port: 4455, password: 'a&b' })).toBe(
      'https://he-overlay.example/overlay.html?port=4455#password=a%26b',
    );
  });

  it('adds no fragment for an empty password', () => {
    expect(overlayUrl('http://localhost:5173', { port: 4455, password: '' })).toBe(
      'http://localhost:5173/overlay.html?port=4455',
    );
  });

  it('produces a URL the overlay reads back unchanged', () => {
    // The two sides encode independently; only a round trip proves they agree.
    const settings = { port: 4456, password: 'p@ss w&rd=#é' };
    const url = new URL(overlayUrl('https://he-overlay.example', settings));

    expect(readOverlayParams(url.search, url.hash)).toEqual(settings);
  });
});

describe('status bar wording', () => {
  it('says what to do, not what failed', () => {
    expect(keyboardHint('no-permission')).toMatch(/allow/i);
    expect(keyboardHint('disconnected')).toMatch(/plug|connect/i);
    expect(keyboardHint('unsupported')).toMatch(/chrome|edge/i);
    expect(keyboardHint('no-analog-interface')).toMatch(/analog/i);
    expect(obsHint('unreachable')).toMatch(/websocket server/i);
    // Chrome asks for local network access, and blocks until it is granted
    // (spec §2.1, §11).
    expect(obsHint('unreachable')).toMatch(/local network/i);
    expect(obsHint('auth-failed')).toMatch(/password/i);
  });

  it('tells a refused password apart from an unreachable server', () => {
    expect(obsHint('auth-failed')).not.toBe(obsHint('unreachable'));
  });

  it('tells a server that never answered apart from one that went away', () => {
    expect(obsHint('disconnected')).not.toBe(obsHint('unreachable'));
    // Nothing retries on its own: the reconnection rides on keyboard reports.
    expect(obsHint('disconnected')).toMatch(/key/i);
  });
});
