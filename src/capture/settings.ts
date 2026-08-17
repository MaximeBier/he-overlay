import type { KeyboardStatus } from '../keyboard/device';
import { DEFAULT_OBS_PORT, normalizePort, type ObsStatus } from '../transport/obs';

const KEY = 'he-overlay:connection';

export interface ConnectionSettings {
  port: number;
  password: string;
}

/**
 * The password is written to local storage in the clear. For a server that only
 * listens on the loopback interface, on a personal machine, that is judged
 * acceptable — but the interface says so (spec §10).
 */
export function loadSettings(storage: Pick<Storage, 'getItem'>): ConnectionSettings {
  const fallback: ConnectionSettings = { port: DEFAULT_OBS_PORT, password: '' };
  const raw = storage.getItem(KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
    return {
      port: normalizePort(parsed.port),
      password: typeof parsed.password === 'string' ? parsed.password : '',
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: ConnectionSettings,
): void {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Quota, or a browser that refuses to write at all. Saving is a
    // convenience; the caller is in the middle of rebuilding the OBS client,
    // and throwing here would abort that — the user retypes their password and
    // nothing happens, with nothing to explain it.
  }
}

/**
 * Local storage, or an in-memory stand-in when the browser refuses.
 *
 * Reading `localStorage` at all throws when cookies are blocked — not the call,
 * the property access. Unguarded, that happens while the component initialises
 * and the capture page does not mount at all: a blank screen for a setting the
 * user may not even know they have. Credentials simply stop surviving a reload.
 */
export function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    const storage = globalThis.localStorage;
    storage.getItem(KEY);
    return storage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
    };
  }
}

/**
 * The URL to paste into an OBS browser source.
 *
 * **The password goes in the fragment.** A fragment is never sent to the server
 * — a property of HTTP, not a setting — whereas a query string arrives verbatim
 * in the access log of whoever hosts this page. Since we are that host, handing
 * out a query-string URL would collect our users' OBS credentials.
 *
 * The port stays in the query string: it is not a secret, and seeing it in a
 * log helps diagnose.
 */
export function overlayUrl(origin: string, settings: ConnectionSettings): string {
  const query = new URLSearchParams({ port: String(settings.port) });
  const url = `${origin}/overlay.html?${query}`;
  if (!settings.password) return url;

  const fragment = new URLSearchParams({ password: settings.password });
  return `${url}#${fragment}`;
}

export function keyboardHint(status: KeyboardStatus): string {
  switch (status) {
    case 'connected':
      return 'Keyboard connected.';
    case 'no-permission':
      return 'Click “Allow keyboard” and pick your Wooting.';
    case 'disconnected':
      return 'Plug in your Wooting keyboard.';
    case 'no-analog-interface':
      return 'This device exposes no analog interface. Open the diagnostics panel.';
    case 'unsupported':
      return 'WebHID is required. Use Chrome or Edge on desktop.';
  }
}

export function obsHint(status: ObsStatus): string {
  switch (status) {
    case 'identified':
      return 'Connected to OBS.';
    case 'connecting':
      return 'Connecting to OBS…';
    case 'auth-failed':
      return 'OBS refused the password. Check Tools → WebSocket Server Settings.';
    case 'unreachable':
      return 'OBS is not answering. Enable its WebSocket server in Tools, and allow local network access if the browser asks.';
    case 'disconnected':
      // Retrying rides on keyboard reports, never on a timer (spec §2.2), so
      // the way back is a keystroke — and saying so beats looking stuck.
      return 'OBS closed the connection. Press a key to reconnect.';
    case 'idle':
      return 'Not connected to OBS yet.';
  }
}
