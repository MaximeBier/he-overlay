<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The browser face of `overlay.html` (mockup board `6g`, spec §16.7).
   *
   * **A diagnostic tool, not a decoration.** Pasting the overlay URL into a
   * browser to check that it works currently gives a black, empty page —
   * which is exactly what a wrong URL gives. There is no way to tell the two
   * apart, at the one moment somebody asks.
   *
   * In OBS it renders **nothing at all**: not hidden, not transparent, absent.
   * A stray stylesheet or a mistaken `visibility` cannot bring back markup
   * that was never written, and the defect this guards against — chrome going
   * out on air — is the one nobody would catch before it happened.
   */
  /**
   * Every colour here is a `--he-*` variable, per global constraint 17, and
   * `main.ts` sets them **only when the page is decorated**. In OBS nothing
   * declares them and nothing renders, so the settings palette costs the
   * on-air bundle its declaration and not a single applied rule.
   */
  let {
    decorated,
    connected,
    rate,
    children,
  }: {
    /** Positive proof of an ordinary browser; see `isOrdinaryBrowser`. */
    decorated: boolean;
    connected: boolean;
    rate: number;
    children: Snippet;
  } = $props();
</script>

{#if decorated}
  <div class="chrome" data-chrome>
    <div class="vignette" aria-hidden="true"></div>

    <span class="brand">HE OVERLAY <span class="file">· overlay.html</span></span>

    <span class="link" data-link data-connected={connected}>
      <span class="dot" aria-hidden="true"></span>
      {connected ? `Connected · ${rate}/s` : 'Not connected'}
    </span>

    <div class="middle">
      <!-- Framed, so the extent of the overlay is visible. In OBS the same
           keys sit on nothing at all, which is the point of the note below. -->
      <div class="frame">{@render children()}</div>

      <span class="note">
        <span class="swatch" aria-hidden="true"></span>
        This frame is browser-only. In OBS, the page renders the overlay on full transparency.
      </span>
    </div>
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .chrome {
    position: fixed;
    inset: 0;
    overflow: hidden;

    display: flex;
    align-items: center;
    justify-content: center;

    font-family: 'Archivo', system-ui, sans-serif;
    color: var(--he-text);
    background-color: var(--he-stage);
    background-image: radial-gradient(var(--he-border) 1px, transparent 1px);
    background-size: 26px 26px;
  }
  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse 60% 55% at 50% 46%,
      transparent 30%,
      color-mix(in srgb, var(--he-stage) 88%, transparent) 100%
    );
  }

  .brand,
  .link {
    position: absolute;
    top: 18px;
    z-index: 1;
    font-size: 12px;
    color: var(--he-text-muted);
  }
  .brand {
    left: 22px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .file {
    font-weight: 400;
    color: var(--he-text-faint);
  }
  .link {
    right: 22px;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--he-danger);
  }
  .link[data-connected='true'] .dot {
    background: var(--he-ok);
  }

  .middle {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 26px;
    max-inline-size: 100%;
  }
  .frame {
    padding: 34px 40px;
    background: color-mix(in srgb, var(--he-bg) 55%, transparent);
    border: 1px solid var(--he-border);
    border-radius: 8px;
    max-inline-size: 100%;
    overflow: auto;
  }

  .note {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 14px;
    font-size: 11.5px;
    color: var(--he-text-faint);
    background: var(--he-bg);
    border: 1px solid var(--he-border);
    border-radius: 20px;
    text-align: center;
  }
  .swatch {
    flex: none;
    inline-size: 12px;
    block-size: 12px;
    border-radius: 3px;
    /* The checkerboard that means "transparent" everywhere else. */
    background: conic-gradient(
      var(--he-border-control) 25%,
      var(--he-stage) 0 50%,
      var(--he-border-control) 0 75%,
      var(--he-stage) 0
    );
  }
</style>
