<script lang="ts">
  import { createObsClient } from '../transport/obs';
  import { readOverlayParams } from './params';
  import type { FrameKey } from '../protocol/messages';

  const { port, password } = readOverlayParams(location.search);

  let keys = $state<FrameKey[]>([]);

  const obs = createObsClient({
    url: `ws://localhost:${port}`,
    password,
    onStatus: () => {},
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
    obs.ensureConnected();
    obs.broadcast({ v: 1, t: 'beat' });
  }, 2000);

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
