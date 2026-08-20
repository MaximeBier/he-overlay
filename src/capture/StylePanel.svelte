<script lang="ts">
  import { setGlobalStyle } from '../config/edit';
  import type { FillDirection, OverlayConfig } from '../config/schema';

  /**
   * Global appearance, and nothing else.
   *
   * The per-key editor is `KeyPopover`, a separate component anchored to the
   * selection (spec §16.4). They were one component in the plan, sharing an
   * `apply` that chose its target from the selection — a tempting shape, and a
   * dangerous one: writing to the wrong side looks identical on screen,
   * because the preview renders the resolved style either way. Splitting them
   * makes the mistake unwritable rather than merely unlikely.
   */
  let {
    config,
    onChange,
  }: {
    config: OverlayConfig;
    onChange: (next: OverlayConfig) => void;
  } = $props();

  const COLORS: [
    keyof typeof config.style & ('activeColor' | 'fillColor' | 'restColor'),
    string,
  ][] = [
    ['activeColor', 'Active'],
    ['fillColor', 'Travel fill'],
    ['restColor', 'Rest'],
  ];

  const DIRECTIONS: [FillDirection, string][] = [
    ['up', '↑ Up'],
    ['down', '↓ Down'],
    ['left', '← Left'],
    ['right', '→ Right'],
  ];

  /**
   * A number typed into a field, or `null` when it was left empty.
   *
   * `+''` is `0`, not `NaN`: clearing the size field to retype it would set
   * every key to zero pixels, persist it and broadcast it. The same guard the
   * position fields carry, and for the same reason.
   */
  function typed(input: HTMLInputElement, fallback: number): number | null {
    if (input.value !== '') return Number(input.value);
    input.value = String(fallback);
    return null;
  }

  function size(property: 'unit' | 'gap', input: HTMLInputElement) {
    const value = typed(input, config.style[property]);
    if (value !== null) onChange(setGlobalStyle(config, property, value));
  }
</script>

<section aria-label="Global style">
  <h2>Global style</h2>

  {#each COLORS as [property, label] (property)}
    <div class="row">
      <label for={`global-${property}`}>{label}</label>
      <div class="value">
        <code>{config.style[property]}</code>
        <input
          id={`global-${property}`}
          name={property}
          type="color"
          value={config.style[property]}
          onchange={(event) =>
            onChange(setGlobalStyle(config, property, event.currentTarget.value))}
        />
      </div>
    </div>
  {/each}

  <div class="row">
    <label for="global-fillDirection">Fill direction</label>
    <select
      id="global-fillDirection"
      name="fillDirection"
      value={config.style.fillDirection}
      onchange={(event) =>
        onChange(
          setGlobalStyle(config, 'fillDirection', event.currentTarget.value as FillDirection),
        )}
    >
      {#each DIRECTIONS as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </select>
  </div>

  <div class="row">
    <label for="global-opacity">Opacity</label>
    <div class="value">
      <code>{Math.round(config.style.opacity * 100)}%</code>
      <input
        id="global-opacity"
        name="opacity"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={config.style.opacity}
        onchange={(event) =>
          onChange(setGlobalStyle(config, 'opacity', +event.currentTarget.value))}
      />
    </div>
  </div>

  <!-- Not in the mockup, which gives sizes no home at all: the popover sizes
       one key in units, and nothing sets what a unit is worth in pixels. It
       belongs here, with the other settings that apply to every key. -->
  <div class="row">
    <label for="global-unit">Key size</label>
    <div class="value">
      <input
        id="global-unit"
        name="unit"
        type="number"
        min="16"
        max="200"
        value={config.style.unit}
        onchange={(event) => size('unit', event.currentTarget)}
      />
      <span class="unit">px</span>
    </div>
  </div>

  <div class="row">
    <label for="global-gap">Gap</label>
    <div class="value">
      <input
        id="global-gap"
        name="gap"
        type="number"
        min="0"
        max="40"
        value={config.style.gap}
        onchange={(event) => size('gap', event.currentTarget)}
      />
      <span class="unit">px</span>
    </div>
  </div>
</section>

<style>
  section {
    display: grid;
    gap: 10px;
    padding: 16px 18px;
    background: var(--he-panel, #141722);
    border: 1px solid var(--he-border, #1b1e27);
    border-radius: var(--he-radius-panel, 6px);
  }
  h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--he-text-muted, #8b90a0);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  label {
    font-size: 12px;
    color: var(--he-text-muted, #8b90a0);
  }
  .value {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  code {
    font: var(--he-font-mono, 400 12px ui-monospace, monospace);
    color: var(--he-text-faint, #5a5f70);
  }
  .unit {
    font-size: 10px;
    color: var(--he-text-ghost, #4a4f60);
  }
  input[type='color'] {
    /* The native swatch keeps its own chrome in every engine; a fixed box and
       no padding is as close to the mockup as it goes without rebuilding a
       colour picker, which is not what this task is for. */
    inline-size: 30px;
    block-size: 22px;
    padding: 0;
    background: none;
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    cursor: pointer;
  }
  input[type='number'] {
    inline-size: 56px;
    font: var(--he-font-mono, 400 12px ui-monospace, monospace);
    color: var(--he-text, #dde1e9);
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 4px 6px;
  }
  input[type='range'] {
    inline-size: 96px;
    accent-color: var(--he-accent, #7c9eff);
  }
  select {
    font: inherit;
    font-size: 12px;
    color: var(--he-text, #dde1e9);
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 4px 6px;
  }
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 1px;
  }
</style>
