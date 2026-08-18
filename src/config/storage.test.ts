import { describe, it, expect } from 'vitest';
import { loadConfig, saveConfig, exportConfig, importConfig } from './storage';
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
