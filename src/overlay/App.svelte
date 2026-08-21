<script lang="ts">
  import { createObsClient } from '../transport/obs';
  import { readOverlayParams } from './params';
  import { newOverlayId } from './identity';
  import KeyboardView from '../view/KeyboardView.svelte';
  import BrowserChrome from './BrowserChrome.svelte';
  import type { FrameKey } from '../protocol/messages';
  import type { ResolvedConfig } from '../config/schema';

  // The hash matters: the password is read from the fragment only, so that it
  // never reaches the access log of whoever hosts this page.
  const { port, password } = readOverlayParams(location.search, location.hash);
  const id = newOverlayId();

  let config = $state<ResolvedConfig | null>(null);
  let frame = $state<readonly FrameKey[]>([]);

  /**
   * Decided in `main.ts`, before the first render, and never revisited.
   *
   * Nothing about the host changes while the page lives, and a value that
   * cannot change must not be able to. The failure this forecloses is the one
   * that matters: decoration appearing on air, halfway through a stream,
   * because something re-evaluated.
   */
  let { decorated }: { decorated: boolean } = $props();

  let connected = $state(false);
  let rate = $state(0);
  /** Frames since the last beat. Only the decorated view ever reads the rate. */
  let received = 0;

  /** How often the overlay announces itself, and the window the rate is read over. */
  const BEAT_MS = 2000;

  const obs = createObsClient({
    url: `ws://localhost:${port}`,
    password,
    onStatus: (status) => {
      // Announced on identification, not right after connect(): broadcast
      // sends nothing until the handshake is through, so a hello posted any
      // earlier is simply dropped. This also re-announces the overlay after
      // OBS has been restarted under it.
      connected = status === 'identified';
      if (status === 'identified') obs.broadcast({ v: 1, t: 'hello', id });
    },
    onMessage: (message) => {
      // The overlay discards hello, beat and bye: those are its own messages
      // (spec §6).
      if (message.t === 'config') config = message.config;
      else if (message.t === 'frame') {
        frame = message.k;
        received += 1;
      }
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
    // Averaged over the beat rather than measured per frame: the figure is
    // read by a human, and one that flickers is harder to read than one that
    // settles. Costs nothing in OBS, where nothing displays it.
    rate = Math.round(received / (BEAT_MS / 1000));
    received = 0;
  }, BEAT_MS);

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
<BrowserChrome {decorated} {connected} {rate}>
  {#if config}
    <KeyboardView {config} {frame} pack />
  {/if}
</BrowserChrome>
