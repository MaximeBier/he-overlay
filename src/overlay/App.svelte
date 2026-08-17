<script lang="ts">
  import { createObsClient } from '../transport/obs';
  import { readOverlayParams } from './params';
  import { newOverlayId } from './identity';
  import type { FrameKey } from '../protocol/messages';

  const { port, password } = readOverlayParams(location.search, location.hash);
  const id = newOverlayId();

  let keys = $state<FrameKey[]>([]);

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
      // The overlay discards hello and beat: those are its own messages (spec §6).
      if (message.t === 'frame') keys = message.k;
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

  const WIDTH = 60;
  const HEIGHT = 160;
  const GAP = 8;
</script>

<svg
  width={keys.length * (WIDTH + GAP)}
  height={HEIGHT}
  viewBox={`0 0 ${keys.length * (WIDTH + GAP)} ${HEIGHT}`}
>
  {#each keys as [id, travel, active], i (id)}
    <g transform={`translate(${i * (WIDTH + GAP)}, 0)`}>
      <rect width={WIDTH} height={HEIGHT} rx="8" fill={active ? '#3ba55d' : '#202225'} />
      <rect
        y={HEIGHT - (travel / 1023) * HEIGHT}
        width={WIDTH}
        height={(travel / 1023) * HEIGHT}
        rx="8"
        fill="#ffffff"
        opacity="0.35"
      />
    </g>
  {/each}
</svg>
