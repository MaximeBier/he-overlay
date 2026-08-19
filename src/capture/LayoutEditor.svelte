<script lang="ts">
  import KeyboardView from '../view/KeyboardView.svelte';
  import { resolve } from '../config/resolve';
  import { moveKey, moveKeysBy, resizeKeys, setMode, pixelsToUnits, GRID } from './layout';
  import { removeKeys } from './learn';
  import type { OverlayConfig } from '../config/schema';
  import type { FrameKey } from '../protocol/messages';

  let {
    config,
    frame,
    selectedIds = $bindable([]),
    onChange,
  }: {
    config: OverlayConfig;
    frame: readonly FrameKey[];
    selectedIds: number[];
    onChange: (next: OverlayConfig) => void;
  } = $props();

  /**
   * The configuration being dragged, or `null` when no drag is in progress.
   *
   * A drag emits a position on every pointer move — up to 120 a second — and
   * `onChange` persists and broadcasts. Doing that per move would stringify
   * the whole configuration into local storage and push it over obs-websocket
   * at that rate, competing with the frames. So the gesture works on a draft
   * and commits once, on release: the broadcast lags the preview by the length
   * of a drag, which nobody can perceive while adjusting a key.
   */
  let draft = $state<OverlayConfig | null>(null);
  let drag: {
    startX: number;
    startY: number;
    origins: Map<number, { x: number; y: number }>;
  } | null = null;

  /** What the editor shows: the draft while dragging, the real one otherwise. */
  const shown = $derived(draft ?? config);
  const scene = $derived(resolve(shown));
  const selection = $derived(shown.keys.filter((key) => selectedIds.includes(key.id)));
  const single = $derived(selection.length === 1 ? selection[0]! : null);

  function toggle(id: number) {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((other) => other !== id)
      : [...selectedIds, id];
  }

  /**
   * Selection happens here, on press, and nowhere else.
   *
   * It used to run twice — once here and once on the click that follows —
   * so a shift+click added the key and then immediately removed it: the
   * gesture did nothing at all. Pressing is also when an editor should
   * commit to a selection, since the drag starts from it.
   */
  function onPointerDown(event: PointerEvent, id: number) {
    // Primary button only. A right-click used to arm the drag and then have
    // its release swallowed by the context menu, leaving the editor dragging
    // the selection on plain mouse movement with nothing held down.
    if (event.button !== 0) return;

    if (event.shiftKey) {
      // Composing a selection, not moving one: no drag starts from here, or a
      // twitch of the hand would displace the group being assembled.
      toggle(id);
      return;
    }

    // Pressing a key outside the selection takes it alone; pressing one inside
    // keeps the group, so the whole group can be dragged.
    if (!selectedIds.includes(id)) selectedIds = [id];

    draft = config;
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      origins: new Map(
        config.keys
          .filter((key) => selectedIds.includes(key.id))
          .map((key) => [key.id, { x: key.x, y: key.y }]),
      ),
    };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || !draft) return;
    // No button held means the release happened somewhere we never saw it —
    // outside the window, or after the handle was removed from the DOM and
    // took the pointer capture with it. Without this the key follows the
    // mouse for good.
    if (event.buttons === 0) {
      abandon();
      return;
    }

    const dx = pixelsToUnits(event.clientX - drag.startX, config.style.unit);
    const dy = pixelsToUnits(event.clientY - drag.startY, config.style.unit);
    draft = moveKeysBy(config, drag.origins, dx, dy);
  }

  /** Drops the gesture without writing anything. */
  function abandon() {
    drag = null;
    draft = null;
  }

  function onPointerUp() {
    if (!drag || !draft) return;

    // Compared against the origins rather than "a pointermove happened": a
    // one-pixel twitch during a click snaps back to the same grid cell, and
    // writing there costs a synchronous stringify and a broadcast for a
    // configuration identical to the stored one.
    const moved = draft.keys.some((key) => {
      const origin = drag!.origins.get(key.id);
      return origin ? origin.x !== key.x || origin.y !== key.y : false;
    });
    const next = draft;

    abandon();
    if (moved) onChange(next);
  }

  /**
   * Keyboard activation only. `detail` counts the clicks of a pointer, so a
   * zero means Enter or Space on a focused key — the pointer path is already
   * handled on press, and running here as well is what broke shift+click.
   */
  function onClick(event: MouseEvent, id: number) {
    if (event.detail !== 0) return;
    if (event.shiftKey) toggle(id);
    else selectedIds = [id];
  }

  function onKeyDown(event: KeyboardEvent) {
    // The mode selector is not an input, and Ctrl+A inside it belongs to it.
    const typing =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;

    if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selectedIds = shown.keys.map((key) => key.id);
    }
    if (event.key === 'Escape') {
      // Abandons the gesture first: leaving a drag armed with no selection is
      // the one state with no way out.
      abandon();
      selectedIds = [];
    }
    if (!typing && event.key === 'Delete' && selectedIds.length > 0) {
      onChange(removeKeys(config, selectedIds));
      selectedIds = [];
    }
  }

  const unit = $derived(shown.style.unit);
  const gap = $derived(shown.style.gap);
</script>

<!-- The release and the cancellation are watched on the window, not on the
     stage: a pointer can be released anywhere, and a cancelled one — touch
     scrolling wins the gesture — never reports to the stage at all. -->
<svelte:window
  onkeydown={onKeyDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={abandon}
/>

<div class="editor">
  <!-- The one place the dashed outline and the AXIS tag appear: the broadcast
       never shows them (spec §16.3). -->
  <div class="stage">
    <KeyboardView config={scene} {frame} decorations />
    {#each shown.keys as key (key.id)}
      <button
        class="handle"
        class:selected={selectedIds.includes(key.id)}
        style:left={`${key.x * unit + gap / 2}px`}
        style:top={`${key.y * unit + gap / 2}px`}
        style:width={`${Math.max(0, key.w * unit - gap)}px`}
        style:height={`${Math.max(0, key.h * unit - gap)}px`}
        onpointerdown={(event) => onPointerDown(event, key.id)}
        onclick={(event) => onClick(event, key.id)}
        aria-label={`Select ${key.label}`}
        aria-pressed={selectedIds.includes(key.id)}
      ></button>
    {/each}
  </div>

  <p class="shortcuts">
    Shift+click to add · Ctrl+A to select all · Delete to remove · Escape to clear
  </p>

  {#if selection.length > 0}
    <fieldset>
      <legend>{single ? single.label : `${selection.length} keys selected`}</legend>

      {#if single}
        <label>
          X
          <input
            type="number"
            step={GRID}
            value={single.x}
            onchange={(e) => onChange(moveKey(config, single.id, +e.currentTarget.value, single.y))}
          />
        </label>
        <label>
          Y
          <input
            type="number"
            step={GRID}
            value={single.y}
            onchange={(e) => onChange(moveKey(config, single.id, single.x, +e.currentTarget.value))}
          />
        </label>
      {/if}

      <label>
        Width
        <input
          type="number"
          step={GRID}
          min={GRID}
          value={selection[0]!.w}
          onchange={(e) =>
            onChange(resizeKeys(config, selectedIds, +e.currentTarget.value, selection[0]!.h))}
        />
      </label>
      <label>
        Height
        <input
          type="number"
          step={GRID}
          min={GRID}
          value={selection[0]!.h}
          onchange={(e) =>
            onChange(resizeKeys(config, selectedIds, selection[0]!.w, +e.currentTarget.value))}
        />
      </label>

      <label>
        Mode
        <select
          value={selection.every((key) => key.mode === 'axis') ? 'axis' : 'key'}
          onchange={(e) =>
            onChange(
              setMode(config, selectedIds, e.currentTarget.value === 'axis' ? 'axis' : 'key'),
            )}
        >
          <option value="key">Key — shows activation</option>
          <option value="axis">Axis — travel only</option>
        </select>
      </label>

      {#if selection.length > 1}
        <button
          onclick={() => {
            onChange(removeKeys(config, selectedIds));
            selectedIds = [];
          }}
        >
          Delete {selection.length} selected
        </button>
      {/if}
    </fieldset>
  {/if}
</div>

<style>
  .editor {
    display: grid;
    gap: var(--he-space, 0.5rem);
    justify-items: start;
  }
  .stage {
    position: relative;
    background: var(--he-stage, #0b0d11);
    border-radius: var(--he-radius, 4px);
    min-height: 4rem;
  }
  .handle {
    position: absolute;
    /* The browser must not turn a drag into a scroll: it would cancel the
       pointer mid-gesture. */
    touch-action: none;
    background: transparent;
    border: 1px dashed transparent;
    border-radius: var(--he-radius, 4px);
    cursor: grab;
    padding: 0;
  }
  .handle:hover {
    border-color: var(--he-text-faint, #5a5f70);
  }
  .handle.selected {
    border: 1px solid var(--he-accent, #7c9eff);
    border-style: solid;
  }
  .shortcuts {
    margin: 0;
    font: var(--he-font-mono, 400 12px ui-monospace, monospace);
    color: var(--he-text-muted, #8b90a0);
  }
  fieldset {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
    border: 1px solid var(--he-border, #1b1e27);
    border-radius: var(--he-radius, 4px);
  }
  input {
    width: 5rem;
  }
  select {
    font: inherit;
  }
</style>
