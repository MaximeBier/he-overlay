import { ANALOG_USAGE_PAGE } from './decode';

export type KeyboardStatus =
  'unsupported' | 'no-permission' | 'disconnected' | 'connected' | 'no-analog-interface';

export interface HidDeviceLike {
  opened: boolean;
  productName: string;
  collections: { usagePage: number }[];
  open(): Promise<void>;
  close(): Promise<void>;
  addEventListener(
    type: 'inputreport',
    // `timeStamp` is required, not optional: HIDInputReportEvent extends Event,
    // which always carries one. Marking it optional would invent a fallback
    // path that can never run.
    handler: (event: { data: DataView; reportId: number; timeStamp: number }) => void,
  ): void;
}

export interface HidLike {
  getDevices(): Promise<HidDeviceLike[]>;
  requestDevice(options: { filters: unknown[] }): Promise<HidDeviceLike[]>;
  addEventListener(
    type: 'connect' | 'disconnect',
    handler: (event: { device: HidDeviceLike }) => void,
  ): void;
}

export interface KeyboardLinkOptions {
  hid: HidLike | undefined;
  onReport(data: Uint8Array, timestamp: number): void;
  onStatus(status: KeyboardStatus): void;
}

export interface KeyboardLink {
  /** Reopens already authorised devices without a user gesture (spec §10). */
  resume(): Promise<void>;
  /** Requires a user gesture: call it from a click handler. */
  requestPermission(): Promise<void>;
  readonly status: KeyboardStatus;
}

/**
 * Usage page 0xFF53 only (spec §3.2). 0xFF54 is deliberately excluded: it is
 * the analog page of the older models, whose entries are three bytes wide —
 * decoding those with our decoder would fabricate phantom keys.
 */
export function isAnalogDevice(device: HidDeviceLike): boolean {
  return device.collections.some((c) => c.usagePage === ANALOG_USAGE_PAGE);
}

const WOOTING_VENDOR_ID = 0x31e3;

export function createKeyboardLink(options: KeyboardLinkOptions): KeyboardLink {
  const { hid } = options;
  let status: KeyboardStatus = 'disconnected';
  let current: HidDeviceLike | null = null;

  function setStatus(next: KeyboardStatus) {
    if (status === next) return;
    status = next;
    options.onStatus(next);
  }

  /**
   * Devices we have already subscribed to. Chrome hands back the very same
   * HIDDevice object across getDevices(), requestDevice() and a replug, and
   * WebHID offers no way to ask whether a listener is already attached — so a
   * second attach would silently double every report.
   */
  const listening = new WeakSet<HidDeviceLike>();

  async function attach(device: HidDeviceLike) {
    if (current === device) return;
    if (!device.opened) await device.open();

    if (!listening.has(device)) {
      listening.add(device);
      device.addEventListener('inputreport', (event) => {
        // The listener outlives `current`: it is never removed, and a second
        // analog keyboard can take over in the meantime. It must state whom it
        // speaks for rather than assume it is still the only one.
        if (current !== device) return;

        // Spec §3.1 pins the analog report to reportId 0. WebHID strips that
        // byte from `data`, which is what makes the buffer 64 bytes long; any
        // other report on this interface has a different shape entirely.
        if (event.reportId !== 0) return;

        const bytes = new Uint8Array(
          event.data.buffer,
          event.data.byteOffset,
          event.data.byteLength,
        );
        // The timestamp comes from the event, never from a timer (spec §2.2).
        options.onReport(bytes, event.timeStamp);
      });
    }

    current = device;
    setStatus('connected');
  }

  async function adopt(devices: HidDeviceLike[]): Promise<void> {
    const analog = devices.find(isAnalogDevice);
    if (analog) {
      await attach(analog);
      return;
    }
    // Never downgrade a keyboard that is attached and streaming. Dismissing the
    // device picker resolves with an empty list, and saying no-permission then
    // would contradict a preview the user can watch moving.
    if (current) return;
    setStatus(devices.length === 0 ? 'no-permission' : 'no-analog-interface');
  }

  if (hid) {
    hid.addEventListener('connect', (event) => {
      // Absorbs the product id change of gamepad mode (spec §3.3).
      if (current || !isAnalogDevice(event.device)) return;
      void attach(event.device);
    });
    hid.addEventListener('disconnect', (event) => {
      if (event.device !== current) return;
      current = null;
      setStatus('disconnected');
    });
  }

  return {
    async resume() {
      if (!hid) {
        setStatus('unsupported');
        return;
      }
      await adopt(await hid.getDevices());
    },
    async requestPermission() {
      if (!hid) {
        setStatus('unsupported');
        return;
      }
      await adopt(await hid.requestDevice({ filters: [{ vendorId: WOOTING_VENDOR_ID }] }));
    },
    get status() {
      return status;
    },
  };
}
