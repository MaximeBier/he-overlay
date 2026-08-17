import { describe, it, expect, vi } from 'vitest';
import { createKeyboardLink, isAnalogDevice, type KeyboardStatus } from './device';
import { fakeDevice, fakeHid } from '../test/fixtures';

describe('isAnalogDevice', () => {
  it('accepts a 0xFF53 collection', () => {
    expect(isAnalogDevice(fakeDevice([0xff53]))).toBe(true);
  });

  // Test 1 of spec §12.1 — gamepad reports fabricate phantom keys stuck at 50%
  // if they get decoded.
  it('rejects the gamepad interface and the other vendor pages', () => {
    expect(isAnalogDevice(fakeDevice([0x0001]))).toBe(false);
    expect(isAnalogDevice(fakeDevice([0xff00]))).toBe(false);
    expect(isAnalogDevice(fakeDevice([0xff55]))).toBe(false);
  });

  it('rejects 0xFF54, the analog page of the older models', () => {
    expect(isAnalogDevice(fakeDevice([0xff54]))).toBe(false);
  });
});

describe('createKeyboardLink', () => {
  it('reports unsupported when WebHID is missing', async () => {
    const statuses: KeyboardStatus[] = [];
    const link = createKeyboardLink({
      hid: undefined,
      onReport: () => {},
      onStatus: (s) => statuses.push(s),
    });

    await link.resume();

    expect(link.status).toBe('unsupported');
    expect(statuses).toEqual(['unsupported']);
  });

  it('resumes an already authorised device without a click', async () => {
    const device = fakeDevice([0xff53]);
    const link = createKeyboardLink({
      hid: fakeHid([device]),
      onReport: () => {},
      onStatus: () => {},
    });

    await link.resume();

    expect(device.opened).toBe(true);
    expect(link.status).toBe('connected');
  });

  it('reports no-permission when no device is authorised', async () => {
    const link = createKeyboardLink({ hid: fakeHid([]), onReport: () => {}, onStatus: () => {} });

    await link.resume();

    expect(link.status).toBe('no-permission');
  });

  it('reports no-analog-interface when the authorised device has no 0xFF53', async () => {
    const link = createKeyboardLink({
      hid: fakeHid([fakeDevice([0xff00])]),
      onReport: () => {},
      onStatus: () => {},
    });

    await link.resume();

    expect(link.status).toBe('no-analog-interface');
  });

  it('does not attach twice to the same device', async () => {
    // Chrome hands back the very same HIDDevice object for a device already
    // authorised. Attaching again would stack a second listener, and every
    // report would be decoded and broadcast twice — silently doubling the
    // frame rate towards OBS.
    const device = fakeDevice([0xff53]);
    const onReport = vi.fn();
    const link = createKeyboardLink({
      hid: fakeHid([device]),
      onReport,
      onStatus: () => {},
    });

    await link.resume();
    await link.requestPermission();
    device.emit(Array.from({ length: 64 }, () => 0));

    expect(device.listenerCount()).toBe(1);
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('keeps a working keyboard when the device picker is dismissed', async () => {
    // requestDevice() resolves with [] when the user closes the dialog. Saying
    // no-permission then would contradict an overlay that is visibly running.
    const device = fakeDevice([0xff53]);
    const link = createKeyboardLink({
      hid: fakeHid([device], []),
      onReport: () => {},
      onStatus: () => {},
    });
    await link.resume();

    await link.requestPermission();

    expect(link.status).toBe('connected');
  });

  it('ignores reports from a device that is no longer the current one', async () => {
    // Two analog Wootings: A attaches, A is unplugged, B takes over. A's
    // listener is still in place — it must not speak for a keyboard we left.
    const first = fakeDevice([0xff53]);
    const second = fakeDevice([0xff53], 'Wooting 60HE');
    const hid = fakeHid([first]);
    const onReport = vi.fn();
    const link = createKeyboardLink({ hid, onReport, onStatus: () => {} });
    await link.resume();

    hid.fire('disconnect', first);
    hid.fire('connect', second);
    await vi.waitFor(() => expect(link.status).toBe('connected'));

    first.emit(Array.from({ length: 64 }, () => 0));

    expect(onReport).not.toHaveBeenCalled();
  });

  it('ignores reports carrying another report id', async () => {
    // Spec §3.1 pins reportId to 0, and WebHID strips that byte from `data` —
    // which is exactly why the buffer is 64 bytes long. Another report on the
    // same interface must not reach the decoder.
    const device = fakeDevice([0xff53]);
    const onReport = vi.fn();
    const link = createKeyboardLink({ hid: fakeHid([device]), onReport, onStatus: () => {} });
    await link.resume();

    device.emit(Array.from({ length: 64 }, () => 0), 3);

    expect(onReport).not.toHaveBeenCalled();
  });

  it('forwards incoming reports as a Uint8Array', async () => {
    const device = fakeDevice([0xff53]);
    const onReport = vi.fn();
    const link = createKeyboardLink({ hid: fakeHid([device]), onReport, onStatus: () => {} });
    await link.resume();

    device.emit(Array.from({ length: 64 }, (_, i) => i));

    expect(onReport).toHaveBeenCalledTimes(1);
    const [data, timestamp] = onReport.mock.calls[0]!;
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data).toHaveLength(64);
    expect(typeof timestamp).toBe('number');
    void link;
  });

  // Spec §3.3: gamepad mode re-enumerates the keyboard, the PID changes.
  it('re-attaches a keyboard replugged under another product id', async () => {
    const first = fakeDevice([0xff53]);
    const hid = fakeHid([first]);
    const statuses: KeyboardStatus[] = [];
    const link = createKeyboardLink({
      hid,
      onReport: () => {},
      onStatus: (s) => statuses.push(s),
    });
    await link.resume();

    hid.fire('disconnect', first);
    expect(link.status).toBe('disconnected');

    const second = fakeDevice([0xff53], 'Wooting Two HE (ARM) gamepad');
    hid.fire('connect', second);
    await vi.waitFor(() => expect(link.status).toBe('connected'));
    expect(second.opened).toBe(true);
  });

  it('ignores the disconnection of a device that is not ours', async () => {
    const mine = fakeDevice([0xff53]);
    const hid = fakeHid([mine]);
    const link = createKeyboardLink({ hid, onReport: () => {}, onStatus: () => {} });
    await link.resume();

    hid.fire('disconnect', fakeDevice([0x0001], 'Some Mouse'));

    expect(link.status).toBe('connected');
  });
});
