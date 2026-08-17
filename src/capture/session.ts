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
  /**
   * Sends the current state to an overlay that has just announced itself.
   *
   * Spec §6 gives this as the reason the overlay speaks at all: without it, an
   * overlay opened after the capture waits for the next change. And the
   * emitter deduplicates, so waiting can mean forever — a keyboard at rest
   * sends no report, and a fresh overlay would stay blank.
   */
  resend(now: number): void;
  /** Frames per second currently going out to OBS. */
  readonly rate: number;
}

export function createCaptureSession(options: CaptureSessionOptions): CaptureSession {
  const emitter = createFrameEmitter();
  let current: FrameKey[] = [];

  const deliver = (frame: FrameKey[]) => options.obs.broadcast({ v: 1, t: 'frame', k: frame });

  return {
    handleReport(data, timestamp) {
      const { entries, anomalies } = decodeAnalogReport(data);
      for (const anomaly of anomalies) options.onAnomaly(anomaly);

      current = buildFrame(entries, options.selectedIds?.() ?? null);

      // OBS connection recovery driven by keyboard events: immune to the
      // throttling of background timers (spec §10). The report timestamp is
      // what the client spaces its retries out on.
      options.obs.ensureConnected(timestamp);
      emitter.push(current, timestamp, deliver);

      // After the emission, not before: the preview and the rate are shown side
      // by side, and reading the rate first would always show the previous
      // frame's value — zero on the very first report.
      options.onKeys(current);
    },
    resend(now) {
      emitter.reset();
      emitter.push(current, now, deliver);
    },
    get rate() {
      return emitter.rate;
    },
  };
}
