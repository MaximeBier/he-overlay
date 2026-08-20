import { describe, it, expect } from 'vitest';
import {
  clearKeyStyle,
  recomputeLabels,
  setGlobalStyle,
  setKeyLabel,
  setKeyMode,
  setKeyStyle,
  setLayoutOverride,
} from './edit';
import { defaultConfig, type OverlayConfig } from './schema';
import { hasOverrides } from './resolve';
import { labelFor } from '../keyboard/labels';

function config(): OverlayConfig {
  const base = defaultConfig();
  base.keys.push({ id: 1, usage: 0x14, mode: 'key', label: 'A', x: 0, y: 0, w: 1, h: 1 });
  base.keys.push({ id: 2, usage: 0x16, mode: 'key', label: 'S', x: 1, y: 0, w: 1, h: 1 });
  return base;
}

describe('style editing', () => {
  it('changes the global style', () => {
    expect(setGlobalStyle(config(), 'activeColor', '#ff0000').style.activeColor).toBe('#ff0000');
  });

  it('changes the global fill direction', () => {
    expect(setGlobalStyle(config(), 'fillDirection', 'left').style.fillDirection).toBe('left');
  });

  it('creates a key override', () => {
    const next = setKeyStyle(config(), [1], 'activeColor', '#ff0000');

    expect(next.keys[0]?.style).toEqual({ activeColor: '#ff0000' });
    expect(hasOverrides(next.keys[0]!)).toBe(true);
  });

  it('applies an override to a whole group', () => {
    const next = setKeyStyle(config(), [1, 2], 'fillDirection', 'right');

    expect(next.keys[0]?.style).toEqual({ fillDirection: 'right' });
    expect(next.keys[1]?.style).toEqual({ fillDirection: 'right' });
  });

  it('leaves keys outside the group untouched', () => {
    const next = setKeyStyle(config(), [1], 'opacity', 0.5);

    expect(next.keys[1]?.style).toBeUndefined();
  });

  it('removes an override and returns the key to inheritance', () => {
    let next = setKeyStyle(config(), [1], 'activeColor', '#ff0000');
    next = clearKeyStyle(next, [1], 'activeColor');

    expect(hasOverrides(next.keys[0]!)).toBe(false);
  });

  it('returns a whole group to inheritance in a single gesture', () => {
    let next = setKeyStyle(config(), [1, 2], 'activeColor', '#ff0000');
    next = clearKeyStyle(next, [1, 2], 'activeColor');

    expect(next.keys.every((key) => !hasOverrides(key))).toBe(true);
  });

  it('leaves the other overrides untouched when removing one', () => {
    let next = setKeyStyle(config(), [1], 'activeColor', '#ff0000');
    next = setKeyStyle(next, [1], 'opacity', 0.5);
    next = clearKeyStyle(next, [1], 'activeColor');

    expect(next.keys[0]?.style).toEqual({ opacity: 0.5 });
  });

  it('drops the override bag once it is empty rather than leaving it behind', () => {
    // `{}` is not the same as absent to anything that reads the raw shape: the
    // export would carry `"style": {}` for every key ever touched and put
    // back, and `hasOverrides` would be the only thing that could tell.
    let next = setKeyStyle(config(), [1], 'opacity', 0.5);
    next = clearKeyStyle(next, [1], 'opacity');

    expect(next.keys[0]?.style).toBeUndefined();
  });

  it('clears a property a key never overrode without inventing one', () => {
    const next = clearKeyStyle(config(), [1], 'radius');

    expect(next.keys[0]?.style).toBeUndefined();
  });

  it('never mutates the original configuration', () => {
    const before = config();
    setKeyStyle(before, [1], 'opacity', 0.2);

    expect(before.keys[0]?.style).toBeUndefined();
  });

  it('leaves the global style alone when a key is styled', () => {
    // The two writes share a shape, and an editor that pointed `apply` at the
    // wrong one would still look right on screen — the preview reads the
    // resolved style either way.
    const next = setKeyStyle(config(), [1], 'activeColor', '#ff0000');

    expect(next.style.activeColor).toBe(config().style.activeColor);
  });

  it('leaves the keys alone when the global style changes', () => {
    const next = setGlobalStyle(config(), 'activeColor', '#ff0000');

    expect(next.keys.every((key) => key.style === undefined)).toBe(true);
  });
});

describe('labels and modes', () => {
  it('renames a key by hand', () => {
    expect(setKeyLabel(config(), 1, 'Sprint').keys[0]?.label).toBe('Sprint');
  });

  it('switches a key to axis mode', () => {
    expect(setKeyMode(config(), [1], 'axis').keys[0]?.mode).toBe('axis');
  });

  it('switches a whole group to axis mode', () => {
    const next = setKeyMode(config(), [1, 2], 'axis');

    expect(next.keys.map((key) => key.mode)).toEqual(['axis', 'axis']);
  });

  it('leaves keys outside the group in their own mode', () => {
    const next = setKeyMode(config(), [1], 'axis');

    expect(next.keys[1]?.mode).toBe('key');
  });

  it('renames every key when the recompute is asked for', () => {
    const azerty = new Map([['KeyQ', 'a']]);
    const renamed = setKeyLabel(config(), 1, 'Sprint');

    // Explicit, and destructive by design: a manual rename is overwritten.
    // Nothing calls this on its own — changing the layout must never silently
    // undo a rename (spec §8.6), which is why it is a function and not an
    // effect of `layoutOverride`.
    expect(recomputeLabels(renamed, azerty).keys[0]?.label).toBe('A');
  });

  it('gives a key the layout ignores exactly what a fresh learn would give it', () => {
    // The S key is absent from that map, so it falls through to the position
    // name — no keycap entry covers letters. That is the point: recomputing
    // produces the same labels learning would, so the two can never disagree.
    // A real `getLayoutMap()` covers every letter; only a hand-built map, or
    // none at all, reaches this branch.
    const next = recomputeLabels(config(), new Map([['KeyQ', 'a']]));

    expect(next.keys[1]?.label).toBe('KeyS');
    expect(next.keys[1]?.label).toBe(labelFor(0x16, null));
  });
});

describe('choosing a layout', () => {
  const AZERTY = new Map([
    ['KeyQ', 'a'],
    ['KeyW', 'z'],
  ]);
  const QWERTY = new Map([
    ['KeyQ', 'q'],
    ['KeyW', 'w'],
  ]);

  it('records the choice', () => {
    expect(setLayoutOverride(config(), 'azerty', null).layoutOverride).toBe('azerty');
  });

  it('relabels the keys already added', () => {
    // The whole point of the fallback (spec §8.6): detection got it wrong, and
    // the keys carrying the wrong labels are the ones already on screen. A
    // selector that only affected future learns would do nothing at all for
    // the person who noticed the problem.
    const next = setLayoutOverride(config(), 'azerty', null);

    expect(next.keys[0]?.label).toBe('A');
  });

  it('goes back to detection on auto', () => {
    const detected = new Map([['KeyQ', 'q']]);
    const next = setLayoutOverride(
      setLayoutOverride(config(), 'azerty', detected),
      'auto',
      detected,
    );

    expect(next.keys[0]?.label).toBe('Q');
  });

  it('keeps the labels when detection is unavailable and auto is chosen', () => {
    // `resolveLayout('auto', null)` is null, and relabelling from nothing
    // turns every letter into its position name. Someone switching back to
    // auto on a browser without `getLayoutMap()` would watch their keyboard
    // turn into KeyQ, KeyS — worse than what they had, and irreversible.
    const named = setKeyLabel(config(), 1, 'Sprint');

    expect(setLayoutOverride(named, 'auto', null).keys[0]?.label).toBe('Sprint');
  });

  it('never overwrites a label the user typed', () => {
    // Reported on 2026-08-20: a key renamed by hand went back to its keycap on
    // the first layout change. A name someone typed is a decision, and a
    // layout change must not undo it (spec §8.6).
    const named = setKeyLabel({ ...config(), layoutOverride: 'azerty' as const }, 1, '↓');

    const next = setLayoutOverride(named, 'qwerty', AZERTY);

    expect(next.keys[0]?.label).toBe('↓');
  });

  it('still relabels the keys around it', () => {
    // The guard must not turn into "never relabel anything": the second key
    // was never touched by hand and has to follow.
    const azerty = { ...config(), layoutOverride: 'azerty' as const };
    const named = setKeyLabel(azerty, 1, '↓');

    const next = setLayoutOverride(named, 'qwerty', AZERTY);

    expect(next.keys[1]?.label).toBe('S');
  });

  it('relabels a key still wearing what the layout in force gave it', () => {
    const azerty = { ...config(), layoutOverride: 'azerty' as const };
    const asAzerty = { ...azerty, keys: azerty.keys.map((k) => ({ ...k, label: 'A' })) };

    const next = setLayoutOverride(asAzerty, 'qwerty', AZERTY);

    expect(next.keys[0]?.label).toBe('Q');
  });

  it('leaves a rename alone across two layout changes in a row', () => {
    // The rule compares against the layout in force, so each hop has to carry
    // the decision forward — otherwise a name survives one change and dies on
    // the next.
    let next = setKeyLabel({ ...config(), layoutOverride: 'auto' as const }, 1, '↓');
    next = setLayoutOverride(next, 'azerty', QWERTY);
    next = setLayoutOverride(next, 'qwerty', QWERTY);

    expect(next.keys[0]?.label).toBe('↓');
  });
});
