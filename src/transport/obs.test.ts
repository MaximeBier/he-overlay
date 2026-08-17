import { describe, it, expect, vi } from 'vitest';
import { createObsClient, type SocketLike, type ObsStatus } from './obs';
import { computeAuth } from './auth';
import type { OverlayMessage } from '../protocol/messages';

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: ((code?: number) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  parsed() {
    return this.sent.map((raw) => JSON.parse(raw));
  }
}

function setup(password = 'hunter2') {
  const sockets: FakeSocket[] = [];
  const statuses: ObsStatus[] = [];
  const messages: OverlayMessage[] = [];

  const client = createObsClient({
    url: 'ws://localhost:4455',
    password,
    onStatus: (s) => statuses.push(s),
    onMessage: (m) => messages.push(m),
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });

  return { client, sockets, statuses, messages, socket: () => sockets[sockets.length - 1]! };
}

const HELLO_NO_AUTH = { op: 0, d: { rpcVersion: 1 } };
const HELLO_AUTH = {
  op: 0,
  d: {
    rpcVersion: 1,
    authentication: { challenge: 'chchch', salt: 'saltysalt' },
  },
};

describe('createObsClient', () => {
  it('identifies without authentication when the server asks for none', async () => {
    const { client, socket } = setup();
    client.connect();
    socket().onopen?.();
    socket().receive(HELLO_NO_AUTH);
    await vi.waitFor(() => expect(socket().sent).toHaveLength(1));

    const identify = socket().parsed()[0];
    expect(identify.op).toBe(1);
    expect(identify.d.rpcVersion).toBe(1);
    expect(identify.d.authentication).toBeUndefined();
    // General (1 << 0) includes CustomEvent: that is all we need.
    expect(identify.d.eventSubscriptions).toBe(1);
  });

  it('answers the authentication challenge', async () => {
    const { client, socket } = setup('hunter2');
    client.connect();
    socket().onopen?.();
    socket().receive(HELLO_AUTH);
    await vi.waitFor(() => expect(socket().sent).toHaveLength(1));

    expect(socket().parsed()[0].d.authentication).toBe(
      await computeAuth('hunter2', 'saltysalt', 'chchch'),
    );
  });

  it('turns identified once the Identified message arrives', () => {
    const { client, socket, statuses } = setup();
    client.connect();
    socket().onopen?.();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: { negotiatedRpcVersion: 1 } });

    expect(client.status).toBe('identified');
    expect(statuses).toContain('identified');
  });

  it('tells a refused password apart from an unreachable server', () => {
    // 4009 = AuthenticationFailed. obs-websocket sends no message back:
    // it closes the socket with that code.
    const refused = setup();
    refused.client.connect();
    refused.socket().onopen?.();
    refused.socket().receive(HELLO_AUTH);
    refused.socket().onclose?.(4009);

    expect(refused.client.status).toBe('auth-failed');

    const unreachable = setup();
    unreachable.client.connect();
    unreachable.socket().onerror?.();

    expect(unreachable.client.status).toBe('unreachable');
  });

  it('broadcasts a wrapped message through BroadcastCustomEvent', () => {
    const { client, socket } = setup();
    client.connect();
    socket().onopen?.();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: { negotiatedRpcVersion: 1 } });
    socket().sent.length = 0;

    client.broadcast({ v: 1, t: 'frame', k: [[174, 996, 1]] });

    const request = socket().parsed()[0];
    expect(request.op).toBe(6);
    expect(request.d.requestType).toBe('BroadcastCustomEvent');
    expect(request.d.requestData.eventData).toEqual({
      heOverlay: { v: 1, t: 'frame', k: [[174, 996, 1]] },
    });
  });

  it('sends nothing until it is identified', () => {
    const { client, socket } = setup();
    client.connect();
    client.broadcast({ v: 1, t: 'hello' });

    expect(socket().sent).toHaveLength(0);
  });

  it('surfaces incoming CustomEvents and ignores foreign payloads', () => {
    const { client, socket, messages } = setup();
    client.connect();
    socket().onopen?.();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });

    socket().receive({
      op: 5,
      d: { eventType: 'CustomEvent', eventData: { heOverlay: { v: 1, t: 'hello' } } },
    });
    socket().receive({ op: 5, d: { eventType: 'CustomEvent', eventData: { other: true } } });
    socket().receive({ op: 5, d: { eventType: 'CurrentSceneChanged', eventData: {} } });

    expect(messages).toEqual([{ v: 1, t: 'hello' }]);
  });

  it('ensureConnected does not reopen an already identified socket', () => {
    const { client, socket, sockets } = setup();
    client.connect();
    socket().onopen?.();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });

    client.ensureConnected();

    expect(sockets).toHaveLength(1);
  });

  it('ensureConnected reopens after a close', () => {
    const { client, socket, sockets } = setup();
    client.connect();
    socket().onclose?.();

    client.ensureConnected();

    expect(sockets).toHaveLength(2);
  });
});
