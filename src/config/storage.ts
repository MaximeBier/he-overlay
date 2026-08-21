import { migrate, type MigrationResult } from './migrate';
import { defaultConfig, type OverlayConfig } from './schema';

const KEY = 'he-overlay:config';
const PROFILES_KEY = 'he-overlay:profiles';
const ACTIVE_KEY = 'he-overlay:active-profile';
const DEFAULT_PROFILE = 'Default';

const profileKey = (name: string) => `he-overlay:profile:${name}`;

/**
 * Where a configuration we refused to load is kept.
 *
 * Falling back to the defaults is right; letting the next save bury the file
 * we just declined to guess at is not. A rolled-back deployment, or a tab
 * running cached JavaScript, would otherwise cost an evening of layout work
 * between the warning and the first change the user makes.
 *
 * **A namespace of its own, not a suffix.** `he-overlay:profile:X` plus
 * ".backup" is character for character `profileKey('X.backup')`, and nothing
 * stops anyone naming a profile that: the salvage copy of one profile landed
 * on top of a real one, and removing the first erased the second. Found in
 * review on 2026-08-21.
 */
const backupKey = (key: string) => `he-overlay:backup:${key}`;

/** Storage that can be read and written. Writing may fail; reading may not. */
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Profiles also delete: a single configuration never had anything to remove. */
type ProfileStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Writes, and says whether it landed.
 *
 * Swallowing the error is right — the caller is usually mid-change and
 * throwing would abort a broadcast too — but **swallowing it silently is
 * not**, for the callers that go on to delete something. A rename whose copy
 * never landed used to remove the source anyway and report success.
 */
function write(storage: Pick<Storage, 'setItem'>, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    // Quota, or a browser that refuses to write at all.
    return false;
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
function loadAt(storage: Store, key: string): LoadedConfig {
  const raw = storage.getItem(key);
  if (!raw) return { config: defaultConfig(), problem: null, dropped: 0 };

  const result = importConfig(raw);

  if (!result.ok) {
    write(storage, backupKey(key), raw);
    return { config: defaultConfig(), problem: result.reason, dropped: 0 };
  }

  // The cleaned version is the one in use, so it is the one that belongs in
  // storage. Left unwritten, the "keys were dropped" notice comes back on
  // every reload, about something the user cannot act on.
  if (result.dropped > 0) write(storage, key, exportConfig(result.config));

  return { config: result.config, problem: null, dropped: result.dropped };
}

export function loadConfig(storage: Store): LoadedConfig {
  return loadAt(storage, KEY);
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

/**
 * One configuration per game (spec §8.8).
 *
 * Every name is taken as given and never reused: creating over an existing
 * profile would replace a layout with an empty one, which is the only way this
 * feature can lose work that nothing else can recover.
 */
export interface ProfileStore {
  list(): string[];
  active(): string;
  /** Persists the choice. A switch nobody wrote down is undone by the next reload. */
  select(name: string): void;
  /** For the menu, which quotes it beside every name. Never rewrites storage. */
  keyCount(name: string): number;
  load(name: string): LoadedConfig;
  save(name: string, config: OverlayConfig): void;
  /** Returns the name actually used, which may not be the one asked for. */
  create(name: string): string;
  duplicate(from: string): string;
  remove(name: string): void;
  /** False when the name was empty or already belonged to another profile. */
  rename(from: string, to: string): boolean;
}

function freeName(taken: readonly string[], wanted: string): string {
  const base = wanted.trim() || 'Profile';
  if (!taken.includes(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/**
 * Everything saved before profiles existed becomes the default profile.
 *
 * Runs once, on the absence of the profile list — not on the absence of the
 * default profile, which someone may legitimately have emptied. The old key is
 * copied rather than moved: it costs a few kilobytes and it is what a
 * rolled-back deployment reads.
 */
function adoptSingleConfig(storage: ProfileStorage): void {
  if (storage.getItem(PROFILES_KEY) !== null) return;
  write(storage, PROFILES_KEY, JSON.stringify([DEFAULT_PROFILE]));

  const existing = storage.getItem(KEY);
  if (existing !== null) write(storage, profileKey(DEFAULT_PROFILE), existing);
}

export function createProfileStore(storage: ProfileStorage): ProfileStore {
  adoptSingleConfig(storage);

  function names(): string[] {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(PROFILES_KEY) ?? '');
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((n) => typeof n === 'string')
      ) {
        return parsed as string[];
      }
    } catch {
      // An unreadable list must not lock the application out of its own
      // configuration: one profile is always better than none.
    }
    return [DEFAULT_PROFILE];
  }

  function writeNames(list: readonly string[]): boolean {
    return write(storage, PROFILES_KEY, JSON.stringify(list));
  }

  function activeName(): string {
    const current = storage.getItem(ACTIVE_KEY);
    const list = names();
    return current !== null && list.includes(current) ? current : list[0]!;
  }

  function add(name: string, raw: string): string {
    const list = names();
    const chosen = freeName(list, name);
    writeNames([...list, chosen]);
    write(storage, profileKey(chosen), raw);
    write(storage, ACTIVE_KEY, chosen);
    return chosen;
  }

  return {
    list: names,
    active: activeName,

    select(name) {
      if (names().includes(name)) write(storage, ACTIVE_KEY, name);
    },

    keyCount(name) {
      const raw = storage.getItem(profileKey(name));
      if (raw === null) return 0;
      const result = importConfig(raw);
      return result.ok ? result.config.keys.length : 0;
    },

    load(name) {
      return loadAt(storage, profileKey(name));
    },

    save(name, config) {
      write(storage, profileKey(name), exportConfig(config));
    },

    create(name) {
      return add(name, exportConfig(defaultConfig()));
    },

    duplicate(from) {
      return add(
        `${from} copy`,
        storage.getItem(profileKey(from)) ?? exportConfig(defaultConfig()),
      );
    },

    remove(name) {
      const remaining = names().filter((entry) => entry !== name);
      // Removing the last profile would leave the application without a
      // configuration, and nothing to switch to.
      if (remaining.length === 0) return;

      // The list first, and only delete if it took: a shortened list that
      // never landed alongside a deletion that did leaves a name pointing at
      // nothing, for good.
      if (!writeNames(remaining)) return;
      storage.removeItem(profileKey(name));
      storage.removeItem(backupKey(profileKey(name)));
      if (activeName() === name) write(storage, ACTIVE_KEY, remaining[0]!);
    },

    rename(from, to) {
      const list = names();
      const target = to.trim();
      if (!target || !list.includes(from)) return false;
      // Nothing to do, and not a failure: an unchanged field is not an error,
      // and reporting one would answer someone who changed nothing.
      if (target === from) return true;
      // A rename onto a name already taken is a merge nobody asked for: the
      // other profile would disappear under this one.
      if (list.includes(target)) return false;

      const wasActive = activeName() === from;
      const raw = storage.getItem(profileKey(from));

      // Copy, then list, then remove — and stop at the first refusal. Deleting
      // the source before the copy is safely down is how a rename becomes a
      // deletion, silently, on a storage that has simply run out of room.
      if (raw !== null && !write(storage, profileKey(target), raw)) return false;
      if (!writeNames(list.map((entry) => (entry === from ? target : entry)))) return false;

      storage.removeItem(profileKey(from));
      if (wasActive) write(storage, ACTIVE_KEY, target);
      return true;
    },
  };
}
