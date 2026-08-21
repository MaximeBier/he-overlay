<script lang="ts">
  import BrowserChrome from './BrowserChrome.svelte';

  /**
   * Test-only. `BrowserChrome` takes a snippet, and a snippet cannot be handed
   * over from a plain `render()` call — it is compiled markup, not a value.
   */
  let {
    decorated,
    connected,
    rate,
  }: {
    decorated: boolean;
    connected: boolean;
    rate: number;
  } = $props();
</script>

<BrowserChrome {decorated} {connected} {rate}>the keys</BrowserChrome>
