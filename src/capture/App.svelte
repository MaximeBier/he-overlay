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
  import StatusBar from './StatusBar.svelte';
  import type { DecodeAnomaly } from '../keyboard/decode';
  import type { FrameKey } from '../protocol/messages';

  const storage = browserStorage();

  let settings = $state(loadSettings(storage));
  let keyboardStatus = $state<KeyboardStatus>('disconnected');
  let obsStatus = $state<ObsStatus>('idle');
  let keys = $state<FrameKey[]>([]);
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
        // The capture page discards config and frame: those are its own
        // messages (spec §6).
        if (message.t === 'hello') {
          // Spec §6: this reply is why the overlay speaks at all. A fresh
          // overlay holds nothing, and the emitter would otherwise deduplicate
          // its way to a blank page until the next keystroke.
          session.resend(performance.now());
        }
        if (message.t === 'hello' || message.t === 'beat') {
          overlays.seen(message.id, performance.now());
          refreshOverlays();
        }
        if (message.t === 'bye') {
          overlays.forget(message.id);
          refreshOverlays();
        }
      },
    });
  }

  let obs: ObsClient = createClient();

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
      keys = k;
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
    The password is stored in this browser and travels in the overlay URL below. Anyone with
    access to this machine can read it.
  </p>

  <label>
    Overlay URL for OBS
    <input readonly value={url} />
  </label>

  <ul>
    {#each keys as [id, travel, active] (id)}
      <li>{id}: {travel} {active ? '●' : '○'}</li>
    {/each}
  </ul>
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
  input[readonly] {
    min-width: 32rem;
    max-width: 100%;
  }
</style>
