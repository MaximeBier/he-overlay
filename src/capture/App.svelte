<script lang="ts">
  import { createKeyboardLink, type KeyboardStatus } from '../keyboard/device';
  import { createObsClient, type ObsClient, type ObsStatus } from '../transport/obs';
  import { createCaptureSession } from './session';
  import type { FrameKey } from '../protocol/messages';

  let keyboardStatus = $state<KeyboardStatus>('disconnected');
  let obsStatus = $state<ObsStatus>('idle');
  let keys = $state<FrameKey[]>([]);
  let port = $state(4455);
  let password = $state('');

  // The client is built on click, never on mount: the port and the password
  // are only known once they have been typed. Building it upfront would freeze
  // an empty password and make authentication impossible to satisfy.
  let obs: ObsClient | null = null;

  function connect() {
    obs?.close();
    obs = createObsClient({
      url: `ws://localhost:${port}`,
      password,
      onStatus: (s) => (obsStatus = s),
      onMessage: () => {},
    });
    obs.connect();
  }

  const session = createCaptureSession({
    // Indirection through the current client: the session outlives any single
    // connection, and keeps working across a port or password change.
    obs: {
      broadcast: (message) => obs?.broadcast(message),
      ensureConnected: () => obs?.ensureConnected(),
    },
    onKeys: (k) => (keys = k),
    onAnomaly: (a) => console.warn('decode anomaly', a),
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
  <label>Port <input type="number" bind:value={port} /></label>
  <label>Password <input type="password" bind:value={password} /></label>
  <button onclick={connect}>Connect to OBS</button>

  <ul>
    {#each keys as [id, travel, active] (id)}
      <li>{id}: {travel} {active ? '●' : '○'}</li>
    {/each}
  </ul>
</main>
