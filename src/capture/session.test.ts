import { describe, it, expect, vi } from 'vitest';
import { createCaptureSession } from './session';
import type { FrameKey } from '../protocol/messages';

function entry(index: number, usage: number, travel: number, low: number): number[] {
  const field = (travel << 6) | low;
  return [index, usage, field & 0xff, (field >> 8) & 0xff];
}

function report(...entries: number[][]): Uint8Array {
  const buf = new Uint8Array(64);
  buf.set(entries.flat());
  return buf;
}

function setup() {
  const broadcast = vi.fn();
  const keys: FrameKey[][] = [];
  const anomalies: unknown[] = [];
  const session = createCaptureSession({
    obs: { broadcast, ensureConnected: vi.fn() } as never,
    onKeys: (k) => keys.push(k),
    onAnomaly: (a) => anomalies.push(a),
  });
  return { session, broadcast, keys, anomalies };
}

describe('createCaptureSession', () => {
  it('broadcasts one frame per decoded report', () => {
    const { session, broadcast } = setup();

    session.handleReport(report(entry(174, 0x50, 996, 0x01)), 0);

    expect(broadcast).toHaveBeenCalledWith({ v: 1, t: 'frame', k: [[174, 996, 1]] });
  });

  it('transmits actuation even at partial travel', () => {
    const { session, broadcast } = setup();

    session.handleReport(report(entry(30, 0x16, 300, 0x00)), 0);

    expect(broadcast).toHaveBeenCalledWith({ v: 1, t: 'frame', k: [[30, 300, 0]] });
  });

  it('feeds the local preview with the very same keys', () => {
    const { session, keys } = setup();

    session.handleReport(report(entry(174, 0x50, 996, 0x01)), 0);

    expect(keys).toEqual([[[174, 996, 1]]]);
  });

  it('surfaces decode anomalies without broadcasting an unknown entry', () => {
    const { session, broadcast, anomalies } = setup();

    session.handleReport(report(entry(30, 0x16, 500, 0x02)), 0);

    expect(anomalies).toEqual([{ kind: 'unknown-low-bits', index: 30, field: (500 << 6) | 0x02 }]);
    expect(broadcast).toHaveBeenCalledWith({ v: 1, t: 'frame', k: [] });
  });

  it('retries the OBS connection on every report: event-driven, timer-free', () => {
    const ensureConnected = vi.fn();
    const session = createCaptureSession({
      obs: { broadcast: vi.fn(), ensureConnected } as never,
      onKeys: () => {},
      onAnomaly: () => {},
    });

    session.handleReport(report(entry(1, 0x04, 10, 0x00)), 0);

    expect(ensureConnected).toHaveBeenCalled();
  });
});
