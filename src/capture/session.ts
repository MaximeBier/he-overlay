import { decodeAnalogReport, type DecodeAnomaly } from '../keyboard/decode';
import { buildFrame, createFrameEmitter } from '../protocol/emit';
import type { FrameKey } from '../protocol/messages';
import type { ObsClient } from '../transport/obs';

export interface CaptureSessionOptions {
  obs: Pick<ObsClient, 'broadcast' | 'ensureConnected'>;
  onKeys(keys: FrameKey[]): void;
  onAnomaly(anomaly: DecodeAnomaly): void;
  /** Identifiers of the configured keys, or `null` to carry them all. */
  selectedIds?(): readonly number[] | null;
}

export interface CaptureSession {
  /** Called synchronously from the `inputreport` handler. */
  handleReport(data: Uint8Array, timestamp: number): void;
  /** Frames per second currently going out to OBS. */
  readonly rate: number;
}

export function createCaptureSession(options: CaptureSessionOptions): CaptureSession {
  const emitter = createFrameEmitter();

  return {
    handleReport(data, timestamp) {
      const { entries, anomalies } = decodeAnalogReport(data);
      for (const anomaly of anomalies) options.onAnomaly(anomaly);

      const keys = buildFrame(entries, options.selectedIds?.() ?? null);

      // The local preview gets everything: it is not throttled, being the same
      // component as the overlay without the network in between.
      options.onKeys(keys);
      // OBS connection recovery driven by keyboard events: immune to the
      // throttling of background timers (spec §10).
      options.obs.ensureConnected();

      if (emitter.push(keys, timestamp) !== null) {
        options.obs.broadcast({ v: 1, t: 'frame', k: keys });
      }
    },
    get rate() {
      return emitter.rate;
    },
  };
}
