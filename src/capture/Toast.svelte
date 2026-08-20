<script lang="ts">
  import { UI_TOKENS } from '../styles/ui-tokens';
  import type { Notice, Tone } from './notice';

  /**
   * The passing half of spec §16.6: bottom centre, four seconds, three tones.
   *
   * It never carries anything one has to act on. Whatever the profile is worth
   * is written permanently in the profile menu, so missing this costs nothing —
   * which is the licence a four-second message needs.
   */
  let {
    notice,
    onDismiss,
  }: {
    notice: Notice | null;
    onDismiss: () => void;
  } = $props();

  const DOT: Record<Tone, string> = {
    success: UI_TOKENS.ok,
    warning: UI_TOKENS.override,
    error: UI_TOKENS.danger,
  };

  const BORDER: Record<Tone, string> = {
    success: UI_TOKENS.borderOk,
    warning: UI_TOKENS.borderWarn,
    error: UI_TOKENS.borderDanger,
  };
</script>

<!-- Keyed on the notice itself, so a second message restarts the fade instead
     of inheriting the remains of the first one's. -->
{#key notice}
  {#if notice}
    <!-- The four seconds are a CSS animation, not a `setTimeout`: global
         constraint 1 forbids timers on the capture page, and the dismissal
         rides the `animationend` event exactly as everything else here rides
         `inputreport`. Nothing moves — only the opacity, at the very end. -->
    <div
      class="toast"
      role="status"
      data-tone={notice.tone}
      style:border-color={BORDER[notice.tone]}
      onanimationend={onDismiss}
    >
      <span class="dot" style:background={DOT[notice.tone]}></span>
      {notice.message}
    </div>
  {/if}
{/key}

<style>
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    translate: -50% 0;
    z-index: 20;

    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;

    font: var(--he-font, 400 14px system-ui, sans-serif);
    font-size: 12px;
    color: var(--he-text, #dde1e9);
    background: var(--he-popover, #141722);
    border: 1px solid var(--he-border, #1b1e27);
    border-radius: var(--he-radius-panel, 6px);

    animation: hold 4s forwards;
  }
  .dot {
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    flex: none;
  }
  @keyframes hold {
    0%,
    92% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
