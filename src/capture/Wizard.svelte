<script lang="ts">
  import { stepNumber, type WizardStep } from './wizard';
  import type { ConnectionSettings } from './settings';
  import type { KeyboardStatus } from '../keyboard/device';

  /**
   * The first-run setup, as boards `6a`–`6c` draw it.
   *
   * **It orchestrates, it does not duplicate** (spec §9.1). Nothing here
   * configures anything the editor cannot: the keyboard button is the one from
   * the toolbar, the port and password are the same two fields, and the last
   * step is the ordinary learning mode with a banner over it. What the wizard
   * adds is an order, and the refusal to move on before each step has proved
   * itself.
   */
  let {
    step,
    keyboard,
    device,
    settings,
    url,
    learning = $bindable(false),
    added,
    onAllowKeyboard,
    onReconnect,
    onSkip,
  }: {
    step: WizardStep;
    keyboard: KeyboardStatus;
    /** The product name of the keyboard that answered, for the step 1 tick. */
    device: string | null;
    /** The live settings object: the same two fields the editor writes to. */
    settings: ConnectionSettings;
    url: string;
    learning: boolean;
    /** The label of the key that just landed, for the step 3 confirmation. */
    added: string | null;
    onAllowKeyboard: () => void;
    onReconnect: () => void;
    onSkip: () => void;
  } = $props();

  const ROWS: { step: WizardStep; label: string }[] = [
    { step: 'keyboard', label: 'Connect your keyboard' },
    { step: 'obs', label: 'Connect OBS (WebSocket + browser source)' },
    { step: 'keys', label: 'Add the keys you want on stream' },
  ];

  const TITLES: Record<string, string> = {
    keyboard: 'Connect your keyboard',
    obs: 'Connect OBS',
  };

  const at = $derived(stepNumber(step));

  /**
   * Never named `state`: a local binding of that name turns every `$state`
   * in the file into a store subscription on it — silently, with no compiler
   * error, and the component fails at render with "state is not a store".
   */
  function rowState(row: WizardStep): 'done' | 'current' | 'pending' {
    const index = stepNumber(row);
    if (index < at) return 'done';
    return index === at ? 'current' : 'pending';
  }

  /** What a row says on its right, and only while it is done or in progress. */
  function note(row: WizardStep): string | null {
    if (row === 'keyboard') return device ?? (rowState(row) === 'current' ? 'searching…' : null);
    if (row === 'obs' && rowState(row) === 'current') return 'waiting…';
    return null;
  }

  let revealed = $state(false);
  let copied = $state(false);

  async function copy() {
    await navigator.clipboard?.writeText(url);
    copied = true;
  }

  /**
   * Arms the capture once, on arrival at the last step.
   *
   * The mockup shows step 3 already listening, and asking for one more click
   * to begin the step one has just reached explains nothing. Once, though:
   * re-arming on every pass would make cancelling a fight the user cannot win,
   * with a button that refuses to turn off.
   */
  let armed = $state(false);
  $effect(() => {
    if (step !== 'keys') {
      armed = false;
      return;
    }
    if (!armed) {
      armed = true;
      learning = true;
    }
  });
</script>

{#if step === 'keys'}
  <!-- No card here: a 410 px panel in the middle of the stage would cover the
       one thing this step exists to show (board 6c). -->
  <div class="banner" data-banner role="status">
    <span class="beacon" aria-hidden="true"></span>
    <span class="lines">
      <strong>Listening · press any key</strong>
      {#if added}<span class="added">{added} added</span>{/if}
    </span>
    <button class="skip" data-action="skip" type="button" onclick={onSkip}>Skip tutorial</button>
  </div>
{:else}
  <div class="card" data-card>
    <span class="eyebrow">SETUP {at}/3</span>
    <h2>{TITLES[step]}</h2>

    {#if step === 'keyboard'}
      <p class="lede">
        Plug in a Wooting or any analog HE keyboard. If travel values stay at zero, close Wootility:
        it locks the analog stream.
      </p>
    {:else}
      <p class="lede">
        <b>a.</b> In OBS: Tools → WebSocket Server Settings → tick “Enable WebSocket server” and
        “Enable Authentication”, and keep the generated password.
        <br />
        <b>b.</b> Copy the port and password into the fields below.
      </p>

      <div class="fields">
        <label>
          Server port
          <input
            type="number"
            min="1"
            max="65535"
            bind:value={settings.port}
            onchange={onReconnect}
          />
        </label>
        <label>
          Server password
          <span class="secret">
            <input
              type={revealed ? 'text' : 'password'}
              bind:value={settings.password}
              onchange={onReconnect}
            />
            <button type="button" onclick={() => (revealed = !revealed)}>
              {revealed ? 'hide' : 'show'}
            </button>
          </span>
        </label>
      </div>

      <p class="lede"><b>c.</b> Sources → + → Browser, and paste the ready-made URL.</p>

      <div class="url">
        <input data-url readonly value={url} aria-label="Overlay URL for OBS" />
        <button class="primary" data-action="copy" type="button" onclick={copy}>
          {copied ? 'Copied' : 'Copy URL'}
        </button>
      </div>

      <p class="fine">
        Port and password stay between OBS and this app, on your machine — we never receive them.
        Keep the random password OBS generated, and avoid showing this URL on stream.
      </p>
    {/if}

    <ol class="steps">
      {#each ROWS as row (row.step)}
        <li data-row={row.step} data-state={rowState(row.step)}>
          <span class="bullet" aria-hidden="true">
            {rowState(row.step) === 'done' ? '✓' : stepNumber(row.step)}
          </span>
          <span class="label">{row.label}</span>
          {#if note(row.step)}<span class="note">{note(row.step)}</span>{/if}
        </li>
      {/each}
    </ol>

    <div class="actions">
      {#if step === 'keyboard'}
        <!-- Naming the gesture: "Rescan devices" in front of someone who has
             never granted WebHID is a button that appears to do nothing, since
             what the browser needs is a click it can attach a prompt to. -->
        <button class="secondary" data-action="keyboard" type="button" onclick={onAllowKeyboard}>
          {keyboard === 'no-permission' ? 'Allow keyboard' : 'Rescan devices'}
        </button>
      {/if}
      <button class="skip" data-action="skip" type="button" onclick={onSkip}>Skip tutorial</button>
    </div>
  </div>
{/if}

<style>
  .card {
    inline-size: 410px;
    max-inline-size: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 26px;

    font: var(--he-font, 400 14px system-ui, sans-serif);
    color: var(--he-text, #dde1e9);
    background: var(--he-popover, #141722);
    border: 1px solid var(--he-border-popover, #262b3a);
    border-radius: var(--he-radius-panel, 6px);
  }
  .eyebrow {
    font: var(--he-font-mono, 400 12px ui-monospace, monospace);
    font-size: 10.5px;
    letter-spacing: 0.08em;
    color: var(--he-accent, #7c9eff);
  }
  h2 {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
  }
  .lede {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--he-text-muted, #8b90a0);
    text-wrap: pretty;
  }
  .lede b {
    color: var(--he-accent, #7c9eff);
    font-weight: 600;
  }
  .fine {
    margin: 0;
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--he-text-faint, #5a5f70);
    text-wrap: pretty;
  }

  .fields {
    display: flex;
    gap: 12px;
  }
  label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 11px;
    color: var(--he-text-muted, #8b90a0);
  }
  .secret {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .secret input {
    min-inline-size: 0;
    flex: 1;
  }
  .secret button {
    all: unset;
    cursor: pointer;
    font-size: 10px;
    color: var(--he-accent, #7c9eff);
  }
  .secret button:hover {
    color: var(--he-accent-hover, #a5bcff);
  }

  input {
    box-sizing: border-box;
    inline-size: 100%;
    font: var(--he-font-mono, 400 12px ui-monospace, monospace);
    font-size: 11px;
    color: var(--he-text, #dde1e9);
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 7px 9px;
  }
  input:focus-visible {
    outline: 1px solid var(--he-accent, #7c9eff);
  }

  .url {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .url input {
    flex: 1;
    min-inline-size: 0;
    color: var(--he-text-faint, #5a5f70);
    text-overflow: ellipsis;
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 16px 0 0;
    list-style: none;
    border-top: 1px solid var(--he-border, #1b1e27);
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    color: var(--he-text-faint, #5a5f70);
  }
  .bullet {
    flex: none;
    inline-size: 18px;
    block-size: 18px;
    border-radius: 50%;
    border: 1px solid var(--he-border-popover, #262b3a);
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 700;
  }
  li[data-state='current'] {
    color: var(--he-text, #dde1e9);
  }
  li[data-state='current'] .label {
    font-weight: 600;
  }
  li[data-state='current'] .bullet {
    color: var(--he-bg, #0e1015);
    background: var(--he-accent, #7c9eff);
    border-color: var(--he-accent, #7c9eff);
  }
  li[data-state='done'] {
    color: var(--he-text-muted, #8b90a0);
  }
  li[data-state='done'] .bullet {
    color: var(--he-ok, #4caf7d);
    border-color: var(--he-ok, #4caf7d);
  }
  .note {
    margin-left: auto;
    font-size: 10px;
    color: var(--he-override, #d9a05b);
  }
  li[data-state='done'] .note {
    color: var(--he-text-faint, #5a5f70);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .primary,
  .secondary {
    all: unset;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    border-radius: var(--he-radius-control, 5px);
    padding: 8px 16px;
    white-space: nowrap;
  }
  .secondary {
    color: var(--he-text, #dde1e9);
    border: 1px solid var(--he-border-popover, #262b3a);
  }
  .secondary:hover {
    border-color: var(--he-border-hover, #3a4054);
    background: var(--he-surface, #151823);
  }
  .primary {
    color: var(--he-bg, #0e1015);
    background: var(--he-accent, #7c9eff);
  }
  .primary:hover {
    background: var(--he-accent-hover, #a5bcff);
  }
  .skip {
    all: unset;
    cursor: pointer;
    font-size: 11px;
    color: var(--he-text-faint, #5a5f70);
  }
  .skip:hover {
    color: var(--he-text-muted, #8b90a0);
  }
  .primary:focus-visible,
  .secondary:focus-visible,
  .skip:focus-visible,
  .secret button:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 2px;
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 13px 18px;
    font: var(--he-font, 400 14px system-ui, sans-serif);
    color: var(--he-text, #dde1e9);
    background: var(--he-popover, #141722);
    border: 1px solid var(--he-accent, #7c9eff);
    border-radius: var(--he-radius-panel, 6px);
  }
  .beacon {
    flex: none;
    inline-size: 9px;
    block-size: 9px;
    border-radius: 50%;
    background: var(--he-accent, #7c9eff);
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .lines strong {
    font-size: 13px;
    font-weight: 700;
  }
  .added {
    font-size: 11.5px;
    color: var(--he-ok, #4caf7d);
  }
</style>
