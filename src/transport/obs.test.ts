import { describe, it, expect, vi } from 'vitest';
import { createObsClient, type ObsStatus } from './obs';
import { computeAuth } from './auth';
import type { OverlayMessage } from '../protocol/messages';
import { FakeSocket, HELLO_AUTH, HELLO_NO_AUTH } from '../test/fixtures';

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

/** Lets queued microtasks run — close events land there, as in the browser. */
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('createObsClient', () => {
  it('identifies without authentication when the server asks for none', async () => {
    const { client, socket } = setup();
    client.connect();
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
    socket().receive(HELLO_AUTH);
    await vi.waitFor(() => expect(socket().sent).toHaveLength(1));

    expect(socket().parsed()[0].d.authentication).toBe(
      await computeAuth('hunter2', 'saltysalt', 'chchch'),
    );
  });

  it('turns identified once the Identified message arrives', () => {
    const { client, socket, statuses } = setup();
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: { negotiatedRpcVersion: 1 } });

    expect(client.status).toBe('identified');
    expect(statuses).toContain('identified');
  });

  it('tells a refused password apart from an unreachable server', () => {
    // 4009 = AuthenticationFailed. obs-websocket sends no message back:
    // it closes the socket with that code. The browser hands that code over
    // inside a CloseEvent object, never as a bare number — reading it wrong
    // would report every refused password as an unreachable server.
    const refused = setup();
    refused.client.connect();
    refused.socket().receive(HELLO_AUTH);
    refused.socket().onclose?.({ code: 4009 });

    expect(refused.client.status).toBe('auth-failed');

    const unreachable = setup();
    unreachable.client.connect();
    unreachable.socket().onerror?.();

    expect(unreachable.client.status).toBe('unreachable');
  });

  it('broadcasts a wrapped message through BroadcastCustomEvent', () => {
    const { client, socket } = setup();
    client.connect();
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
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });

    client.ensureConnected();

    expect(sockets).toHaveLength(1);
  });

  it('does not stay stuck on connecting when the digest cannot be computed', async () => {
    // `crypto.subtle` is absent outside a secure context. An unobserved
    // rejection would freeze the client on `connecting`, with `socket` still
    // set — so nothing would ever retry.
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockRejectedValue(new Error('insecure context'));
    const { client, socket } = setup('hunter2');
    client.connect();
    socket().receive(HELLO_AUTH);

    await vi.waitFor(() => expect(client.status).not.toBe('connecting'));

    digest.mockRestore();
  });

  it('never sends an identify computed for a socket it has replaced', async () => {
    // The digest is awaited. If the socket is swapped during that await, the
    // Identify answers the *previous* challenge on the *new* socket, which
    // replies 4009 — reporting auth-failed on a perfectly good password.
    // The first digest is held open, so the swap happens *during* the await
    // rather than by luck of scheduling. Later digests run for real.
    let release!: (value: ArrayBuffer) => void;
    const held = new Promise<ArrayBuffer>((resolve) => {
      release = resolve;
    });
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => held);

    const { client, sockets, socket } = setup('hunter2');
    client.connect();
    socket().receive(HELLO_AUTH);
    client.close();
    client.connect();

    release(new ArrayBuffer(32));
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(2));
    await flush();

    expect(sockets[1]!.sent).toEqual([]);
    digest.mockRestore();
  });

  it('survives a socket constructor that throws', () => {
    // `new WebSocket('ws://localhost:99999')` throws a SyntaxError. Thrown
    // during component setup, it stops the overlay from mounting at all.
    const client = createObsClient({
      url: 'ws://localhost:99999',
      password: '',
      onStatus: () => {},
      onMessage: () => {},
      socketFactory: () => {
        throw new SyntaxError('port out of range');
      },
    });

    expect(() => client.connect()).not.toThrow();
    expect(client.status).toBe('unreachable');
    expect(() => client.ensureConnected()).not.toThrow();
  });

  it('ignores the close event of a socket it has already replaced', async () => {
    // A browser fires onclose long after close() returns. By then a fresh
    // socket may be open and identified: letting the stale event run would
    // drop the live connection and silently discard every frame.
    const { client, socket, sockets } = setup();
    client.connect();
    client.close();
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });

    await flush();

    expect(client.status).toBe('identified');
    expect(sockets).toHaveLength(2);

    client.broadcast({ v: 1, t: 'hello' });
    expect(socket().sent.length).toBeGreaterThan(0);
  });

  it('ensureConnected reopens after a close', () => {
    const { client, socket, sockets } = setup();
    client.connect();
    socket().onclose?.({ code: 1000 });

    client.ensureConnected();

    expect(sockets).toHaveLength(2);
  });
});
