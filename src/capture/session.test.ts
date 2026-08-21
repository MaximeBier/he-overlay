import { describe, it, expect, vi } from 'vitest';
import { createCaptureSession } from './session';
import type { FrameKey } from '../protocol/messages';
import { entry, report } from '../test/fixtures';

function setup() {
  const broadcast = vi.fn(() => true);
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
    const broadcast = vi.fn(() => true);
    const session = createCaptureSession({
      obs: { broadcast, ensureConnected: vi.fn() } as never,
      onKeys: () => {},
      onAnomaly: () => {},
      selectedIds: () => [174],
    });

    session.handleReport(report(entry(174, 0x50, 100, 0x00), entry(9, 0x1a, 900, 0x01)), 0);

    expect(broadcast).toHaveBeenCalledWith({ v: 1, t: 'frame', k: [[174, 100, 0]] });
  });

  it('reports the rate of the frame it has just sent, not the previous one', () => {
    // The preview and the rate are drawn side by side. Reading the rate before
    // the emission always showed the previous value — zero on the first report.
    const rates: number[] = [];
    const session = createCaptureSession({
      obs: { broadcast: vi.fn(() => true), ensureConnected: vi.fn() } as never,
      onKeys: () => rates.push(session.rateAt(0)),
      onAnomaly: () => {},
    });

    session.handleReport(report(entry(174, 0x50, 400, 0x00)), 0);

    expect(rates).toEqual([1]);
  });
});

describe('createCaptureSession — an overlay announcing itself', () => {
  it('sends the current state, even though the overlay has changed nothing', () => {
    const { session, broadcast } = setup();
    session.handleReport(report(entry(174, 0x50, 400, 0x00)), 0);
    broadcast.mockClear();

    session.resend(1);

    expect(broadcast).toHaveBeenCalledWith({ v: 1, t: 'frame', k: [[174, 400, 0]] });
  });

  it('sends a rest frame when nothing is pressed, rather than nothing at all', () => {
    // A keyboard at rest sends no report, so an overlay opened at that moment
    // would otherwise stay blank until someone types.
    const { session, broadcast } = setup();

    session.resend(0);

    expect(broadcast).toHaveBeenCalledWith({ v: 1, t: 'frame', k: [] });
  });
});

describe('createCaptureSession — a connection that dropped', () => {
  it('resends the state the overlay never received', () => {
    // The milestone 2 review: OBS dies while a key is held, the release frame
    // is dropped by broadcast, and nothing follows it because nothing is being
    // touched. The overlay used to keep the half-pressed key for good.
    let live = true;
    const broadcast = vi.fn(() => live);
    const session = createCaptureSession({
      obs: { broadcast, ensureConnected: vi.fn() } as never,
      onKeys: () => {},
      onAnomaly: () => {},
    });

    session.handleReport(report(entry(174, 0x50, 700, 0x01)), 0);
    live = false;
    session.handleReport(report(entry(174, 0x50, 0, 0x00)), 1);
    live = true;
    broadcast.mockClear();

    session.handleReport(report(entry(174, 0x50, 0, 0x00)), 2);

    expect(broadcast).toHaveBeenCalledWith({ v: 1, t: 'frame', k: [[174, 0, 0]] });
  });
});

describe('createCaptureSession — what learning reads', () => {
  it('reports the raw entries before the configuration filters them', () => {
    // Learning has to see a key that is not configured yet — that is the whole
    // point — so it cannot read the frame, which carries only configured keys.
    const seen: number[] = [];
    const session = createCaptureSession({
      obs: { broadcast: vi.fn(() => true), ensureConnected: vi.fn() } as never,
      onKeys: () => {},
      onAnomaly: () => {},
      selectedIds: () => [],
      onEntries: (entries) => seen.push(...entries.map((e) => e.index)),
    });

    session.handleReport(report(entry(174, 0x50, 900, 0x01)), 0);

    expect(seen).toEqual([174]);
  });

  it('reports the entries even on a report that produces an empty frame', () => {
    const seen: number[] = [];
    const session = createCaptureSession({
      obs: { broadcast: vi.fn(() => true), ensureConnected: vi.fn() } as never,
      onKeys: () => {},
      onAnomaly: () => {},
      selectedIds: () => [9],
      onEntries: (entries) => seen.push(...entries.map((e) => e.index)),
    });

    session.handleReport(report(entry(174, 0x50, 900, 0x01)), 0);

    expect(seen).toEqual([174]);
  });
});
