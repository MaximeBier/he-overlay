<script lang="ts">
  import type { KeyboardStatus } from '../keyboard/device';
  import type { ObsStatus } from '../transport/obs';
  import { keyboardHint, obsHint } from './settings';
  import { UI_TOKENS } from '../styles/tokens';

  let {
    keyboard,
    obs,
    rate,
    overlays,
  }: {
    keyboard: KeyboardStatus;
    obs: ObsStatus;
    rate: number;
    overlays: number;
  } = $props();

  // Permanent, never modal (spec §11): a dialog would have to be dismissed,
  // and what is wrong is exactly what one needs to keep seeing.
  const dot = (ok: boolean) => (ok ? UI_TOKENS.ok : UI_TOKENS.danger);
</script>

<header>
  <span class="pill">
    <span class="dot" style:background={dot(keyboard === 'connected')}></span>
    {keyboardHint(keyboard)}
  </span>
  <span class="pill">
    <span class="dot" style:background={dot(obs === 'identified')}></span>
    {obsHint(obs)}
  </span>
  <span class="pill">{rate} fps</span>
  <span class="pill">{overlays} overlay{overlays === 1 ? '' : 's'} connected</span>
</header>

<style>
  header {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
    font: var(--he-font, 400 14px system-ui, sans-serif);
    padding: 0.5rem 0.75rem;
    background: var(--he-surface);
    color: var(--he-text);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
  }
</style>
