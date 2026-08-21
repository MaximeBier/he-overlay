<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A section that is not usable yet, shown anyway (spec §16.8).
   *
   * **Dimmed, never hidden.** Someone who cannot see a feature cannot plan for
   * it, and cannot tell "not yet" from "not here" — which is the question a
   * beginner is actually asking. The caption says what is missing rather than
   * that something is: "Available once OBS is connected" sends them somewhere,
   * "Unavailable" sends them hunting.
   */
  let {
    available,
    reason,
    action = null,
    onAction = () => {},
    children,
  }: {
    available: boolean;
    /** Phrased as the condition, not the failure: "Available once …". */
    reason: string;
    /**
     * What to press, when the missing thing is a gesture rather than a piece
     * of hardware. A gate that says "no keyboard access" and offers nothing is
     * a dead end — the browser needs a click it can hang a prompt on, and this
     * is the only place left offering one once the setup wizard is gone.
     */
    action?: string | null;
    onAction?: () => void;
    children: Snippet;
  } = $props();
</script>

<!-- `inert`, not just an opacity: dimming is a look, and a look does not stop
     a click or a Tab. Without it the section is greyed out and fully working,
     which is worse than either state on its own. -->
<div class="gated" data-gated data-available={available} inert={!available}>
  {@render children()}
</div>

{#if !available}
  <p class="why">{reason}</p>
  {#if action}
    <button class="act" data-gated-action type="button" onclick={onAction}>{action}</button>
  {/if}
{/if}

<style>
  .gated[data-available='false'] {
    opacity: 0.4;
  }
  .why {
    margin: 7px 0 0;
    font: var(--he-font, 400 16px system-ui, sans-serif);
    font-size: var(--he-size-xs, 14px);
    text-align: center;
    color: var(--he-text-faint, #5a5f70);
  }
  .act {
    display: block;
    margin: 7px auto 0;
    font: inherit;
    font-size: var(--he-size-sm, 15px);
    font-weight: 600;
    color: var(--he-text, #dde1e9);
    background: none;
    border: 1px solid var(--he-border-popover, #262b3a);
    border-radius: var(--he-radius-control, 5px);
    padding: 6px 14px;
    cursor: pointer;
  }
  .act:hover {
    border-color: var(--he-border-hover, #3a4054);
    background: var(--he-surface, #151823);
  }
  .act:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 2px;
  }
</style>
