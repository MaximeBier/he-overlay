import { migrate, type MigrationResult } from './migrate';
import { defaultConfig, type OverlayConfig } from './schema';

const KEY = 'he-overlay:config';

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
export function loadConfig(storage: Pick<Storage, 'getItem'>): LoadedConfig {
  const raw = storage.getItem(KEY);
  if (!raw) return { config: defaultConfig(), problem: null, dropped: 0 };

  const result = importConfig(raw);
  return result.ok
    ? { config: result.config, problem: null, dropped: result.dropped }
    : { config: defaultConfig(), problem: result.reason, dropped: 0 };
}

export function saveConfig(storage: Pick<Storage, 'setItem'>, config: OverlayConfig): void {
  try {
    storage.setItem(KEY, exportConfig(config));
  } catch {
    // Quota, or a browser that refuses to write at all. The caller is in the
    // middle of applying a change and broadcasting it; throwing here would
    // abort both, and the change would vanish with nothing to explain it.
  }
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
