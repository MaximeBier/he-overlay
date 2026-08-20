<script lang="ts">
  import KeyboardView from '../view/KeyboardView.svelte';
  import KeyPopover from './KeyPopover.svelte';
  import { hasOverrides, resolve } from '../config/resolve';
  import { moveKeysBy, pixelsToUnits } from './layout';
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

  /**
   * Whether the style popover is open on the current selection.
   *
   * Kept apart from the selection itself, because they answer different
   * questions: a click says *which* keys, a deliberate second gesture says
   * *edit them*. Opening on selection would put a panel over the layout at the
   * exact moment one is looking at it (spec §16.5).
   */
  let editing = $state(false);

  /** What the editor shows: the draft while dragging, the real one otherwise. */
  const shown = $derived(draft ?? config);
  const scene = $derived(resolve(shown));
  const selection = $derived(shown.keys.filter((key) => selectedIds.includes(key.id)));
  const unit = $derived(shown.style.unit);
  const gap = $derived(shown.style.gap);

  // Hidden for the length of the gesture, not closed: following the key across
  // the stage is unreadable, and staying put covers where the key is going.
  const popoverVisible = $derived(editing && draft === null && selection.length > 0);

  /** Below the selection's bounding box, in stage pixels. */
  const anchor = $derived({
    x: Math.min(...selection.map((key) => key.x)) * unit,
    y: Math.max(...selection.map((key) => key.y + key.h)) * unit,
  });

  function open(id: number) {
    if (!selectedIds.includes(id)) selectedIds = [id];
    editing = true;
  }

  /**
   * Pressing bare stage drops the selection.
   *
   * Guarded on the target being the stage itself: the handles and the popover
   * sit inside it, so an unguarded handler would clear the selection on the
   * way to every key — and close the popover on the first click inside it.
   */
  function onStagePointerDown(event: PointerEvent) {
    if (event.target !== event.currentTarget) return;
    selectedIds = [];
    editing = false;
  }

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
    if (!selectedIds.includes(id)) {
      selectedIds = [id];
      // A new selection is a new subject. Closing here and not on every press
      // is what lets the popover survive a drag of the keys it edits.
      editing = false;
    }

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
      // One key, two things to undo, so they come off in the order they went
      // on. Clearing the selection first would leave the popover anchored to
      // nothing for the frame before it noticed.
      if (editing) editing = false;
      else {
        selectedIds = [];
        // And the focus with it. A handle keeps focus after a click, so
        // clearing the selection alone left a ring drawn around a key that
        // was no longer selected — saying nothing true about it.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
    }
    if (!typing && event.key === 'Delete' && selectedIds.length > 0) {
      onChange(removeKeys(config, selectedIds));
      selectedIds = [];
      editing = false;
    }
  }

  /**
   * Enter and Space activate a focused key handle, and the browser turns both
   * into a click — hence the `detail === 0` path in `onClick`. Enter alone
   * opens the editor, matching the mockup; Space keeps meaning "select".
   */
  function onHandleKeyDown(event: KeyboardEvent, id: number) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    open(id);
  }
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
  <!-- The stage is a surface, not a control, and it needs no keyboard path of
       its own: Escape already clears the selection from anywhere. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="stage" onpointerdown={onStagePointerDown}>
    <KeyboardView config={scene} {frame} decorations />
    {#each shown.keys as key (key.id)}
      <button
        class="handle"
        class:selected={selectedIds.includes(key.id)}
        class:overridden={hasOverrides(key)}
        style:left={`${key.x * unit + gap / 2}px`}
        style:top={`${key.y * unit + gap / 2}px`}
        style:width={`${Math.max(0, key.w * unit - gap)}px`}
        style:height={`${Math.max(0, key.h * unit - gap)}px`}
        onpointerdown={(event) => onPointerDown(event, key.id)}
        onclick={(event) => onClick(event, key.id)}
        ondblclick={() => open(key.id)}
        onkeydown={(event) => onHandleKeyDown(event, key.id)}
        oncontextmenu={(event) => {
          // The native menu offers nothing over a key handle, and it would
          // land on top of the popover we are opening underneath it.
          event.preventDefault();
          open(key.id);
        }}
        aria-label={`Select ${key.label}`}
        aria-pressed={selectedIds.includes(key.id)}
      ></button>
    {/each}

    {#if popoverVisible}
      <div class="anchor" style:left={`${anchor.x}px`} style:top={`${anchor.y + gap}px`}>
        <KeyPopover {config} {selectedIds} {onChange} onClose={() => (editing = false)} />
      </div>
    {/if}
  </div>

  <p class="shortcuts">
    Click to select · Shift+click to add · Double-click to edit · Ctrl+A for all · Delete to remove
  </p>
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
    /* A drag across the keys used to select the SVG labels as if they were a
       paragraph, leaving a blue smear over the layout. Nothing here is text
       anyone means to copy. */
    user-select: none;
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
  /* Clicking a button focuses it, and the browser's own ring then stays on
     screen after Escape has cleared the selection — a thick white outline on
     a key that is no longer selected, saying nothing true. Removed here and
     given back below for the keyboard, which is who it is for. */
  .handle:focus {
    outline: none;
  }
  .handle:focus-visible {
    outline: 2px solid var(--he-accent-hover, #a5bcff);
    outline-offset: 2px;
  }
  .handle.selected {
    border: 1px solid var(--he-accent, #7c9eff);
    border-style: solid;
    /* A shadow rather than an outline: `outline` is what the focus ring uses,
       and one of the two would always be hiding the other. */
    box-shadow: 0 0 0 1px var(--he-accent, #7c9eff);
  }
  /* The same amber the popover badge uses. One colour, one meaning: this key
     differs from the global (spec §8.2).

     Top *left*, because the AXIS tag the renderer draws sits top right and the
     two were printing on top of each other. Temporary: the mockup has not
     placed either of them yet, and when it does they move together. */
  .handle.overridden::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--he-override, #d9a05b);
  }
  .anchor {
    position: absolute;
    /* Over the keys, and over nothing else: the stage is the only stacking
       context here, so the popover cannot escape it and cover the sidebar. */
    z-index: 1;
  }
  .shortcuts {
    margin: 0;
    font: var(--he-font-mono, 400 12px ui-monospace, monospace);
    color: var(--he-text-muted, #8b90a0);
  }
</style>
