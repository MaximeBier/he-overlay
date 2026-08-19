import { migrate, type MigrationResult } from './migrate';
import { defaultConfig, type OverlayConfig } from './schema';

const KEY = 'he-overlay:config';
/**
 * Where a configuration we refused to load is kept.
 *
 * Falling back to the defaults is right; letting the next save bury the file
 * we just declined to guess at is not. A rolled-back deployment, or a tab
 * running cached JavaScript, would otherwise cost an evening of layout work
 * between the warning and the first change the user makes.
 */
const BACKUP_KEY = 'he-overlay:config.backup';

/** Storage that can be read and written. Writing may fail; reading may not. */
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function write(storage: Pick<Storage, 'setItem'>, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Quota, or a browser that refuses to write at all. Saving is a
    // convenience: the caller is usually in the middle of applying a change
    // and broadcasting it, and throwing here would abort both — the change
    // would vanish with nothing to explain it.
  }
}

export interface LoadedConfig {
  config: OverlayConfig;
  problem: 'unreadable' | 'too-new' | null;
  /** Keys the stored file lost on the way in — malformed, or duplicated ids. */
  dropped: number;
}

/**
 * A hosted application stores nothing anywhere but the browser: clearing the
 * cache wipes every bit of layout work (spec §8.8).
 *
 * An unreadable configuration must never block the application. We fall back
 * to the defaults and report what happened, rather than leaving the user in
 * front of a page that does nothing.
 */
export function loadConfig(storage: Store): LoadedConfig {
  const raw = storage.getItem(KEY);
  if (!raw) return { config: defaultConfig(), problem: null, dropped: 0 };

  const result = importConfig(raw);

  if (!result.ok) {
    write(storage, BACKUP_KEY, raw);
    return { config: defaultConfig(), problem: result.reason, dropped: 0 };
  }

  // The cleaned version is the one in use, so it is the one that belongs in
  // storage. Left unwritten, the "keys were dropped" notice comes back on
  // every reload, about something the user cannot act on.
  if (result.dropped > 0) saveConfig(storage, result.config);

  return { config: result.config, problem: null, dropped: result.dropped };
}

export function saveConfig(storage: Pick<Storage, 'setItem'>, config: OverlayConfig): void {
  write(storage, KEY, exportConfig(config));
}

/** Indented on purpose: an exported profile is a file people open and edit. */
export function exportConfig(config: OverlayConfig): string {
  return JSON.stringify(config, null, 2);
}

export function importConfig(json: string): MigrationResult {
  try {
    return migrate(JSON.parse(json));
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
