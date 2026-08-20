import { describe, it, expect, vi } from 'vitest';
import { createObsClient, RETRY_MAX_MS, type ObsStatus } from './obs';
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

  it('sends nothing until it is identified, and says so', () => {
    // The return value is what keeps the frame emitter honest: a frame it
    // believes delivered is a frame it will never send again.
    const { client, socket } = setup();
    client.connect();

    expect(client.broadcast({ v: 1, t: 'hello', id: 'test' })).toBe(false);
    expect(socket().sent).toHaveLength(0);
  });

  it('confirms a message that went out', () => {
    const { client, socket } = setup();
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });

    expect(client.broadcast({ v: 1, t: 'frame', k: [] })).toBe(true);
  });

  it('surfaces incoming CustomEvents and ignores foreign payloads', () => {
    const { client, socket, messages } = setup();
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });

    socket().receive({
      op: 5,
      d: { eventType: 'CustomEvent', eventData: { heOverlay: { v: 1, t: 'hello', id: 'test' } } },
    });
    socket().receive({ op: 5, d: { eventType: 'CustomEvent', eventData: { other: true } } });
    socket().receive({ op: 5, d: { eventType: 'CurrentSceneChanged', eventData: {} } });

    expect(messages).toEqual([{ v: 1, t: 'hello', id: 'test' }]);
  });

  it('ensureConnected does not reopen an already identified socket', () => {
    const { client, socket, sockets } = setup();
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });

    client.ensureConnected(0);

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
    expect(() => client.ensureConnected(0)).not.toThrow();
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

    client.broadcast({ v: 1, t: 'hello', id: 'test' });
    expect(socket().sent.length).toBeGreaterThan(0);
  });

  it('ensureConnected reopens after a close', () => {
    const { client, socket, sockets } = setup();
    client.connect();
    socket().onclose?.({ code: 1000 });

    client.ensureConnected(0);

    expect(sockets).toHaveLength(2);
  });
});

describe('createObsClient — spacing the retries out', () => {
  it('does not retry on every report while OBS stays closed', () => {
    // ensureConnected() runs on every keyboard report, ~50 times a second. With
    // OBS closed, an unspaced retry opens and drops a socket at that rate — and
    // Chrome logs an unsuppressable "WebSocket connection failed" for each one,
    // drowning the very console where this gets diagnosed.
    const { client, socket, sockets } = setup();
    client.connect();
    socket().onclose?.({ code: 1006 });

    client.ensureConnected(0);
    socket().onclose?.({ code: 1006 });
    client.ensureConnected(1);
    socket().onclose?.({ code: 1006 });
    client.ensureConnected(2);

    expect(sockets).toHaveLength(2);
  });

  it('backs off further on every failed attempt', () => {
    const { client, socket, sockets } = setup();
    client.connect();
    socket().onclose?.({ code: 1006 });

    client.ensureConnected(0);
    socket().onclose?.({ code: 1006 });
    // 500 ms after the first retry, not after the initial connect().
    client.ensureConnected(499);
    expect(sockets).toHaveLength(2);

    client.ensureConnected(500);
    expect(sockets).toHaveLength(3);
    socket().onclose?.({ code: 1006 });

    client.ensureConnected(1499);
    expect(sockets).toHaveLength(3);

    client.ensureConnected(1500);
    expect(sockets).toHaveLength(4);
  });

  it('caps the backoff so a returning OBS is picked up quickly', () => {
    // Twenty failures in a row is a couple of minutes with OBS closed. Left
    // uncapped, the delay would be measured in days by then.
    const { client, socket, sockets } = setup();
    client.connect();

    let now = 0;
    for (let i = 0; i < 20; i++) {
      socket().onclose?.({ code: 1006 });
      now += RETRY_MAX_MS;
      client.ensureConnected(now);
    }
    const opened = sockets.length;
    socket().onclose?.({ code: 1006 });

    client.ensureConnected(now + RETRY_MAX_MS - 1);
    expect(sockets).toHaveLength(opened);

    client.ensureConnected(now + RETRY_MAX_MS);
    expect(sockets).toHaveLength(opened + 1);
  });

  it('retries at once when the password changes', () => {
    // connect() carries new credentials. Making it wait out a backoff earned by
    // the wrong password would look like the new one was refused too.
    const { client, socket, sockets } = setup();
    client.connect();
    socket().onclose?.({ code: 1006 });
    client.ensureConnected(0);
    socket().onclose?.({ code: 1006 });

    client.ensureConnected(1);
    expect(sockets).toHaveLength(2);

    client.connect();

    expect(sockets).toHaveLength(3);
  });

  it('starts over from zero after a connection that worked', () => {
    const { client, socket, sockets } = setup();
    client.connect();
    socket().onclose?.({ code: 1006 });
    client.ensureConnected(0);
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });
    socket().onclose?.({ code: 1006 });

    client.ensureConnected(1);

    expect(sockets).toHaveLength(3);
  });

  it('never retries a refused password', () => {
    const { client, socket, sockets } = setup();
    client.connect();
    socket().receive(HELLO_AUTH);
    socket().onclose?.({ code: 4009 });

    client.ensureConnected(10_000);

    expect(sockets).toHaveLength(1);
  });
});

describe('createObsClient — telling the two failures apart', () => {
  it('reports a server that never answered as unreachable', () => {
    const { client, socket } = setup();
    client.connect();
    socket().onclose?.({ code: 1006 });

    expect(client.status).toBe('unreachable');
  });

  it('reports a connection that worked and then dropped as disconnected', () => {
    // The two call for different actions: one says "turn the WebSocket server
    // on", the other says "OBS went away". A single word cannot say both.
    const { client, socket } = setup();
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });
    socket().onclose?.({ code: 1006 });

    expect(client.status).toBe('disconnected');
  });

  it('reports an error raised after identification as disconnected', () => {
    // onerror fires before onclose when OBS is killed. Left to say
    // "unreachable", it wins the race and the right status never shows.
    const { client, socket } = setup();
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });
    socket().onerror?.();

    expect(client.status).toBe('disconnected');
  });

  it('goes back to unreachable when the retry fails to reach OBS again', () => {
    const { client, socket } = setup();
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: {} });
    socket().onclose?.({ code: 1006 });

    client.ensureConnected(1);
    socket().onclose?.({ code: 1006 });

    expect(client.status).toBe('unreachable');
  });
});

describe('an overlay speaking a protocol we cannot read', () => {
  function setupWithVersions(password = '') {
    const sockets: FakeSocket[] = [];
    const versions: number[] = [];
    const messages: OverlayMessage[] = [];

    const client = createObsClient({
      url: 'ws://localhost:4455',
      password,
      onStatus: () => {},
      onMessage: (m) => messages.push(m),
      onForeignVersion: (v) => versions.push(v),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const socket = () => sockets[sockets.length - 1]!;
    client.connect();
    socket().receive(HELLO_NO_AUTH);
    socket().receive({ op: 2, d: { negotiatedRpcVersion: 1 } });
    return { client, socket, versions, messages };
  }

  const event = (eventData: unknown) => ({
    op: 5,
    d: { eventType: 'CustomEvent', eventData },
  });

  it('names the version instead of going quiet', () => {
    // Ignoring it is right for the pipeline and useless for the person
    // wondering why their overlay went blank after a deploy (spec §11).
    const { socket, versions, messages } = setupWithVersions();

    socket().receive(event({ heOverlay: { v: 7, t: 'hello', id: 'a' } }));

    expect(versions).toEqual([7]);
    expect(messages).toEqual([]);
  });

  it('stays quiet about a message it could read', () => {
    const { socket, versions, messages } = setupWithVersions();

    socket().receive(event({ heOverlay: { v: 1, t: 'hello', id: 'a' } }));

    expect(versions).toEqual([]);
    expect(messages).toHaveLength(1);
  });

  it('stays quiet about another application on the same bus', () => {
    // OBS carries everyone's custom events. Reporting one of those would send
    // someone reloading a page that was never ours.
    const { socket, versions } = setupWithVersions();

    socket().receive(event({ someOtherApp: { v: 3 } }));

    expect(versions).toEqual([]);
  });
});
