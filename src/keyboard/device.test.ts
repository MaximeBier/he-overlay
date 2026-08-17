import { describe, it, expect, vi } from 'vitest';
import {
  createKeyboardLink,
  isAnalogDevice,
  type HidDeviceLike,
  type HidLike,
  type KeyboardStatus,
} from './device';

function fakeDevice(usagePages: number[], productName = 'Wooting Two HE (ARM)'): HidDeviceLike {
  const handlers: ((event: { data: DataView; reportId: number }) => void)[] = [];
  return {
    opened: false,
    productName,
    collections: usagePages.map((usagePage) => ({ usagePage })),
    async open() {
      this.opened = true;
    },
    async close() {
      this.opened = false;
    },
    addEventListener(_type, handler) {
      handlers.push(handler);
    },
    // @ts-expect-error test-only hook, outside the interface
    emit(bytes: number[]) {
      const data = new DataView(new Uint8Array(bytes).buffer);
      for (const handler of handlers) handler({ data, reportId: 0 });
    },
  };
}

function fakeHid(devices: HidDeviceLike[]) {
  const listeners: Record<string, ((event: { device: HidDeviceLike }) => void)[]> = {};
  const hid: HidLike & { fire(type: string, device: HidDeviceLike): void } = {
    async getDevices() {
      return devices;
    },
    async requestDevice() {
      return devices;
    },
    addEventListener(type, handler) {
      (listeners[type] ??= []).push(handler as never);
    },
    fire(type, device) {
      for (const handler of listeners[type] ?? []) handler({ device });
    },
  };
  return hid;
}

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

  it('forwards incoming reports as a Uint8Array', async () => {
    const device = fakeDevice([0xff53]);
    const onReport = vi.fn();
    const link = createKeyboardLink({ hid: fakeHid([device]), onReport, onStatus: () => {} });
    await link.resume();

    (device as unknown as { emit(bytes: number[]): void }).emit(
      Array.from({ length: 64 }, (_, i) => i),
    );

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
