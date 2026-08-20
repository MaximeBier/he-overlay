<script lang="ts">
  import type { JournalEntry } from './journal';
  import type { StreamReading } from './probe';

  /**
   * The panel a bug report is written from (spec §11, §12.3).
   *
   * Without it, a report is a conversation in the dark: nobody can say which
   * build they were on, what the keyboard actually sent, or whether the stream
   * survived the tab going to the background. Every section here exists
   * because one of those questions had no answer.
   *
   * Shut by default — it is the rarest thing in the sidebar — but its header
   * says when something inside is ours to fix, per §9.3.
   */
  let {
    open = $bindable(false),
    entries,
    logText,
    readings,
    snapshot,
    capturing,
    probing,
    probe,
    onCaptureRaw,
    onToggleProbe,
  }: {
    /**
     * Bound, because what is inside costs something to keep current: the live
     * reading follows the frame, and the frame arrives sixty times a second.
     * A shut panel must not make the capture page compete with its own
     * broadcast.
     */
    open?: boolean;
    entries: readonly JournalEntry[];
    /** The pasteable log. Built by the journal; the header is added here. */
    logText: string;
    readings: readonly { id: number; label: string; travel: number; active: boolean }[];
    snapshot: string | null;
    capturing: boolean;
    probing: boolean;
    probe: StreamReading | null;
    onCaptureRaw: () => void;
    onToggleProbe: () => void;
  } = $props();

  const toReport = $derived(entries.filter((entry) => entry.kind === 'bug').length);

  let copied = $state(false);

  async function copy() {
    // The build and the browser go with it. They are the two facts a reader
    // needs before the first line, and the two nobody thinks to paste — the
    // user agent in particular names OBS's embedded Chromium (spec §2.1).
    const header = `HE Overlay ${__BUILD__}\n${navigator.userAgent}\n\n`;
    await navigator.clipboard?.writeText(header + logText);
    copied = true;
  }

  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
</script>

<details class="panel" bind:open>
  <summary>
    <span>Journal · {entries.length}</span>
    {#if toReport > 0}
      <span class="flag">{toReport} to report</span>
    {/if}
  </summary>

  <div class="body">
    <section>
      {#if entries.length === 0}
        <p class="empty">Nothing has happened worth writing down.</p>
      {:else}
        <ul class="log">
          {#each entries as entry, index (index)}
            <li data-kind={entry.kind}>
              <span class="at">+{seconds(entry.at)}</span>
              {entry.message}
            </li>
          {/each}
        </ul>
      {/if}
      <button data-action="copy" type="button" onclick={copy}>
        {copied ? 'Copied' : 'Copy log'}
      </button>
    </section>

    <!-- The one place a raw travel value is shown. The overlay never displays
         a number, on purpose — see "Deliberate deviations". -->
    <section>
      <h3>Live reading</h3>
      {#if readings.length === 0}
        <p class="empty">No keys configured.</p>
      {:else}
        <ul class="readings">
          {#each readings as reading (reading.id)}
            <li data-reading={reading.id} data-active={reading.active}>
              <span class="label">{reading.label}</span>
              <span class="at">#{reading.id}</span>
              <span class="travel">{reading.travel}</span>
              <span class="dot" aria-hidden="true"></span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <h3>Raw report</h3>
      <button data-action="capture" type="button" onclick={onCaptureRaw}>
        {capturing ? 'Waiting · press any key' : 'Capture raw report'}
      </button>
      {#if snapshot}
        <pre data-snapshot>{snapshot}</pre>
      {/if}
    </section>

    <section>
      <h3>Background stream</h3>
      <button data-action="probe" type="button" onclick={onToggleProbe}>
        {probing ? 'Stop probe' : 'Start background probe'}
      </button>
      <p class="hint">
        Start it, switch to the game, and keep typing. Chrome throttles timers in a background tab;
        the keyboard stream should not follow.
      </p>
      {#if probe}
        <ul class="readings">
          <li><span class="label">Reports</span><span class="travel">{probe.reports}</span></li>
          <li>
            <span class="label">Widest gap</span><span class="travel">{probe.maxGapMs} ms</span>
          </li>
          <li>
            <span class="label">Watched for</span><span class="travel"
              >{seconds(probe.sinceMs)}</span
            >
          </li>
        </ul>
      {/if}
    </section>

    <section>
      <h3>This build</h3>
      <p class="at" data-build>HE Overlay {__BUILD__}</p>
      <p class="at agent">{navigator.userAgent}</p>
    </section>
  </div>
</details>

<style>
  .panel {
    font: var(--he-font, 400 14px system-ui, sans-serif);
    background: var(--he-stage, #0b0d11);
    border-top: 1px solid var(--he-border, #1b1e27);
    padding: 11px 18px;
    color: var(--he-text-muted, #8b90a0);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 11px;
    list-style-position: outside;
  }
  summary:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 2px;
  }
  .flag {
    margin-left: auto;
    color: var(--he-override, #d9a05b);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 10px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  h3 {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--he-text-faint, #5a5f70);
  }

  ul {
    inline-size: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .log li,
  .readings li,
  .at,
  pre {
    font: var(--he-font-mono, 400 12px ui-monospace, monospace);
    font-size: 9.5px;
    color: var(--he-text-faint, #5a5f70);
    margin: 0;
  }
  .log li[data-kind='bug'] {
    color: var(--he-override, #d9a05b);
  }
  .at {
    color: var(--he-border-hover, #3a4054);
  }
  .agent {
    /* A user agent is one long unbreakable token; without this it widens the
       whole sidebar rather than wrapping. */
    overflow-wrap: anywhere;
  }

  .readings li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .readings .label {
    inline-size: 5.5rem;
    font-weight: 600;
    color: var(--he-text-muted, #8b90a0);
  }
  .readings .travel {
    margin-left: auto;
    color: var(--he-text, #dde1e9);
  }
  .readings .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--he-border-hover, #3a4054);
  }
  .readings li[data-active='true'] .dot {
    background: var(--he-accent, #7c9eff);
  }

  pre {
    inline-size: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 7px 9px;
    overflow-x: auto;
    background: var(--he-popover, #141722);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    color: var(--he-text-muted, #8b90a0);
  }

  .empty,
  .hint {
    margin: 0;
    font-size: 10px;
    line-height: 1.45;
    color: var(--he-text-faint, #5a5f70);
  }

  button {
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--he-accent, #7c9eff);
    background: none;
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 5px 10px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--he-border-hover, #3a4054);
    color: var(--he-accent-hover, #a5bcff);
  }
  button:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 2px;
  }
</style>
