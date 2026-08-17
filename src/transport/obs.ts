import { computeAuth } from './auth';
import { envelope, parseMessage, type OverlayMessage } from '../protocol/messages';

export type ObsStatus = 'idle' | 'connecting' | 'identified' | 'auth-failed' | 'unreachable';

/** obs-websocket 5.x close code for a refused authentication. */
const AUTH_FAILED_CODE = 4009;
/** EventSubscription.General: contains CustomEvent. */
const GENERAL_EVENTS = 1;

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  /** Receives a CloseEvent, exactly like the browser API: the code is a field
   * of the event, never an argument of its own. */
  onclose: ((event: { code?: number }) => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}

export interface ObsClientOptions {
  url: string;
  password: string;
  onStatus(status: ObsStatus): void;
  onMessage(message: OverlayMessage): void;
  socketFactory?(url: string): SocketLike;
}

export interface ObsClient {
  connect(): void;
  /** Reopens when the socket is closed. Timer-free: called on events only. */
  ensureConnected(): void;
  broadcast(message: OverlayMessage): void;
  close(): void;
  readonly status: ObsStatus;
}

export function createObsClient(options: ObsClientOptions): ObsClient {
  const factory =
    options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);

  let socket: SocketLike | null = null;
  let status: ObsStatus = 'idle';

  function setStatus(next: ObsStatus) {
    if (status === next) return;
    status = next;
    options.onStatus(next);
  }

  function send(payload: unknown) {
    socket?.send(JSON.stringify(payload));
  }

  async function identify(hello: { authentication?: { challenge: string; salt: string } }) {
    const data: Record<string, unknown> = {
      rpcVersion: 1,
      eventSubscriptions: GENERAL_EVENTS,
    };
    if (hello.authentication) {
      data.authentication = await computeAuth(
        options.password,
        hello.authentication.salt,
        hello.authentication.challenge,
      );
    }
    send({ op: 1, d: data });
  }

  function handle(raw: string) {
    let payload: { op?: number; d?: Record<string, unknown> };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (payload.op === 0) {
      void identify((payload.d ?? {}) as Parameters<typeof identify>[0]);
      return;
    }
    if (payload.op === 2) {
      setStatus('identified');
      return;
    }
    if (payload.op === 5 && payload.d?.eventType === 'CustomEvent') {
      const message = parseMessage(payload.d.eventData);
      if (message) options.onMessage(message);
    }
  }

  function connect() {
    if (socket) return;
    setStatus('connecting');
    const next = factory(options.url);
    socket = next;

    next.onopen = () => {};
    next.onmessage = (event) => handle(event.data);
    next.onerror = () => setStatus('unreachable');
    next.onclose = (event) => {
      socket = null;
      setStatus(event?.code === AUTH_FAILED_CODE ? 'auth-failed' : 'unreachable');
    };
  }

  return {
    connect,
    ensureConnected() {
      if (!socket) connect();
    },
    broadcast(message) {
      if (status !== 'identified') return;
      // A constant requestId: we never await a reply to BroadcastCustomEvent,
      // and correlating replies we ignore would buy nothing.
      send({
        op: 6,
        d: {
          requestType: 'BroadcastCustomEvent',
          requestId: 'he',
          requestData: { eventData: envelope(message) },
        },
      });
    },
    close() {
      socket?.close();
      socket = null;
      setStatus('idle');
    },
    get status() {
      return status;
    },
  };
}
