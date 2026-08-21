<script lang="ts">
  import Collapsible from './Collapsible.svelte';

  /** Test-only: a snippet cannot be handed over from a plain `render()` call. */
  let {
    id = 'style',
    title = 'Global style',
    note = null,
    modified = false,
    defaultOpen = false,
    storage,
  }: {
    id?: string;
    title?: string;
    note?: string | null;
    modified?: boolean;
    defaultOpen?: boolean;
    storage: Pick<Storage, 'getItem' | 'setItem'>;
  } = $props();
</script>

<Collapsible {id} {title} {note} {modified} {defaultOpen} {storage}>
  <p>the contents</p>
</Collapsible>
