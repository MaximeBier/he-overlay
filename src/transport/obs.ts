import { computeAuth } from './auth';
import { envelope, parseMessage, type OverlayMessage } from '../protocol/messages';

export type ObsStatus = 'idle' | 'connecting' | 'identified' | 'auth-failed' | 'unreachable';

/** Port obs-websocket listens on out of the box. Configurable in OBS (spec §6.1). */
export const DEFAULT_OBS_PORT = 4455;

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

/**
 * Compile-time proof that our socket interface describes the browser API and
 * not merely our own double. Reading the close code as a bare argument used to
 * report every refused password as an unreachable server; this line turns that
 * class of mistake into a build error.
 */
type AcceptsBrowserEvent<E, H extends (event: E) => void> = H;
type _CloseIsFaithful = AcceptsBrowserEvent<CloseEvent, NonNullable<SocketLike['onclose']>>;
type _MessageIsFaithful = AcceptsBrowserEvent<MessageEvent, NonNullable<SocketLike['onmessage']>>;

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

  /** Drops a socket and its handlers, so no late event can speak for it. */
  function discard(target: SocketLike) {
    target.onopen = null;
    target.onclose = null;
    target.onerror = null;
    target.onmessage = null;
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
      identify((payload.d ?? {}) as Parameters<typeof identify>[0]).catch(() => {
        // `crypto.subtle` only exists in a secure context: over plain HTTP on a
        // LAN address — an OBS browser source pointed at http://<ip>:8080 —
        // the digest throws. Swallowing it would leave the client stuck on
        // `connecting` forever, with no signal and nothing retrying.
        fail('unreachable');
      });
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

  /** Gives up on the current socket, leaving the client ready to try again. */
  function fail(reason: ObsStatus) {
    if (socket) {
      discard(socket);
      socket.close();
      socket = null;
    }
    setStatus(reason);
  }

  function connect() {
    if (socket) return;
    setStatus('connecting');

    let next: SocketLike;
    try {
      next = factory(options.url);
    } catch {
      // The WebSocket constructor throws on a malformed URL — an out-of-range
      // port typed into the OBS browser source is enough. Left unhandled, it
      // escapes the caller and stops the overlay from mounting at all.
      setStatus('unreachable');
      return;
    }
    socket = next;

    // Every handler checks that it still speaks for the live socket: a browser
    // fires onclose well after close() returns, and a stale event would
    // otherwise tear down the connection that replaced it.
    next.onmessage = (event) => {
      if (socket !== next) return;
      handle(event.data);
    };
    next.onerror = () => {
      if (socket !== next) return;
      setStatus('unreachable');
    };
    next.onclose = (event) => {
      if (socket !== next) return;
      socket = null;
      setStatus(event?.code === AUTH_FAILED_CODE ? 'auth-failed' : 'unreachable');
    };
  }

  return {
    connect,
    ensureConnected() {
      // A refused password will be refused again: retrying on every report
      // would hammer OBS ~50 times a second for nothing. Only an explicit
      // connect(), carrying a new password, clears this.
      if (status === 'auth-failed') return;
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
      if (socket) {
        discard(socket);
        socket.close();
        socket = null;
      }
      setStatus('idle');
    },
    get status() {
      return status;
    },
  };
}
