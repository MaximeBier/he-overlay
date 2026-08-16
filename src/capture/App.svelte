<!--
  Tout composant porte un bloc `<script lang="ts">`, même vide : sans lui
  svelte2tsx émet un fichier virtuel en JavaScript, que `svelte-check` refuse
  de typer, et l'import depuis un `.ts` retombe en `any` implicite.
-->
<script lang="ts"></script>

<main>
  <h1>HE Overlay — Capture</h1>
</main>
