<script lang="ts">
  import { untrack } from 'svelte';
  import { createKeyboardLink, type KeyboardStatus } from '../keyboard/device';
  import { createObsClient, type ObsStatus } from '../transport/obs';
  import { createCaptureSession } from './session';
  import type { FrameKey } from '../protocol/messages';

  let keyboardStatus = $state<KeyboardStatus>('disconnected');
  let obsStatus = $state<ObsStatus>('idle');
  let keys = $state<FrameKey[]>([]);
  let port = $state(4455);
  let password = $state('');

  // Built once with the initial port and password: in this proof of concept,
  // changing either field means reloading the page. Proper reconnection lands
  // in task 10. `untrack` states that capturing the initial value is the
  // intent here, not an oversight.
  const obs = createObsClient({
    url: `ws://localhost:${untrack(() => port)}`,
    password: untrack(() => password),
    onStatus: (s) => (obsStatus = s),
    onMessage: () => {},
  });

  const session = createCaptureSession({
    obs,
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
  <button onclick={() => obs.connect()}>Connect to OBS</button>

  <ul>
    {#each keys as [id, travel, active] (id)}
      <li>{id}: {travel} {active ? '●' : '○'}</li>
    {/each}
  </ul>
</main>
