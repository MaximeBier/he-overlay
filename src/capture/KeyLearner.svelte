<script lang="ts">
  let { learning = $bindable(false), onCancel }: { learning: boolean; onCancel: () => void } =
    $props();
</script>

<!--
  Learning is a mode rather than a dialog: the matrix index cannot be guessed,
  it can only be observed by pressing the key (spec §8.4). The press has to
  reach the keyboard, so nothing may capture focus while it is waiting.

  One button, two states — the mockup's board `6c` turns "+ Add key" into
  "■ Stop capture" rather than adding a second control beside it. Two buttons
  would mean one of them is always the wrong one to reach for.
-->
<button
  class="add"
  class:listening={learning}
  type="button"
  aria-pressed={learning}
  onclick={() => (learning ? onCancel() : (learning = true))}
>
  {learning ? '■ Stop capture · listening…' : '+ Add key · press any key'}
</button>

{#if learning}
  <!-- Said out loud for a screen reader, which cannot see the button change
       colour. `polite`: it must not interrupt, only follow. -->
  <span class="sr" role="status">Press the key you want to display.</span>
{/if}

<style>
  .add {
    box-sizing: border-box;
    inline-size: 100%;
    display: block;
    padding: 11px 0;

    font: var(--he-font, 400 16px system-ui, sans-serif);
    font-size: var(--he-size-sm, 15px);
    font-weight: 700;
    text-align: center;
    cursor: pointer;

    color: var(--he-bg, #0e1015);
    background: var(--he-accent, #7c9eff);
    border: 1px solid var(--he-accent, #7c9eff);
    border-radius: var(--he-radius-control, 5px);
  }
  .add:hover {
    background: var(--he-accent-hover, #a5bcff);
    border-color: var(--he-accent-hover, #a5bcff);
  }
  /* Listening reverses it: the accent moves to the outline, so the panel reads
     as armed rather than as offering something. */
  .add.listening {
    color: var(--he-accent, #7c9eff);
    background: var(--he-bg, #0e1015);
  }
  .add.listening:hover {
    background: var(--he-surface, #151823);
  }
  .add:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 2px;
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
