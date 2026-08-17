import { describe, it, expect, vi } from 'vitest';
import { createObsClient } from './obs';
import type { OverlayMessage } from '../protocol/messages';
import { FakeSocket } from '../test/fixtures';

/**
 * Relays BroadcastCustomEvent between two clients the way obs-websocket does.
 *
 * Every other test drives a single client against a socket double. This one
 * covers what neither of them can: a frame leaving the capture and reaching
 * the overlay through a relay. It exists because when that path went silent in
 * the real setup, nothing told us whether the fault was ours — this test
 * answers that question in a second.
 */
class FakeServer {
  private clients: FakeSocket[] = [];

  /** Connects a socket and greets it, the way obs-websocket opens a session. */
  attach(socket: FakeSocket) {
    this.clients.push(socket);
    const relay = this;
    // The shared double records what it is handed; the relay reads it back and
    // answers, which is what turns two clients into a conversation.
    const sent = socket.send.bind(socket);
    socket.send = (data: string) => {
      sent(data);
      relay.receive(socket, data);
    };
    queueMicrotask(() => socket.receive({ op: 0, d: { rpcVersion: 1 } }));
  }

  receive(from: FakeSocket, raw: string) {
    const payload = JSON.parse(raw);
    if (payload.op === 1) {
      from.receive({ op: 2, d: { negotiatedRpcVersion: 1 } });
      return;
    }
    if (payload.op === 6 && payload.d.requestType === 'BroadcastCustomEvent') {
      for (const client of this.clients) {
        client.receive({
          op: 5,
          d: { eventType: 'CustomEvent', eventData: payload.d.requestData.eventData },
        });
      }
    }
  }
}

describe('capture to overlay round trip', () => {
  it('delivers a frame broadcast by the capture to the overlay', async () => {
    const server = new FakeServer();
    const received: OverlayMessage[] = [];

    const spawn = (onMessage: (m: OverlayMessage) => void) =>
      createObsClient({
        url: 'ws://localhost:4455',
        password: '',
        onStatus: () => {},
        onMessage,
        socketFactory: () => {
          const socket = new FakeSocket();
          server.attach(socket);
          return socket;
        },
      });

    const capture = spawn(() => {});
    const overlay = spawn((m) => received.push(m));
    capture.connect();
    overlay.connect();

    await vi.waitFor(() => expect(capture.status).toBe('identified'));
    await vi.waitFor(() => expect(overlay.status).toBe('identified'));

    capture.broadcast({ v: 1, t: 'frame', k: [[174, 996, 1]] });

    expect(received).toEqual([{ v: 1, t: 'frame', k: [[174, 996, 1]] }]);
  });
});
