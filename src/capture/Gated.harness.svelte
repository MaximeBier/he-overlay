<script lang="ts">
  import Gated from './Gated.svelte';

  /** Test-only: a snippet cannot be handed over from a plain `render()` call. */
  let {
    available,
    reason,
    action = null,
    onAction = () => {},
  }: {
    available: boolean;
    reason: string;
    action?: string | null;
    onAction?: () => void;
  } = $props();
</script>

<Gated {available} {reason} {action} {onAction}>
  <button>Add key</button>
</Gated>
