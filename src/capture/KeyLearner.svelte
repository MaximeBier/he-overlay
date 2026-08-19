<script lang="ts">
  let { learning = $bindable(false), onCancel }: { learning: boolean; onCancel: () => void } =
    $props();
</script>

<!--
  Learning is a mode rather than a dialog: the matrix index cannot be guessed,
  it can only be observed by pressing the key (spec §8.4). The press has to
  reach the keyboard, so nothing may capture focus while it is waiting.
-->
{#if learning}
  <p class="learning" role="status">
    Press the key you want to display…
    <button onclick={onCancel}>Cancel</button>
  </p>
{:else}
  <button onclick={() => (learning = true)}>Add a key</button>
{/if}

<style>
  .learning {
    display: flex;
    gap: var(--he-space, 0.5rem);
    align-items: center;
    margin: 0;
    color: var(--he-accent, #7c9eff);
  }
</style>
