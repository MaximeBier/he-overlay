<script lang="ts">
  import { clearKeyStyle, setKeyLabel, setKeyMode, setKeyStyle } from '../config/edit';
  import { effectiveStyle, overriddenKeys } from '../config/resolve';
  import { removeKeys } from './learn';
  import { moveKey, resizeKeys, GRID } from './layout';
  import { labelFor, type LayoutMapLike } from '../keyboard/labels';
  import type { FillDirection, KeyMode, KeyStyle, OverlayConfig } from '../config/schema';

  /**
   * Everything that belongs to the selection: mode, colour, fill direction,
   * label, size, deletion. The global settings live in `StylePanel`, and the
   * two never share a write path (spec §16.4).
   */
  let {
    config,
    selectedIds,
    onChange,
    onClose,
    layout = null,
    suggestAxis = false,
    onDismissSuggestion = () => {},
  }: {
    config: OverlayConfig;
    selectedIds: number[];
    onChange: (next: OverlayConfig) => void;
    onClose: () => void;
    /** What the keyboard says this position produces, for the way back. */
    layout?: LayoutMapLike | null;
    /** The key travels its whole depth and never fires (spec §7.4). */
    suggestAxis?: boolean;
    onDismissSuggestion?: () => void;
  } = $props();

  const selection = $derived(config.keys.filter((key) => selectedIds.includes(key.id)));
  /**
   * The first key of the selection supplies the displayed values; every change
   * applies to all of them. Showing a group's shared value only where they
   * agree was considered and dropped: a blank field that means "they differ"
   * is indistinguishable from one that means "nothing is set".
   */
  const lead = $derived(selection[0] ?? null);
  const effective = $derived(lead ? effectiveStyle(config.style, lead) : null);
  const overridden = $derived(lead ? overriddenKeys(lead) : []);
  const single = $derived(selection.length === 1 ? selection[0]! : null);

  /**
   * The label the detected layout gives this position, when it differs from
   * what the key wears — that is, when the key has been renamed by hand.
   *
   * Null with no layout: there is nothing to go back to, and the position name
   * `labelFor` would produce is worse than anything the user typed.
   */
  const detectedLabel = $derived.by(() => {
    if (!single || layout === null) return null;
    const detected = labelFor(single.usage, layout);
    return detected === single.label ? null : detected;
  });
  const mode = $derived<KeyMode>(
    selection.length > 0 && selection.every((key) => key.mode === 'axis') ? 'axis' : 'key',
  );

  function apply<K extends keyof KeyStyle>(property: K, value: KeyStyle[K]) {
    onChange(setKeyStyle(config, selectedIds, property, value));
  }

  const DIRECTIONS: [FillDirection, string][] = [
    ['up', '↑'],
    ['down', '↓'],
    ['left', '←'],
    ['right', '→'],
  ];

  function typed(input: HTMLInputElement, fallback: number): number | null {
    if (input.value !== '') return Number(input.value);
    input.value = String(fallback);
    return null;
  }
</script>

{#if lead && effective}
  <div class="popover" role="dialog" aria-label="Key style">
    <header>
      <span class="title">{single ? single.label : `${selection.length} keys`}</span>
      {#if overridden.length > 0}
        <!-- Same amber as the marker on the key itself: one colour means one
             thing, "this differs from the global" (spec §8.2). -->
        <span class="badge">override</span>
      {/if}
    </header>

    <div class="segmented" role="group" aria-label="Display mode">
      {#each [['key', 'Key'], ['axis', 'Axis']] as [value, label] (value)}
        <button
          type="button"
          data-mode={value}
          class:on={mode === value}
          aria-pressed={mode === value}
          onclick={() => onChange(setKeyMode(config, selectedIds, value as KeyMode))}
        >
          {label}
        </button>
      {/each}
    </div>

    {#if suggestAxis && mode === 'key'}
      <!-- Worded as the observation, not as a conclusion: the keyboard says
           this key travelled its whole depth and never fired. It does not say
           the key is bound to a stick, and nothing here can find out. Never a
           switch, always an offer (spec §7.4).

           Gated on the mode here rather than on the suggester's side, so the
           panel cannot contradict the toggle sitting above it. "This key never
           fires" stays true after the advice is taken — the suggester has no
           reason to withdraw it, and would go on offering a switch that has
           already happened. -->
      <p class="suggestion" data-suggestion>
        This key does not send a keystroke.
        <span class="actions">
          <button
            type="button"
            class="link"
            data-accept-suggestion
            onclick={() => onChange(setKeyMode(config, selectedIds, 'axis'))}
          >
            Show as axis
          </button>
          <button
            type="button"
            class="link quiet"
            data-dismiss-suggestion
            onclick={onDismissSuggestion}
          >
            Keep as key
          </button>
        </span>
      </p>
    {/if}

    <div class="row">
      <label for="key-activeColor">Active</label>
      <div class="value">
        <input
          id="key-activeColor"
          name="activeColor"
          type="color"
          value={effective.activeColor}
          onchange={(event) => apply('activeColor', event.currentTarget.value)}
        />
        {#if overridden.includes('activeColor')}
          <button
            type="button"
            class="link"
            data-reset="activeColor"
            onclick={() => onChange(clearKeyStyle(config, selectedIds, 'activeColor'))}
          >
            Reset to global
          </button>
        {/if}
      </div>
    </div>

    <div class="row">
      <span class="label" id="key-fillDirection">Fill</span>
      <div class="segmented small" role="group" aria-labelledby="key-fillDirection">
        {#each DIRECTIONS as [value, glyph] (value)}
          <button
            type="button"
            data-direction={value}
            class:on={effective.fillDirection === value}
            aria-pressed={effective.fillDirection === value}
            aria-label={value}
            onclick={() => apply('fillDirection', value)}
          >
            {glyph}
          </button>
        {/each}
      </div>
    </div>

    {#if single}
      <div class="row">
        <label for="key-label">Label</label>
        <input
          id="key-label"
          name="label"
          type="text"
          value={single.label}
          onchange={(event) => onChange(setKeyLabel(config, single.id, event.currentTarget.value))}
        />
      </div>

      {#if detectedLabel !== null}
        <!-- The counterpart of "Reset to global" for the one property that is
             not a style. Without it a rename only comes undone by retyping the
             detected label exactly — and a layout change will not do it, since
             a typed name is deliberately left alone (spec §8.6). -->
        <div class="row end">
          <button
            type="button"
            class="link"
            data-reset="label"
            onclick={() => onChange(setKeyLabel(config, single.id, detectedLabel))}
          >
            Reset to detected · <code>{detectedLabel}</code>
          </button>
        </div>
      {/if}

      <!-- Dragging alone becomes frustrating the moment two keys have to line
           up exactly, which is why the spec asks for numeric fields (§8.7).
           Single selection only: a group shares a size, not a position. -->
      <div class="row">
        <span class="label" id="key-position">Position</span>
        <div class="value" aria-labelledby="key-position">
          <input
            name="x"
            type="number"
            step={GRID}
            aria-label="X"
            value={single.x}
            onchange={(event) => {
              const x = typed(event.currentTarget, single.x);
              if (x !== null) onChange(moveKey(config, single.id, x, single.y));
            }}
          />
          <span class="times">,</span>
          <input
            name="y"
            type="number"
            step={GRID}
            aria-label="Y"
            value={single.y}
            onchange={(event) => {
              const y = typed(event.currentTarget, single.y);
              if (y !== null) onChange(moveKey(config, single.id, single.x, y));
            }}
          />
        </div>
      </div>
    {/if}

    <div class="row">
      <span class="label" id="key-size">Size</span>
      <div class="value" aria-labelledby="key-size">
        <input
          name="width"
          type="number"
          step={GRID}
          min={GRID}
          aria-label="Width"
          value={lead.w}
          onchange={(event) => {
            const w = typed(event.currentTarget, lead.w);
            if (w !== null) onChange(resizeKeys(config, selectedIds, w, lead.h));
          }}
        />
        <span class="times">×</span>
        <input
          name="height"
          type="number"
          step={GRID}
          min={GRID}
          aria-label="Height"
          value={lead.h}
          onchange={(event) => {
            const h = typed(event.currentTarget, lead.h);
            if (h !== null) onChange(resizeKeys(config, selectedIds, lead.w, h));
          }}
        />
      </div>
    </div>

    <button
      type="button"
      class="danger"
      data-delete
      onclick={() => {
        onChange(removeKeys(config, selectedIds));
        // Anchored to a selection that no longer exists, it would sit over an
        // empty patch of stage with a stale label in it.
        onClose();
      }}
    >
      Delete{selection.length > 1 ? ` ${selection.length} keys` : ''} · Suppr
    </button>
  </div>
{/if}

<style>
  .popover {
    display: grid;
    gap: 9px;
    inline-size: 248px;
    padding: 13px;
    background: var(--he-popover, #141722);
    border: 1px solid var(--he-border-popover, #262b3a);
    border-radius: var(--he-radius-panel, 6px);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .title {
    font-size: var(--he-size-md, 17px);
    font-weight: 600;
    color: var(--he-text, #dde1e9);
  }
  .badge {
    font-size: var(--he-size-xs, 14px);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--he-override, #d9a05b);
    border: 1px solid var(--he-override, #d9a05b);
    border-radius: 20px;
    padding: 1px 7px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  label,
  .label {
    font-size: var(--he-size-md, 17px);
    color: var(--he-text-muted, #8b90a0);
  }
  .value {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .segmented {
    display: flex;
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius-control, 5px);
    overflow: hidden;
  }
  .segmented button {
    flex: 1;
    font: inherit;
    font-size: var(--he-size-md, 17px);
    color: var(--he-text-muted, #8b90a0);
    background: none;
    border: 0;
    padding: 5px 10px;
    cursor: pointer;
  }
  .segmented button:hover {
    color: var(--he-text, #dde1e9);
  }
  .segmented button.on {
    color: var(--he-bg, #0e1015);
    background: var(--he-accent, #7c9eff);
  }
  .segmented.small button {
    padding: 4px 8px;
  }
  .suggestion {
    margin: 0;
    display: grid;
    gap: 6px;
    font-size: var(--he-size-sm, 15.5px);
    line-height: 1.4;
    color: var(--he-text-muted, #8b90a0);
    background: var(--he-surface, #151823);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 8px 9px;
  }
  .actions {
    display: flex;
    gap: 12px;
  }
  /* The label is a value, not prose, and it reads as prose without this: the
     button said "Reset to detected · A" and the A disappeared into the
     sentence. Same mono face as the field it puts the value back into, one
     row above, so the two are visibly the same kind of thing. */
  [data-reset='label'] code {
    font: var(--he-font-mono, 400 15px ui-monospace, monospace);
    color: var(--he-text, #dde1e9);
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: 3px;
    padding: 1px 5px;
    margin-inline-start: 2px;
  }
  .row.end {
    justify-content: flex-end;
  }
  .link.quiet {
    color: var(--he-text-faint, #5a5f70);
  }
  .link.quiet:hover {
    color: var(--he-text-muted, #8b90a0);
  }
  .link {
    font: inherit;
    font-size: var(--he-size-sm, 15.5px);
    color: var(--he-accent, #7c9eff);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .link:hover {
    color: var(--he-accent-hover, #a5bcff);
  }
  .danger {
    font: inherit;
    font-size: var(--he-size-md, 17px);
    color: var(--he-danger, #e06c5b);
    background: none;
    border: 1px solid #3a2226;
    border-radius: var(--he-radius-control, 5px);
    padding: 6px 10px;
    cursor: pointer;
  }
  .times {
    font-size: var(--he-size-sm, 15.5px);
    color: var(--he-text-ghost, #4a4f60);
  }
  input[type='color'] {
    inline-size: 30px;
    block-size: 22px;
    padding: 0;
    background: none;
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    cursor: pointer;
  }
  input[type='text'],
  input[type='number'] {
    inline-size: 56px;
    font: var(--he-font-mono, 400 15px ui-monospace, monospace);
    color: var(--he-text, #dde1e9);
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 4px 6px;
  }
  input[type='text'] {
    inline-size: 118px;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 1px;
  }
</style>
