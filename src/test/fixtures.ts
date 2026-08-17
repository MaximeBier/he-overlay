import type { SocketLike } from '../transport/obs';
import type { HidDeviceLike, HidLike } from '../keyboard/device';

/**
 * Builds a 4-byte analog entry.
 * `low` carries bits 0..5 of the 16-bit field: bit 0 is the actuation verdict,
 * bits 1..5 are entry type tags (spec §3.1).
 */
export function entry(index: number, usage: number, travel: number, low: number): number[] {
  const field = (travel << 6) | low;
  return [index, usage, field & 0xff, (field >> 8) & 0xff];
}

/** Assembles a full 64-byte report, zero-padded — which acts as the sentinel. */
export function report(...entries: number[][]): Uint8Array {
  const buf = new Uint8Array(64);
  buf.set(entries.flat());
  return buf;
}

/**
 * Socket double.
 *
 * `close()` fires `onclose` **asynchronously**, as browsers do: the closing
 * handshake outlives the call. Firing it synchronously would hide every bug
 * where a stale socket's event lands after a fresh one has been opened.
 */
export class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    queueMicrotask(() => this.onclose?.({ code: 1000 }));
  }
  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  parsed() {
    return this.sent.map((raw) => JSON.parse(raw));
  }
}

/** Hello frames of the obs-websocket handshake, with and without authentication. */
export const HELLO_NO_AUTH = { op: 0, d: { rpcVersion: 1 } };
export const HELLO_AUTH = {
  op: 0,
  d: {
    rpcVersion: 1,
    authentication: { challenge: 'chchch', salt: 'saltysalt' },
  },
};

export interface FakeDevice extends HidDeviceLike {
  emit(bytes: number[], reportId?: number): void;
  listenerCount(): number;
}

export function fakeDevice(
  usagePages: number[],
  productName = 'Wooting Two HE (ARM)',
): FakeDevice {
  const handlers: ((event: {
    data: DataView;
    reportId: number;
    timeStamp: number;
  }) => void)[] = [];
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
    emit(bytes: number[], reportId = 0) {
      const data = new DataView(new Uint8Array(bytes).buffer);
      for (const handler of handlers) handler({ data, reportId, timeStamp: 0 });
    },
    listenerCount() {
      return handlers.length;
    },
  };
}

export interface FakeHid extends HidLike {
  fire(type: string, device: HidDeviceLike): void;
}

export function fakeHid(devices: HidDeviceLike[], requested = devices): FakeHid {
  const listeners: Record<string, ((event: { device: HidDeviceLike }) => void)[]> = {};
  return {
    async getDevices() {
      return devices;
    },
    async requestDevice() {
      return requested;
    },
    addEventListener(type, handler) {
      (listeners[type] ??= []).push(handler as never);
    },
    fire(type, device) {
      for (const handler of listeners[type] ?? []) handler({ device });
    },
  };
}
