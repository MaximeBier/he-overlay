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
  import { resolve } from '../config/resolve';
  import { defaultConfig } from '../config/schema';
  import KeyboardView from '../view/KeyboardView.svelte';
  import StatusBar from './StatusBar.svelte';
  import type { DecodeAnomaly } from '../keyboard/decode';
  import type { FrameKey } from '../protocol/messages';

  const storage = browserStorage();

  let settings = $state(loadSettings(storage));
  let keyboardStatus = $state<KeyboardStatus>('disconnected');
  let obsStatus = $state<ObsStatus>('idle');
  let frame = $state<readonly FrameKey[]>([]);
  // The editing configuration. Still only settable from the console until the
  // learning flow of milestone 4 fills it in.
  let config = $state(defaultConfig());
  // Resolved once per change rather than once per frame: the preview and the
  // overlay must be handed the very same shape (spec §5.2).
  let resolved = $derived(resolve(config));
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
    onKeys: (k) => {
      frame = k;
      if (import.meta.env.DEV) {
        const dev = (globalThis as Record<string, unknown>).heOverlayDev as {
          onFrame?: ((keys: readonly FrameKey[]) => void) | null;
        };
        dev?.onFrame?.(k);
      }
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

  /**
   * Development-only door onto the editing configuration.
   *
   * The default configuration is empty and nothing else can fill it yet, so
   * without this there is no way to see the shared view render at all before
   * milestone 4. `import.meta.env.DEV` is statically false in a build, so this
   * whole block is dropped from the bundle OBS loads.
   *
   * `onFrame` covers what the preview cannot: matrix indices are specific to
   * each keyboard, and replacing the old `<li>{id}: {travel}</li>` list with
   * the shared view removed the only place they were visible. The diagnostics
   * panel of task 26 is where this belongs for good.
   *
   * To be removed at task 17, when JSON import makes it pointless.
   */
  if (import.meta.env.DEV) {
    (globalThis as Record<string, unknown>).heOverlayDev = {
      get config() {
        return config;
      },
      set config(next: typeof config) {
        config = next;
        broadcaster.publish(config);
      },
      get frame() {
        return frame;
      },
      /** Called on every decoded report, before the emitter throttles anything. */
      onFrame: null as ((keys: readonly FrameKey[]) => void) | null,
    };
  }

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
    The password is stored in this browser and travels in the overlay URL below. Anyone with
    access to this machine can read it.
  </p>

  <label>
    Overlay URL for OBS
    <input readonly value={url} />
  </label>

  <!-- The same component OBS renders, from the same resolved shape. The
       default configuration is empty, so nothing shows until milestone 4
       teaches the first key. -->
  <section class="preview">
    <KeyboardView config={resolved} {frame} />
  </section>
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
  .preview {
    background: var(--he-stage, #0b0d11);
    border-radius: var(--he-radius, 4px);
    padding: var(--he-space, 0.5rem);
    min-height: 4rem;
    align-self: stretch;
  }
  input[readonly] {
    min-width: 32rem;
    max-width: 100%;
  }
</style>
