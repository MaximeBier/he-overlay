<script lang="ts">
  import { createKeyboardLink, type KeyboardStatus } from '../keyboard/device';
  import {
    createObsClient,
    DEFAULT_OBS_PORT,
    type ObsClient,
    type ObsStatus,
  } from '../transport/obs';
  import { createCaptureSession } from './session';
  import type { DecodeAnomaly } from '../keyboard/decode';
  import type { FrameKey } from '../protocol/messages';

  const MAX_PORT = 65535;

  let keyboardStatus = $state<KeyboardStatus>('disconnected');
  let obsStatus = $state<ObsStatus>('idle');
  let keys = $state<FrameKey[]>([]);
  let port = $state<number | null>(DEFAULT_OBS_PORT);
  let password = $state('');

  // The client is built on click, never on mount: the port and the password
  // are only known once they have been typed. Building it upfront would freeze
  // an empty password and make authentication impossible to satisfy.
  let obs: ObsClient | null = null;

  function connect() {
    // An empty number field binds to null, and `ws://localhost:null` throws
    // inside the WebSocket constructor — outside the click handler, where
    // nothing would catch it.
    const target = port !== null && port > 0 && port <= MAX_PORT ? port : DEFAULT_OBS_PORT;
    port = target;

    obs?.close();
    obs = createObsClient({
      url: `ws://localhost:${target}`,
      password,
      onStatus: (s) => (obsStatus = s),
      onMessage: () => {},
    });
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
      broadcast: (message) => obs?.broadcast(message),
      ensureConnected: () => obs?.ensureConnected(),
    },
    onKeys: (k) => (keys = k),
    onAnomaly: warnOnce,
  });

  const link = createKeyboardLink({
    hid: navigator.hid,
    onReport: (data, timestamp) => session.handleReport(data, timestamp),
    onStatus: (s) => (keyboardStatus = s),
  });

  void link.resume();
</script>

<main>
  <h1>HE Overlay — Capture</h1>

  <p>Keyboard: {keyboardStatus}</p>
  <button onclick={() => link.requestPermission()}>Allow keyboard</button>

  <p>OBS: {obsStatus}</p>
  <label>Port <input type="number" min="1" max={MAX_PORT} bind:value={port} /></label>
  <label>Password <input type="password" bind:value={password} /></label>
  <button onclick={connect}>Connect to OBS</button>

  <ul>
    {#each keys as [id, travel, active] (id)}
      <li>{id}: {travel} {active ? '●' : '○'}</li>
    {/each}
  </ul>
</main>
