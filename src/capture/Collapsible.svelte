<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { loadOpenState, saveOpenState } from './collapse';

  /**
   * One fold, remembered (spec §9.3).
   *
   * The single disclosure of the settings page. A second implementation is
   * how two folds end up behaving differently — one remembering its state and
   * the other not, one flagging its contents and the other not — for no
   * reason anybody could name afterwards.
   *
   * The three rules of §9.3 are all here: a fold never hides a setting needed
   * to work at all (that is the caller's business), a fold whose contents
   * departs from the defaults says so in its header, and the open state is
   * remembered.
   */
  let {
    id,
    title,
    note = null,
    modified = false,
    defaultOpen = false,
    storage,
    children,
  }: {
    /** Its own key in storage. Two folds must never share one. */
    id: string;
    title: string;
    /**
     * A count or a state worth reading while shut — "14", "4 · 1 to report".
     *
     * Always quiet. A note is there to be read when someone looks, not to
     * catch the eye: colouring the journal's count amber made the page carry a
     * permanent alarm about entries nobody had asked to be alarmed by. The dot
     * below is the one thing here allowed to insist, and only for a setting
     * that was actually changed.
     */
    note?: string | null;
    /** §9.3: the contents departs from the defaults, and hiding that is not on. */
    modified?: boolean;
    /** The first-run guess only. A stored choice always wins over it. */
    defaultOpen?: boolean;
    /** Injected rather than reached for: `localStorage` throws with cookies blocked. */
    storage: Pick<Storage, 'getItem' | 'setItem'>;
    children: Snippet;
  } = $props();

  // Read once, at construction: `defaultOpen` is the first-run guess, not a
  // value that follows the parent. A fold that reopened because a prop changed
  // would undo a choice while someone was looking at it.
  let open = $state(untrack(() => loadOpenState(storage, id, defaultOpen)));
</script>

<details
  class="fold"
  bind:open
  ontoggle={(event) => saveOpenState(storage, id, event.currentTarget.open)}
>
  <summary>
    <span class="title">{title}</span>
    {#if modified}
      <!-- Not a colour on the title: a dot survives being read by someone who
           cannot tell amber from grey. -->
      <span class="dot" data-modified title="Customized" aria-label="Customized"></span>
    {/if}
    {#if note}
      <span class="note" data-note>{note}</span>
    {/if}
  </summary>

  <!-- `{#if}`, not the hiding `<details>` does on its own: a shut fold has to
       cost *nothing* to keep current, and `<details>` keeps its contents in the
       document and merely stops painting them. That is the difference between
       a hidden live reading and one that is not being computed at all. -->
  {#if open}
    <div class="body">
      {@render children()}
    </div>
  {/if}
</details>

<style>
  .fold {
    font: var(--he-font, 400 17px system-ui, sans-serif);
    color: var(--he-text-muted, #8b90a0);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    cursor: pointer;
    font-size: var(--he-size-sm, 15.5px);
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  summary:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 2px;
  }
  .title {
    color: var(--he-text-muted, #8b90a0);
  }
  .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--he-override, #d9a05b);
  }
  .note {
    margin-left: auto;
    font-weight: 400;
    font-size: var(--he-size-xs, 14px);
    color: var(--he-text-faint, #5a5f70);
  }
  .body {
    padding-top: 8px;
  }
</style>
