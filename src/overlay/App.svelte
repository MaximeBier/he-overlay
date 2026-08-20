<script lang="ts">
  import { createObsClient } from '../transport/obs';
  import { readOverlayParams } from './params';
  import { newOverlayId } from './identity';
  import KeyboardView from '../view/KeyboardView.svelte';
  import type { FrameKey } from '../protocol/messages';
  import type { ResolvedConfig } from '../config/schema';

  // The hash matters: the password is read from the fragment only, so that it
  // never reaches the access log of whoever hosts this page.
  const { port, password } = readOverlayParams(location.search, location.hash);
  const id = newOverlayId();

  let config = $state<ResolvedConfig | null>(null);
  let frame = $state<readonly FrameKey[]>([]);

  const obs = createObsClient({
    url: `ws://localhost:${port}`,
    password,
    onStatus: (status) => {
      // Announced on identification, not right after connect(): broadcast
      // sends nothing until the handshake is through, so a hello posted any
      // earlier is simply dropped. This also re-announces the overlay after
      // OBS has been restarted under it.
      if (status === 'identified') obs.broadcast({ v: 1, t: 'hello', id });
    },
    onMessage: (message) => {
      // The overlay discards hello, beat and bye: those are its own messages
      // (spec §6).
      if (message.t === 'config') config = message.config;
      else if (message.t === 'frame') frame = message.k;
    },
  });

  obs.connect();

  // A timer is allowed here: OBS renders the overlay continuously (spec §2.2).
  // The beat doubles as a presence signal for the capture page, which counts
  // the connected overlays.
  setInterval(() => {
    // Same clock as the WebHID report timestamps the capture page feeds in:
    // both are measured from `performance.timeOrigin`.
    obs.ensureConnected(performance.now());
    obs.broadcast({ v: 1, t: 'beat', id });
  }, 2000);

  // A reload draws a new id, so leaving in silence has the departed page
  // counted next to the one replacing it — ten reloads while adjusting an
  // overlay read as eleven listeners. `pagehide` rather than `beforeunload`:
  // it also fires when the page is frozen into the back/forward cache, and it
  // is the event browsers actually guarantee.
  addEventListener('pagehide', () => obs.broadcast({ v: 1, t: 'bye', id }));
</script>

<!--
  Nothing is drawn until the capture has sent a configuration (spec §14). That
  is a choice, not an oversight: it removes any cache on the overlay side, and
  with it the question of when to invalidate one.
-->
{#if config}
  <KeyboardView {config} {frame} pack />
{/if}
