import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { IV_BYTES, GCM_TAG_BYTES, PROTOCOL_VERSION, type Frame } from '@tincan/shared';
import { createTincanServer, type TincanServer } from '../src/app.js';
import type { RelayOptions } from '../src/relay/options.js';

const WAIT_MS = 2000;

/** A valid frame for the given seq: right IV length, ciphertext exactly one padding bucket + tag. */
export function frame(seq: number, bucket = 256): Frame {
  return {
    v: PROTOCOL_VERSION,
    seq,
    iv: randomBytes(IV_BYTES).toString('base64url'),
    ct: randomBytes(bucket + GCM_TAG_BYTES).toString('base64url'),
  };
}

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A real socket.io client that records every server event in arrival order, so tests can consume them
 * one by one (`next`) and assert that nothing else arrived (`expectQuiet`).
 */
export class Peer {
  private readonly queues = new Map<string, unknown[]>();
  private readonly waiters = new Map<string, ((value: unknown) => void)[]>();
  readonly disconnected: Promise<string>;

  constructor(readonly socket: ClientSocket) {
    socket.onAny((event: string, payload: unknown) => {
      const waiting = this.waiters.get(event)?.shift();
      if (waiting) waiting(payload);
      else this.queue(event).push(payload);
    });
    this.disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
  }

  private queue(event: string): unknown[] {
    let queue = this.queues.get(event);
    if (!queue) this.queues.set(event, (queue = []));
    return queue;
  }

  /** The oldest not yet consumed `event` payload, waiting for it if needed. */
  next(event: string, timeoutMs = WAIT_MS): Promise<unknown> {
    const queue = this.queue(event);
    if (queue.length > 0) return Promise.resolve(queue.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no ${event} within ${timeoutMs} ms`)),
        timeoutMs,
      );
      const list = this.waiters.get(event) ?? [];
      list.push((value) => {
        clearTimeout(timer);
        resolve(value);
      });
      this.waiters.set(event, list);
    });
  }

  /** Every recorded event that has not been consumed yet. */
  pending(): string[] {
    return [...this.queues].flatMap(([event, queue]) => queue.map(() => event));
  }

  /** Waits `ms` and returns the events that arrived and were not consumed. */
  async quietFor(ms: number): Promise<string[]> {
    await delay(ms);
    return this.pending();
  }

  /** Emits with an ack and resolves with the server's answer. */
  call(event: string, ...args: unknown[]): Promise<unknown> {
    return this.socket.timeout(WAIT_MS).emitWithAck(event, ...args) as Promise<unknown>;
  }

  /** Emits with an ack and resolves `'no-ack'` if the server does not answer within `ms`. */
  async callExpectingSilence(ms: number, event: string, ...args: unknown[]): Promise<unknown> {
    try {
      return await (this.socket.timeout(ms).emitWithAck(event, ...args) as Promise<unknown>);
    } catch {
      return 'no-ack';
    }
  }

  /** Simulates a network drop: the transport closes without a socket.io disconnect packet. */
  drop(): void {
    this.socket.io.engine.close();
  }

  /**
   * Simulates a half-open connection (network lost, socket not closed): the client stops sending
   * anything, pongs included, while the transport stays open. Only the relay's heartbeat can notice.
   * `_sendPacket` is engine.io-client internals, acceptable in a test helper.
   */
  goSilent(): void {
    const engine = this.socket.io.engine as unknown as { _sendPacket: () => void };
    engine._sendPacket = () => undefined;
  }

  /** An explicit leave, as a closing or reloading tab does it. */
  leave(): void {
    this.socket.disconnect();
  }
}

export interface Harness extends TincanServer {
  url: string;
  connect(): Promise<Peer>;
  /** A connected sender with its session. */
  sender(): Promise<{ peer: Peer; sessionId: string; senderToken: string }>;
  /** A sender and a joined receiver, with the initial peer events consumed. */
  pair(): Promise<{
    sender: Peer;
    receiver: Peer;
    sessionId: string;
    senderToken: string;
    receiverToken: string;
  }>;
  stop(): Promise<void>;
}

export async function startRelay(relay: Partial<RelayOptions> = {}): Promise<Harness> {
  const server = createTincanServer({ relay });
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const sockets: ClientSocket[] = [];

  async function connectPeer(): Promise<Peer> {
    const socket = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    const peer = new Peer(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return peer;
  }

  async function sender() {
    const peer = await connectPeer();
    const result = (await peer.call('session:create')) as {
      sessionId: string;
      senderToken: string;
    };
    await peer.next('peer'); // waiting
    return { peer, sessionId: result.sessionId, senderToken: result.senderToken };
  }

  async function pair() {
    const { peer: s, sessionId, senderToken } = await sender();
    const receiver = await connectPeer();
    const result = (await receiver.call('session:join', { sessionId })) as {
      receiverToken: string;
    };
    await receiver.next('peer');
    await s.next('peer');
    return { sender: s, receiver, sessionId, senderToken, receiverToken: result.receiverToken };
  }

  return {
    ...server,
    url,
    connect: connectPeer,
    sender,
    pair,
    async stop() {
      for (const socket of sockets) socket.disconnect();
      server.relay.close();
      await server.io.close();
    },
  };
}
