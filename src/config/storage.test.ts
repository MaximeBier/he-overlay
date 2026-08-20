import { describe, it, expect } from 'vitest';
import { loadConfig, saveConfig, exportConfig, importConfig, createProfileStore } from './storage';
import { defaultConfig, CONFIG_VERSION, type KeyConfig } from './schema';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

const aKey: KeyConfig = {
  id: 174,
  usage: 0x50,
  mode: 'key',
  label: 'Q',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

describe('configuration persistence', () => {
  it('returns the default configuration when nothing is saved', () => {
    expect(loadConfig(memoryStorage())).toEqual({
      config: defaultConfig(),
      problem: null,
      dropped: 0,
    });
  });

  it('reads back what was saved', () => {
    const storage = memoryStorage();
    const config = defaultConfig();
    config.keys.push(aKey);
    saveConfig(storage, config);

    expect(loadConfig(storage).config.keys).toHaveLength(1);
  });

  it('reports an unreadable configuration without losing the use of the application', () => {
    const result = loadConfig(memoryStorage({ 'he-overlay:config': '{{{' }));

    expect(result.problem).toBe('unreadable');
    expect(result.config).toEqual(defaultConfig());
  });

  it('reports a configuration written by a newer version', () => {
    const raw = JSON.stringify({ version: CONFIG_VERSION + 1, layout: 'iso', style: {}, keys: [] });

    expect(loadConfig(memoryStorage({ 'he-overlay:config': raw })).problem).toBe('too-new');
  });

  it('says how many keys the stored configuration lost on the way in', () => {
    const raw = JSON.stringify({ version: 1, layout: 'iso', style: {}, keys: [aKey, { id: 9 }] });

    const result = loadConfig(memoryStorage({ 'he-overlay:config': raw }));

    expect(result.config.keys).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it('does not throw when the browser refuses to write', () => {
    const hostile = {
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    };

    expect(() => saveConfig(hostile, defaultConfig())).not.toThrow();
  });
});

describe('import and export', () => {
  it('exports a readable, re-importable JSON', () => {
    const config = defaultConfig();
    config.keys.push({ id: 9, usage: 0x1a, mode: 'axis', label: 'Z', x: 1, y: 0, w: 1, h: 1 });

    const result = importConfig(exportConfig(config));

    expect(result).toEqual({ ok: true, config, dropped: 0 });
  });

  it('exports something a human can read and edit', () => {
    expect(exportConfig(defaultConfig())).toContain('\n  "version"');
  });

  it('rejects an invalid JSON without throwing', () => {
    expect(importConfig('not json')).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('runs the import through the migrations', () => {
    const legacy = JSON.stringify({ style: {}, keys: [] });

    const result = importConfig(legacy);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.version).toBe(CONFIG_VERSION);
  });

  it('carries the dropped count out of an import', () => {
    // Silently returning an amputated keyboard is the failure spec §11 rules
    // out: the interface has to be able to say how many keys went missing.
    const raw = JSON.stringify({ version: 1, layout: 'iso', style: {}, keys: [aKey, aKey] });

    const result = importConfig(raw);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dropped).toBe(1);
  });
});

describe('what loading leaves behind in storage', () => {
  const aStore = (raw: string) => {
    const map = new Map([['he-overlay:config', raw]]);
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      map,
    };
  };

  it('writes the cleaned configuration back, so the warning does not return forever', () => {
    // Cleaning only in memory means the notice reappears on every reload, about
    // something the user has no way to fix.
    const storage = aStore(
      JSON.stringify({ version: 1, layout: 'iso', style: {}, keys: [aKey, aKey] }),
    );

    expect(loadConfig(storage).dropped).toBe(1);
    expect(loadConfig(storage).dropped).toBe(0);
  });

  it('leaves storage untouched when there was nothing to clean', () => {
    const raw = exportConfig(defaultConfig());
    const storage = aStore(raw);

    loadConfig(storage);

    expect(storage.map.get('he-overlay:config')).toBe(raw);
  });

  it('puts a configuration from a newer version aside before anything overwrites it', () => {
    // Falling back to the defaults is right; letting the next save bury a
    // profile we just refused to guess at is not. A rolled-back deployment
    // would cost an evening of layout work.
    const raw = JSON.stringify({ version: CONFIG_VERSION + 1, layout: 'iso', style: {}, keys: [] });
    const storage = aStore(raw);

    const result = loadConfig(storage);

    expect(result.problem).toBe('too-new');
    expect(storage.map.get('he-overlay:config.backup')).toBe(raw);
  });

  it('keeps an unreadable configuration aside too, in case it can be salvaged', () => {
    const storage = aStore('{{{');

    loadConfig(storage);

    expect(storage.map.get('he-overlay:config.backup')).toBe('{{{');
  });

  it('survives a storage that refuses to be written to while loading', () => {
    const storage = {
      getItem: () => '{{{',
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    };

    expect(() => loadConfig(storage)).not.toThrow();
  });
});

/** The full surface a profile store needs: it deletes keys, the config store never does. */
function profileStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  };
}

function withKeys(...keys: KeyConfig[]) {
  const config = defaultConfig();
  config.keys.push(...keys);
  return config;
}

const anotherKey: KeyConfig = { ...aKey, id: 175, usage: 0x1a, label: 'Z' };

describe('named profiles', () => {
  it('starts with a default profile active', () => {
    const store = createProfileStore(profileStorage());

    expect(store.list()).toEqual(['Default']);
    expect(store.active()).toBe('Default');
  });

  it('creates a profile and makes it active', () => {
    const store = createProfileStore(profileStorage());

    expect(store.create('Valorant')).toBe('Valorant');
    expect(store.list()).toEqual(['Default', 'Valorant']);
    expect(store.active()).toBe('Valorant');
  });

  it('keeps configurations separate between profiles', () => {
    const store = createProfileStore(profileStorage());
    store.save('Default', withKeys(aKey));
    store.create('Valorant');

    expect(store.load('Valorant').config.keys).toEqual([]);
    expect(store.load('Default').config.keys).toHaveLength(1);
  });

  it('renames without losing the configuration', () => {
    const store = createProfileStore(profileStorage());
    store.save('Default', withKeys(aKey));

    store.rename('Default', 'Main');

    expect(store.list()).toEqual(['Main']);
    expect(store.active()).toBe('Main');
    expect(store.load('Main').config.keys).toHaveLength(1);
  });

  it('refuses to remove the last profile', () => {
    const store = createProfileStore(profileStorage());
    store.save('Default', withKeys(aKey));

    store.remove('Default');

    expect(store.list()).toEqual(['Default']);
    expect(store.load('Default').config.keys).toHaveLength(1);
  });

  it('switches the active profile to a survivor after removal', () => {
    const store = createProfileStore(profileStorage());
    store.create('Valorant');
    store.remove('Valorant');

    expect(store.active()).toBe('Default');
  });

  it('remembers the profile that was selected, across a reload', () => {
    // Switching profiles without writing the choice down means the next launch
    // silently reopens the previous one — with the overlay following it.
    const storage = profileStorage();
    createProfileStore(storage).create('Valorant');
    createProfileStore(storage).select('Default');

    expect(createProfileStore(storage).active()).toBe('Default');
  });

  it('falls back to the first profile when the active one is gone', () => {
    const store = createProfileStore(
      profileStorage({
        'he-overlay:profiles': JSON.stringify(['Default']),
        'he-overlay:active-profile': 'Deleted by hand',
      }),
    );

    expect(store.active()).toBe('Default');
  });
});

describe('profiles that must not eat one another', () => {
  it('creates a free name rather than overwriting a profile that exists', () => {
    // The mockup offers "New profile…" as a plain text field: two people, two
    // months apart, will type the same name. Reusing it would silently replace
    // a layout with an empty one — the worst outcome of the whole feature.
    const store = createProfileStore(profileStorage());
    store.save('Default', withKeys(aKey));

    const created = store.create('Default');

    expect(created).toBe('Default 2');
    expect(store.load('Default').config.keys).toHaveLength(1);
  });

  it('names an empty profile rather than creating a nameless one', () => {
    const store = createProfileStore(profileStorage());

    expect(store.create('   ')).toBe('Profile');
  });

  it('duplicates a profile with its keys, under a name of its own', () => {
    const store = createProfileStore(profileStorage());
    store.save('Default', withKeys(aKey, anotherKey));

    const copy = store.duplicate('Default');

    expect(copy).toBe('Default copy');
    expect(store.active()).toBe('Default copy');
    expect(store.load(copy).config.keys).toHaveLength(2);
    expect(store.load('Default').config.keys).toHaveLength(2);
  });

  it('refuses a rename onto a name already taken', () => {
    const store = createProfileStore(profileStorage());
    store.create('Valorant');
    store.save('Valorant', withKeys(aKey));

    store.rename('Valorant', 'Default');

    expect(store.list()).toEqual(['Default', 'Valorant']);
    expect(store.load('Valorant').config.keys).toHaveLength(1);
  });
});

describe('profiles adopt what came before them', () => {
  const legacy = () =>
    profileStorage({ 'he-overlay:config': exportConfig(withKeys(aKey, anotherKey)) });

  it('adopts a pre-profile configuration as the default profile', () => {
    // Everyone upgrading from v0.5 has their whole layout under the old key.
    // Starting them on an empty Default would read as "the update deleted my
    // keyboard", and the backup that saves the other failures is not written
    // here: nothing failed.
    const store = createProfileStore(legacy());

    expect(store.list()).toEqual(['Default']);
    expect(store.load('Default').config.keys).toHaveLength(2);
  });

  it('leaves the old key where it was, so a rollback still finds it', () => {
    const storage = legacy();
    const before = storage.map.get('he-overlay:config');

    createProfileStore(storage);

    expect(storage.map.get('he-overlay:config')).toBe(before);
  });

  it('never adopts twice, so an old key cannot come back over a real profile', () => {
    const storage = legacy();
    createProfileStore(storage).save('Default', defaultConfig());

    expect(createProfileStore(storage).load('Default').config.keys).toEqual([]);
  });
});

describe('what a profile says about itself', () => {
  it('counts the keys of a profile that is not the active one', () => {
    const store = createProfileStore(profileStorage());
    store.save('Default', withKeys(aKey, anotherKey));
    store.create('Valorant');

    expect(store.keyCount('Default')).toBe(2);
    expect(store.keyCount('Valorant')).toBe(0);
  });

  it('reports an unreadable profile instead of pretending it was empty', () => {
    // Spec §16.6: the profile menu line has to be able to say that we started
    // from the defaults. Swallowing the failure into an empty configuration is
    // indistinguishable from a profile someone really did empty.
    const store = createProfileStore(
      profileStorage({
        'he-overlay:profiles': JSON.stringify(['Default']),
        'he-overlay:profile:Default': '{{{',
      }),
    );

    const loaded = store.load('Default');

    expect(loaded.problem).toBe('unreadable');
    expect(loaded.config).toEqual(defaultConfig());
  });

  it('keeps an unreadable profile aside, as the single configuration did', () => {
    const storage = profileStorage({
      'he-overlay:profiles': JSON.stringify(['Default']),
      'he-overlay:profile:Default': '{{{',
    });

    createProfileStore(storage).load('Default');

    expect(storage.map.get('he-overlay:profile:Default.backup')).toBe('{{{');
  });
});
