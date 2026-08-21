<script lang="ts">
  import KeyboardView from '../view/KeyboardView.svelte';
  import KeyPopover from './KeyPopover.svelte';
  import { hasOverrides, resolve } from '../config/resolve';
  import { UI_TOKENS } from '../styles/ui-tokens';
  import { recommendedSize } from '../view/scene';
  import { keysWithin, moveKeysBy, normalizeRect, pixelsToUnits, type Point } from './layout';
  import { removeKeys } from './learn';
  import type { OverlayConfig } from '../config/schema';
  import type { LayoutMapLike } from '../keyboard/labels';
  import type { FrameKey } from '../protocol/messages';

  let {
    config,
    frame,
    selectedIds = $bindable([]),
    onChange,
    layout = null,
    suggestAxis = false,
    onDismissSuggestion = () => {},
  }: {
    config: OverlayConfig;
    frame: readonly FrameKey[];
    selectedIds: number[];
    onChange: (next: OverlayConfig) => void;
    /** Passed straight through to the popover; the editor makes no use of it. */
    layout?: LayoutMapLike | null;
    suggestAxis?: boolean;
    onDismissSuggestion?: () => void;
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
   * The selection the popover was opened for, empty when it is closed.
   *
   * A set of ids rather than a boolean, so that **any** change of selection
   * closes it — including one made outside this component, which a boolean
   * could not see. Deleting from the sidebar list emptied `selectedIds` and
   * left the flag standing; the next Ctrl+A then reopened a panel nobody had
   * asked for. Found in review on 2026-08-20.
   *
   * Kept apart from the selection itself, because the two answer different
   * questions: a click says *which* keys, a deliberate second gesture says
   * *edit them*. Opening on selection would put a panel over the layout at the
   * exact moment one is looking at it (spec §16.5).
   */
  let editingFor = $state<number[]>([]);

  /**
   * The marquee in progress, in key units, or `null` when none is.
   *
   * `base` is the selection the lasso adds to — empty unless Shift was held
   * when it started. Recorded once rather than read from `selectedIds`, which
   * the gesture rewrites on every move.
   */
  let lasso = $state<{ from: Point; to: Point; base: number[] } | null>(null);
  let stage = $state<HTMLElement | null>(null);

  /** In key units, the two corners the right way round. */
  const lassoRect = $derived(lasso === null ? null : normalizeRect(lasso.from, lasso.to));

  /** What the editor shows: the draft while dragging, the real one otherwise. */
  const shown = $derived(draft ?? config);
  const scene = $derived(resolve(shown));
  const selection = $derived(shown.keys.filter((key) => selectedIds.includes(key.id)));
  /**
   * What the OBS browser source has to be, in pixels — and the reason it is
   * here rather than tucked in a panel.
   *
   * OBS fixes a browser source's size when the source is created, and never
   * revises it. Every key added past that size is simply cropped, silently,
   * on both sides at once: the capture page looks right and the scene looks
   * wrong. Keeping the figure in view, next to the keys that determine it, is
   * what turns that into something anyone can notice.
   *
   * Read from the draft during a drag, so it moves as the layout does.
   */
  const source = $derived(recommendedSize(scene));

  const unit = $derived(shown.style.unit);
  const gap = $derived(shown.style.gap);

  // Hidden for the length of the gesture, not closed: following the key across
  // the stage is unreadable, and staying put covers where the key is going.
  const popoverVisible = $derived(
    draft === null &&
      selection.length > 0 &&
      editingFor.length === selectedIds.length &&
      editingFor.every((id) => selectedIds.includes(id)),
  );

  const POPOVER_WIDTH = Number.parseInt(UI_TOKENS.popoverWidth, 10);

  /**
   * Below the selection's bounding box, in stage pixels — and never past the
   * right edge.
   *
   * Anchored to a key near the edge, the popover used to run outside the
   * visible stage. The stage scrolls, so instead of the panel moving, a
   * horizontal scrollbar appeared and half the controls sat off-screen.
   * Clamped against the *visible* window rather than the content, so it still
   * lands correctly on a layout that is scrolled sideways.
   */
  const anchor = $derived.by(() => {
    const left = Math.min(...selection.map((key) => key.x)) * unit;
    const y = Math.max(...selection.map((key) => key.y + key.h)) * unit;

    const room = stage?.clientWidth ?? 0;
    if (room === 0) return { x: left, y };

    const from = stage?.scrollLeft ?? 0;
    const limit = Math.max(from, from + room - POPOVER_WIDTH - gap);
    return { x: Math.min(left, limit), y };
  });

  function open(id: number) {
    if (!selectedIds.includes(id)) selectedIds = [id];
    editingFor = [...selectedIds];
  }

  /**
   * Lets a half-typed field commit before the popover goes away.
   *
   * The popover's fields write on `change`, which the browser fires on blur —
   * and blur is part of the *default action* of a pointerdown elsewhere, so it
   * happens after this handler. Unmounting the popover here detached the input
   * while it still held focus, and a detached input fires neither blur nor
   * change: the label someone had just typed was silently dropped. Blurring
   * first makes the commit happen while the field is still in the document.
   */
  function commitPendingEdit() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('.anchor')) active.blur();
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
    // Primary button only, as on the handles: a right-click would arm a
    // marquee whose release the context menu swallows.
    if (event.button !== 0) return;

    commitPendingEdit();
    editingFor = [];

    // Shift adds, matching Shift+click. Without it the press clears, which is
    // the behaviour bare stage had before the lasso existed — a marquee that
    // selects nothing still ends with an empty selection.
    const base = event.shiftKey ? [...selectedIds] : [];
    selectedIds = base;

    const at = stagePoint(event);
    lasso = { from: at, to: at, base };
  }

  /**
   * Where the pointer is in the layout, in key units.
   *
   * The scroll has to be added back. `getBoundingClientRect()` of a scroll
   * container is its border box, which does **not** move when its own content
   * scrolls — while the handles, positioned inside that content, do. Without
   * this a layout scrolled by one key drew the lasso a key away from the
   * pointer and selected the neighbours. Found in review on 2026-08-21, on a
   * stage that only became scrollable in this same milestone.
   */
  function stagePoint(event: PointerEvent): Point {
    const box = stage?.getBoundingClientRect();
    return {
      x: pixelsToUnits(event.clientX - (box?.left ?? 0) + (stage?.scrollLeft ?? 0), unit),
      y: pixelsToUnits(event.clientY - (box?.top ?? 0) + (stage?.scrollTop ?? 0), unit),
    };
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
      commitPendingEdit();
      // A new selection is a new subject, and `popoverVisible` closes the
      // panel on its own once the ids no longer match. Pressing a key already
      // in the selection changes nothing, which is what lets the popover
      // survive a drag of the very keys it edits.
      selectedIds = [id];
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
    if (lasso) {
      // Same guard as the drag: a release we never saw would leave the
      // marquee following the pointer with nothing held down.
      if (event.buttons === 0) {
        lasso = null;
        return;
      }

      lasso = { ...lasso, to: stagePoint(event) };
      // Live, because a marquee that only reports on release is a rectangle
      // one has to aim blind. Nothing is persisted or broadcast by a
      // selection, so the cost is a filter over a handful of keys.
      selectedIds = [...new Set([...lasso.base, ...keysWithin(shown, lassoRect!)])];
      return;
    }

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
    // The selection the marquee built is kept: it is what one was aiming at,
    // and Escape clears it on the next press anyway.
    lasso = null;
  }

  function onPointerUp() {
    if (lasso) {
      lasso = null;
      return;
    }

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
      if (editingFor.length > 0) editingFor = [];
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
  <div class="stage" bind:this={stage} onpointerdown={onStagePointerDown}>
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

    {#if lassoRect}
      <div
        class="lasso"
        style:left={`${lassoRect.x * unit}px`}
        style:top={`${lassoRect.y * unit}px`}
        style:width={`${lassoRect.w * unit}px`}
        style:height={`${lassoRect.h * unit}px`}
      ></div>
    {/if}

    {#if popoverVisible}
      <div class="anchor" style:left={`${anchor.x}px`} style:top={`${anchor.y + gap}px`}>
        <KeyPopover
          {config}
          {selectedIds}
          {onChange}
          {layout}
          {suggestAxis}
          {onDismissSuggestion}
          onClose={() => (editingFor = [])}
        />
      </div>
    {/if}
  </div>

  <div class="foot">
    {#if shown.keys.length > 0}
      <p class="source">
        Recommended OBS browser source · <code>{source.width} × {source.height} px</code>
      </p>
    {/if}

    <p class="shortcuts">
      Click to select · Shift+click to add · Drag the background to lasso · Double-click to edit ·
      Ctrl+A for all · Delete to remove
    </p>
  </div>
</div>

<style>
  /**
   * A column that fills whatever it is given: the stage takes the room, the
   * shortcut bar sits at the bottom of the page.
   *
   * The stage used to be as big as the keys were, which made the empty space
   * around them belong to nobody — a lasso could not start there, and a click
   * meant to clear the selection landed outside the editor entirely.
   */
  .editor {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
  }
  /* Drawn over the keys and under nothing that is clickable: the marquee is
     feedback, and the pointer must keep reaching the stage beneath it. */
  .lasso {
    position: absolute;
    pointer-events: none;
    border: 1px dashed var(--he-accent, #7c9eff);
    background: color-mix(in srgb, var(--he-accent, #7c9eff) 12%, transparent);
    border-radius: var(--he-radius, 4px);
  }
  .stage {
    flex: 1;
    position: relative;
    overflow: auto;
    background: var(--he-stage, #0b0d11);
    /* A drag across the keys used to select the SVG labels as if they were a
       paragraph, leaving a blue smear over the layout. Nothing here is text
       anyone means to copy. */
    user-select: none;
  }
  /* The drawing is scenery, and it covers the whole stage: without this, a
     press on the empty space *between* two keys landed on the <svg> and the
     "pressing bare stage clears the selection" guard never matched — the only
     place it did was outside the layout's bounding box, which is often
     nowhere. Found in review on 2026-08-20. The handles are siblings, so they
     keep their events. */
  .stage :global(svg) {
    pointer-events: none;
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
  .foot {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 9px 18px;
  }
  /* Louder than the help text below it: this one is a value to carry to OBS,
     not a reminder of what the mouse does. */
  .source {
    margin: 0;
    font-size: var(--he-size-sm, 15px);
    color: var(--he-text-muted, #8b90a0);
  }
  .source code {
    font: var(--he-font-mono, 400 15px ui-monospace, monospace);
    color: var(--he-text, #dde1e9);
  }
  .shortcuts {
    margin: 0;
    text-align: center;
    font-size: var(--he-size-xs, 14px);
    color: var(--he-text-faint, #5a5f70);
  }
</style>
