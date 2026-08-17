import { describe, it, expect, vi } from 'vitest';
import { createCaptureSession } from './session';
import type { FrameKey } from '../protocol/messages';
import { entry, report } from '../test/fixtures';

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

  it('hands the report timestamp over, so the retries can be spaced out', () => {
    const ensureConnected = vi.fn();
    const session = createCaptureSession({
      obs: { broadcast: vi.fn(), ensureConnected } as never,
      onKeys: () => {},
      onAnomaly: () => {},
    });

    session.handleReport(report(entry(1, 0x04, 10, 0x00)), 1234);

    expect(ensureConnected).toHaveBeenCalledWith(1234);
  });
});

describe('createCaptureSession — throughput', () => {
  it('sacrifices an intermediate variation but never the return to rest', () => {
    const { session, broadcast } = setup();

    session.handleReport(report(entry(174, 0x50, 400, 0x00)), 0);
    session.handleReport(report(entry(174, 0x50, 410, 0x00)), 1);
    session.handleReport(report(entry(174, 0x50, 0, 0x00)), 2);

    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenLastCalledWith({ v: 1, t: 'frame', k: [[174, 0, 0]] });
  });

  it('feeds the local preview even with the frames it sacrifices', () => {
    const { session, keys } = setup();

    session.handleReport(report(entry(174, 0x50, 400, 0x00)), 0);
    session.handleReport(report(entry(174, 0x50, 410, 0x00)), 1);

    expect(keys).toEqual([[[174, 400, 0]], [[174, 410, 0]]]);
  });

  it('carries the selected keys only', () => {
    const broadcast = vi.fn();
    const session = createCaptureSession({
      obs: { broadcast, ensureConnected: vi.fn() } as never,
      onKeys: () => {},
      onAnomaly: () => {},
      selectedIds: () => [174],
    });

    session.handleReport(report(entry(174, 0x50, 100, 0x00), entry(9, 0x1a, 900, 0x01)), 0);

    expect(broadcast).toHaveBeenCalledWith({ v: 1, t: 'frame', k: [[174, 100, 0]] });
  });
});
