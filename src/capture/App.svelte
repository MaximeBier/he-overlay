<script lang="ts">
  import { untrack } from 'svelte';
  import { createKeyboardLink, type KeyboardStatus } from '../keyboard/device';
  import {
    createObsClient,
    MAX_PORT,
    normalizePort,
    type ObsClient,
    type ObsStatus,
  } from '../transport/obs';
  import { createCaptureSession } from './session';
  import { loadSettings, saveSettings, overlayUrl, browserStorage } from './settings';
  import { createOverlayRegistry } from './overlays';
  import { createConfigBroadcaster } from './broadcast';
  import { addLearnedKey, pickLearned, removeKey, removeKeys } from './learn';
  import { loadLayoutMap, resolveLayout, type LayoutMapLike } from '../keyboard/labels';
  import { setLayoutOverride } from '../config/edit';
  import { createAxisSuggester } from './suggest';
  import { resolve } from '../config/resolve';
  import { recommendedSize } from '../view/scene';
  import KeyLearner from './KeyLearner.svelte';
  import LayoutEditor from './LayoutEditor.svelte';
  import StylePanel from './StylePanel.svelte';
  import { loadConfig, saveConfig, exportConfig, importConfig } from '../config/storage';
  import type { OverlayConfig } from '../config/schema';
  import StatusBar from './StatusBar.svelte';
  import type { DecodeAnomaly } from '../keyboard/decode';
  import type { FrameKey } from '../protocol/messages';

  const storage = browserStorage();

  let settings = $state(loadSettings(storage));
  let keyboardStatus = $state<KeyboardStatus>('disconnected');
  let obsStatus = $state<ObsStatus>('idle');
  let frame = $state<readonly FrameKey[]>([]);
  const stored = loadConfig(storage);
  let config = $state(stored.config);
  /** What to say about the configuration: a load problem, or an import result. */
  let notice = $state(loadNotice(stored.problem, stored.dropped));
  let learning = $state(false);
  let selectedIds = $state<number[]>([]);
  let layout = $state<LayoutMapLike | null>(null);
  void loadLayoutMap(navigator).then((map) => (layout = map));

  // What the labels are actually read from: the explicit choice always beats
  // detection, which is the only reason the choice exists (spec §8.6).
  const activeLayout = $derived(resolveLayout(config.layoutOverride, layout));

  // The packed size, which is the only one worth quoting: the raw box has an
  // empty top and left by construction (spec §5.4).
  const size = $derived(recommendedSize(resolve(config)));

  const suggester = createAxisSuggester();

  /**
   * Bumped when the suggester learns something, and read by the list below.
   *
   * Its three sets are plain data, so nothing about them is reactive. Polling
   * them on every report is not an option either: reports arrive at up to a
   * thousand a second and the answer changes perhaps twice a session.
   */
  let observed = $state(0);

  /**
   * The configured keys the suggester currently speaks for.
   *
   * Derived, never cached — and that is the fix for a real defect. The first
   * version kept a snapshot refreshed only when the suggester learned
   * something, which lost exactly the keys that matter: adding a key means
   * pressing it, so it reaches full travel *before* it exists in
   * `config.keys`. The refresh then filtered a list without it, and every
   * later press taught the suggester nothing new — so it never spoke again.
   * Reading `config` here means the list also follows a key being added.
   */
  const suggestedIds = $derived.by(() => {
    void observed;
    return config.keys.map((key) => key.id).filter((id) => suggester.suggests(id));
  });

  let rate = $state(0);
  let overlayCount = $state(0);

  const overlays = createOverlayRegistry();

  /** A synchronous reading, not a timer: allowed on the capture page. */
  function refreshOverlays() {
    overlayCount = overlays.count(performance.now());
  }

  // An empty number field binds to null, and `ws://localhost:null` throws
  // inside the WebSocket constructor. The displayed URL has to survive that
  // half-typed state too, so it reads the normalized port rather than the field.
  let port = $derived(normalizePort(settings.port));
  let url = $derived(overlayUrl(location.origin, { port, password: settings.password }));

  function createClient(): ObsClient {
    return createObsClient({
      url: `ws://localhost:${untrack(() => port)}`,
      password: untrack(() => settings.password),
      onStatus: (s) => {
        obsStatus = s;
        // Nothing left while the socket was down, and an overlay on the other
        // side may have been waiting the whole time.
        if (s === 'identified') broadcaster.onIdentified();
        if (s !== 'identified') {
          // Nobody is reachable through a dead socket, and expiry is only
          // computed on read: a count left standing would never come down.
          overlays.clear();
          refreshOverlays();
          // Same for the rate. Its window ages on keyboard reports, so with
          // nobody typing the last good figure would stay on screen — a
          // throughput advertised beside a dot saying the link is dead. No
          // frame is leaving, and zero is simply the truth.
          rate = 0;
        }
      },
      onMessage: (message) => {
        // Presence and configuration are both driven by these three messages,
        // so one place reads them (spec §6).
        broadcaster.onOverlayMessage(message, performance.now());
        // Spec §6: a fresh overlay holds nothing, and the emitter would
        // otherwise deduplicate its way to a blank page until the next
        // keystroke.
        if (message.t === 'hello') session.resend(performance.now());
        refreshOverlays();
      },
    });
  }

  let obs: ObsClient = createClient();

  const broadcaster = createConfigBroadcaster({
    obs: { broadcast: (message) => obs.broadcast(message) },
    current: () => config,
    registry: overlays,
  });

  /**
   * Credentials are persisted and the client rebuilt, never patched: url and
   * password are read once, when the socket opens. A password typed after the
   * client was built is the milestone 1 defect that made authentication
   * impossible to satisfy.
   */
  function reconnect() {
    settings.port = port;
    saveSettings(storage, settings);
    obs.close();
    obs = createClient();
    obs.connect();
  }

  /**
   * The one door every configuration change goes through — learning, moving,
   * styling, mode. Persisting without broadcasting, or the reverse, is the
   * failure this shape makes unwritable.
   */
  function updateConfig(next: OverlayConfig) {
    config = next;
    saveConfig(storage, config);
    broadcaster.publish(config);
  }

  function droppedKeys(dropped: number): string {
    const plural = dropped === 1 ? ['key', 'was'] : ['keys', 'were'];
    return `${dropped} ${plural[0]} could not be read and ${plural[1]} left out.`;
  }

  /**
   * What to say about the configuration found in storage at startup.
   *
   * Kept apart from the import wording on purpose. The two failures look alike
   * and mean opposite things: here the saved profile really was unusable, on
   * an import nothing was lost at all. Sharing one sentence told people they
   * had just lost their layout when they had not.
   */
  function loadNotice(problem: 'unreadable' | 'too-new' | null, dropped: number): string | null {
    if (problem === 'unreadable') {
      return (
        'Your saved configuration could not be read, so this starts from the defaults. ' +
        'The unreadable copy has been kept aside.'
      );
    }
    if (problem === 'too-new') {
      return (
        'Your saved configuration was written by a newer version of HE Overlay. This starts ' +
        'from the defaults rather than guessing at it; your profile has been kept aside, ' +
        'not overwritten.'
      );
    }
    return dropped > 0 ? droppedKeys(dropped) : null;
  }

  function downloadProfile() {
    const blob = new Blob([exportConfig(config)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: 'he-overlay.json',
    });
    link.click();
    URL.revokeObjectURL(url);
  }

  async function uploadProfile(event: Event & { currentTarget: HTMLInputElement }) {
    // Held before the await: the DOM clears `currentTarget` once the dispatch
    // ends, so reading it afterwards throws.
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    let text: string;
    try {
      // `File.text()` rejects when the file moved, changed, or sat on a volume
      // that went away between the picker closing and the read. Unhandled, the
      // rejection belongs to nobody: no message, and the input never cleared,
      // so the second attempt on the same file does nothing at all.
      text = await file.text();
    } catch {
      notice = 'That file could not be read. Your configuration is unchanged.';
      input.value = '';
      return;
    }

    // Cleared either way, or picking the same file twice in a row fires
    // nothing — which is exactly what someone does after fixing it by hand.
    input.value = '';

    const result = importConfig(text);
    if (!result.ok) {
      // Never the startup wording: nothing was lost here. The saved profile is
      // intact and the current one untouched.
      notice =
        result.reason === 'too-new'
          ? 'That profile was written by a newer version of HE Overlay. Nothing was ' +
            'imported, and your configuration is unchanged.'
          : 'That file is not a HE Overlay profile. Nothing was imported, and your ' +
            'configuration is unchanged.';
      return;
    }

    updateConfig(result.config);
    notice =
      result.dropped > 0 ? `Profile imported. ${droppedKeys(result.dropped)}` : 'Profile imported.';
  }

  /**
   * One warning per anomaly kind and per session. A wrong assumption about
   * report length would otherwise emit `bad-length` on every single report —
   * hundreds a second, enough to lock up the devtools. The readable log is
   * task 26.
   */
  const warned = new Set<DecodeAnomaly['kind']>();

  function warnOnce(anomaly: DecodeAnomaly) {
    if (warned.has(anomaly.kind)) return;
    warned.add(anomaly.kind);
    console.warn('decode anomaly', anomaly);
  }

  const session = createCaptureSession({
    // Indirection through the current client: the session outlives any single
    // connection, and keeps working across a port or password change.
    obs: {
      broadcast: (message) => obs.broadcast(message),
      ensureConnected: (now) => obs.ensureConnected(now),
    },
    // Only the configured keys travel: the overlay filters nothing (spec §6).
    selectedIds: () => config.keys.map((key) => key.id),
    onEntries: (entries) => {
      // Before the learning guard: a key is watched from the moment it is
      // seen, not from the moment someone happens to be adding one.
      if (suggester.observe(entries)) observed += 1;
      if (!learning) return;
      const learned = pickLearned(entries);
      if (!learned) return;
      // One key per activation: the mode closes itself, so holding the key
      // down cannot add it a second time.
      learning = false;
      updateConfig(addLearnedKey(config, learned, activeLayout));
    },
    onKeys: (k) => {
      frame = k;
      rate = session.rate;
      // Expiry is computed on read, so an overlay that went away only stops
      // being counted once something asks. Without this it would linger until
      // another overlay beats — and if it was the only one, forever.
      refreshOverlays();
    },
    onAnomaly: warnOnce,
  });

  const link = createKeyboardLink({
    hid: navigator.hid,
    onReport: (data, timestamp) => session.handleReport(data, timestamp),
    onStatus: (s) => (keyboardStatus = s),
  });

  // Nothing to do on switching the machine on (spec §10): a keyboard already
  // authorised resumes without a gesture, and the credentials come from the
  // previous session.
  void link.resume();
  obs.connect();
</script>

<StatusBar keyboard={keyboardStatus} obs={obsStatus} {rate} overlays={overlayCount} />

<main>
  <h1>HE Overlay — Capture</h1>

  <button onclick={() => link.requestPermission()}>Allow keyboard</button>

  <label>
    OBS port
    <input type="number" min="1" max={MAX_PORT} bind:value={settings.port} onchange={reconnect} />
  </label>
  <label>
    OBS password
    <input type="password" bind:value={settings.password} onchange={reconnect} />
  </label>
  <p class="warning">
    The password is stored in this browser and travels in the overlay URL below. Anyone with access
    to this machine can read it.
  </p>

  <label>
    Overlay URL for OBS
    <input readonly value={url} />
  </label>

  {#if config.keys.length > 0}
    <p class="quiet">
      Recommended source size: <code>{size.width} × {size.height}</code> — the overlay pulls the keys
      into the top-left corner, so this is smaller than the editor stage.
    </p>
  {/if}

  <div class="profile">
    <button onclick={downloadProfile}>Export profile</button>
    <label>
      Import profile
      <input type="file" accept="application/json" onchange={uploadProfile} />
    </label>
  </div>

  {#if notice}
    <p class="notice" role="status">{notice}</p>
  {/if}

  <div class="profile">
    <KeyLearner bind:learning onCancel={() => (learning = false)} />
  </div>

  <!-- The same component OBS renders, from the same resolved shape — with the
       editor decorations on, which the broadcast never gets. -->
  <LayoutEditor
    {config}
    {frame}
    bind:selectedIds
    onChange={updateConfig}
    layout={activeLayout}
    suggestAxis={selectedIds.length === 1 && suggestedIds.includes(selectedIds[0]!)}
    onDismissSuggestion={() => {
      // Proposing a mode for a heterogeneous group would mean nothing, so the
      // suggestion is single-selection only — and so is dismissing it.
      suggester.dismiss(selectedIds[0]!);
      observed += 1;
    }}
  />

  <!-- Global appearance. Per-key overrides live in the popover the editor
       anchors to the selection, never here (spec §16.4). -->
  <StylePanel {config} onChange={updateConfig} />

  <!-- Deliberately discreet, and placed last: an edge case that matters only
       when detection got it wrong (spec §16.4, §8.6). Changing it relabels the
       keys already added — that is what it is for. -->
  <label class="quiet">
    Keyboard layout
    <select
      value={config.layoutOverride}
      onchange={(event) =>
        updateConfig(
          setLayoutOverride(
            config,
            event.currentTarget.value as OverlayConfig['layoutOverride'],
            layout,
          ),
        )}
    >
      <option value="auto">Auto — detected</option>
      <option value="azerty">AZERTY</option>
      <option value="qwerty">QWERTY</option>
      <option value="qwertz">QWERTZ</option>
    </select>
  </label>

  {#if config.keys.length > 0}
    <ul class="keys">
      {#each config.keys as key (key.id)}
        <li>
          <span class="label">{key.label}</span>
          <span class="index">index {key.id}</span>
          <button onclick={() => updateConfig(removeKey(config, key.id))}>Remove</button>
        </li>
      {/each}
    </ul>

    {#if selectedIds.length > 1}
      <!-- Under the list, not in the editor: the popover already deletes the
           selection, and a second button on the stage would sit next to it
           saying the same thing (spec §16.4). -->
      <button
        onclick={() => {
          updateConfig(removeKeys(config, selectedIds));
          selectedIds = [];
        }}
      >
        Delete {selectedIds.length} selected keys
      </button>
    {/if}
  {/if}
</main>

<style>
  main {
    font: var(--he-font, 400 14px system-ui, sans-serif);
    padding: 0.75rem;
    display: grid;
    gap: 0.5rem;
    justify-items: start;
  }
  .warning {
    color: var(--he-override);
    margin: 0;
  }
  .profile {
    display: flex;
    gap: var(--he-space, 0.5rem);
    align-items: center;
    flex-wrap: wrap;
  }
  .notice {
    color: var(--he-override, #d9a05b);
    margin: 0;
  }
  .keys {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .keys li {
    display: flex;
    gap: var(--he-space, 0.5rem);
    align-items: center;
  }
  .label {
    min-width: 4rem;
    font-weight: 700;
  }
  .quiet {
    display: flex;
    gap: var(--he-space, 0.5rem);
    align-items: center;
    font-size: 12px;
    color: var(--he-text-muted, #8b90a0);
  }
  .index {
    color: var(--he-text-muted, #8b90a0);
  }
  input[readonly] {
    min-width: 32rem;
    max-width: 100%;
  }
</style>
