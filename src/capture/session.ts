import { decodeAnalogReport, type DecodeAnomaly } from '../keyboard/decode';
import type { FrameKey } from '../protocol/messages';
import type { ObsClient } from '../transport/obs';

export interface CaptureSessionOptions {
  obs: Pick<ObsClient, 'broadcast' | 'ensureConnected'>;
  onKeys(keys: FrameKey[]): void;
  onAnomaly(anomaly: DecodeAnomaly): void;
}

export interface CaptureSession {
  /** Called synchronously from the `inputreport` handler. */
  handleReport(data: Uint8Array, timestamp: number): void;
}

export function createCaptureSession(options: CaptureSessionOptions): CaptureSession {
  return {
    handleReport(data) {
      const { entries, anomalies } = decodeAnalogReport(data);
      for (const anomaly of anomalies) options.onAnomaly(anomaly);

      const keys: FrameKey[] = entries.map((e) => [e.index, e.travel, e.active ? 1 : 0] as const);

      options.onKeys(keys);
      // OBS connection recovery driven by keyboard events: immune to the
      // throttling of background timers (spec §10).
      options.obs.ensureConnected();
      options.obs.broadcast({ v: 1, t: 'frame', k: keys });
    },
  };
}
