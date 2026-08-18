<script lang="ts">
  import { buildScene } from './scene';
  import type { ResolvedConfig } from '../config/schema';
  import type { FrameKey } from '../protocol/messages';

  let {
    config,
    frame,
    decorations = false,
  }: {
    config: ResolvedConfig;
    frame: readonly FrameKey[];
    /**
     * Cues reserved for the editor: dashed border and AXIS label.
     * False by default - the overlay must never display them (spec 16.3).
     */
    decorations?: boolean;
  } = $props();

  const scene = $derived(buildScene(config, frame));
</script>

<svg width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
  {#each scene.keys as key (key.id)}
    <g opacity={key.opacity}>
      <rect x={key.x} y={key.y} width={key.w} height={key.h} rx={key.radius} fill={key.baseFill} />
      <rect
        x={key.fill.x}
        y={key.fill.y}
        width={key.fill.w}
        height={key.fill.h}
        rx={key.radius}
        fill={key.fill.color}
      />
      <rect
        x={key.x + 0.5}
        y={key.y + 0.5}
        width={Math.max(0, key.w - 1)}
        height={Math.max(0, key.h - 1)}
        rx={key.radius}
        fill="none"
        stroke={key.borderColor}
        stroke-dasharray={decorations && key.axis ? '3 2' : undefined}
      />
      <text
        x={key.x + key.w / 2}
        y={key.y + key.h / 2}
        text-anchor="middle"
        dominant-baseline="middle"
        fill={key.labelFill}
        font-family={key.fontFamily}
        font-weight={key.fontWeight}
        font-size={key.fontSize}
      >
        {key.label}
      </text>
      {#if decorations && key.axis}
        <text
          x={key.x + key.w - 4}
          y={key.y + 9}
          text-anchor="end"
          fill={key.labelFill}
          font-family={key.fontFamily}
          font-size="8"
          opacity="0.75"
        >
          AXIS
        </text>
      {/if}
    </g>
  {/each}
</svg>
