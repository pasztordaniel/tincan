import { TestBed } from '@angular/core/testing';
import { RECONNECT_GRACE_MS, type Frame } from '@tincan/shared';
import { RELAY_SOCKET_FACTORY, type TincanSocket } from './relay-socket';
import { RelayService, type ProtocolError, type RelayEndReason } from './relay.service';

type Listener = (...args: unknown[]) => void;
type Emitted = { event: string; args: unknown[] };

/** Stands in for a socket.io client socket: records emits, lets the test fire server events. */
class FakeSocket {
  connected = false;
  disconnectCalls = 0;
  readonly emitted: Emitted[] = [];
  private readonly listeners = new Map<string, Listener[]>();
  /** Auto-answers per event; unset means the test answers by hand via `lastAck`. */
  answers = new Map<string, unknown>();

  on(event: string, fn: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
    return this;
  }
  off(event: string, fn: Listener): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((l) => l !== fn),
    );
    return this;
  }
  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }
  connect(): this {
    return this;
  }
  disconnect(): this {
    this.disconnectCalls++;
    this.connected = false;
    return this;
  }
  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    const ack = args[args.length - 1];
    if (this.answers.has(event) && typeof ack === 'function') {
      (ack as Listener)(this.answers.get(event));
    }
    return this;
  }
  /** Server-side events. */
  fire(event: string, ...args: unknown[]): void {
    for (const l of this.listeners.get(event) ?? []) l(...args);
  }
  serverConnect(): void {
    this.connected = true;
    this.fire('connect');
  }
  serverDrop(reason = 'transport close'): void {
    this.connected = false;
    this.fire('disconnect', reason);
  }
  lastAck(event: string): Listener {
    const e = [...this.emitted].reverse().find((x) => x.event === event);
    return e?.args[e.args.length - 1] as Listener;
  }
  count(event: string): number {
    return this.emitted.filter((e) => e.event === event).length;
  }
}

const SID = 'A'.repeat(22);
const TOK = 'Q'.repeat(22);
const TOK2 = 'g'.repeat(22);
// 256 B bucket + 16 B tag = 272 bytes -> 364 base64url chars: valid per isFrame.
const frame = (seq: number): Frame => ({
  v: 1,
  seq,
  iv: 'D'.repeat(16),
  ct: 'E'.repeat(363),
});

describe('RelayService', () => {
  let socket: FakeSocket;
  let relay: RelayService;
  let sockets: FakeSocket[];
  const sock = (i: number): FakeSocket => {
    const s = sockets[i];
    if (!s) throw new Error('socket not created');
    return s;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RELAY_SOCKET_FACTORY,
          useValue: () => {
            const s = new FakeSocket();
            sockets.push(s);
            return s as unknown as TincanSocket;
          },
        },
      ],
    });
    relay = TestBed.inject(RelayService);
  });
  afterEach(() => vi.useRealTimers());

  /** Starts `create()` and connects the fake socket once the service has asked for it. */
  async function createSession(): Promise<void> {
    socket = undefined as never;
    const p = relay.create();
    socket = sock(sockets.length - 1);
    socket.answers.set('session:create', { ok: true, sessionId: SID, senderToken: TOK });
    socket.serverConnect();
    const result = await p;
    expect(result).toEqual({ ok: true, sessionId: SID, senderToken: TOK });
  }

  it('creates a session and reports connected', async () => {
    expect(relay.status()).toBe('connecting');
    await createSession();
    expect(relay.status()).toBe('connected');
  });

  it('joins and returns the receiver token', async () => {
    const p = relay.join(SID);
    socket = sock(0);
    socket.answers.set('session:join', { ok: true, receiverToken: TOK });
    socket.serverConnect();
    expect(await p).toEqual({ ok: true, receiverToken: TOK });
    expect(socket.emitted[0]).toMatchObject({ event: 'session:join' });
    expect(socket.emitted[0]?.args[0]).toEqual({ sessionId: SID });
  });

  it.each(['full', 'not_found'] as const)('join surfaces %s and disconnects', async (error) => {
    const p = relay.join(SID);
    socket = sock(0);
    socket.answers.set('session:join', { ok: false, error });
    socket.serverConnect();
    expect(await p).toEqual({ ok: false, error });
    expect(socket.disconnectCalls).toBeGreaterThan(0);
    expect(relay.status()).toBe('offline');
  });

  it('reports offline when the connection never opens', async () => {
    const p = relay.create();
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await p).toEqual({ ok: false, error: 'offline' });
    expect(relay.status()).toBe('offline');
  });

  it('passes the ack as a function in the last position', async () => {
    await createSession();
    socket.answers.set('frame', { ok: true });
    await relay.sendFrame(frame(1));
    for (const e of socket.emitted) expect(typeof e.args[e.args.length - 1]).toBe('function');
  });

  describe('validation', () => {
    it('drops an invalid frame and reports a protocol error without its content', async () => {
      await createSession();
      const frames: Frame[] = [];
      const errors: ProtocolError[] = [];
      relay.frames$.subscribe((f) => frames.push(f));
      relay.protocolErrors$.subscribe((e) => errors.push(e));
      socket.fire('frame', { v: 1, seq: 1, iv: 'x', ct: 'y' });
      socket.fire('frame', { ...frame(1), extra: 1 });
      socket.fire('frame', 'nope');
      expect(frames).toEqual([]);
      expect(errors).toEqual([{ source: 'frame' }, { source: 'frame' }, { source: 'frame' }]);
      expect(relay.protocolErrorCount()).toBe(3);
      socket.fire('frame', frame(2));
      expect(frames).toEqual([frame(2)]);
    });

    it('drops invalid peer and ended payloads', async () => {
      await createSession();
      const ended: RelayEndReason[] = [];
      relay.ended$.subscribe((r) => ended.push(r));
      socket.fire('peer', { state: 'hacked' });
      socket.fire('session:ended', { reason: 'because' });
      expect(relay.peer()).toBeNull();
      expect(relay.status()).toBe('connected');
      expect(ended).toEqual([]);
      expect(relay.protocolErrorCount()).toBe(2);
    });

    it('does not trust a malformed ack', async () => {
      const errors: ProtocolError[] = [];
      relay.protocolErrors$.subscribe((e) => errors.push(e));
      const p = relay.create();
      socket = sock(0);
      socket.answers.set('session:create', { ok: true, sessionId: 'short', senderToken: TOK });
      socket.serverConnect();
      expect(await p).toEqual({ ok: false, error: 'protocol' });
      expect(errors).toEqual([{ source: 'ack:create' }]);
      expect(relay.status()).toBe('offline');
    });

    it('does not send a malformed frame', async () => {
      await createSession();
      expect(await relay.sendFrame({ ...frame(1), seq: 0 })).toBe('bad_request');
      expect(socket.count('frame')).toBe(0);
    });

    it('times out an unanswered ack', async () => {
      await createSession();
      const p = relay.sendFrame(frame(1));
      await vi.advanceTimersByTimeAsync(8_001);
      expect(await p).toBe('timeout');
    });
  });

  describe('events', () => {
    it('exposes peer state and forwards valid frames', async () => {
      await createSession();
      const peers: string[] = [];
      relay.peer$.subscribe((s) => peers.push(s));
      socket.fire('peer', { state: 'connected' });
      expect(relay.peer()).toBe('connected');
      expect(peers).toEqual(['connected']);
    });

    it('session:ended ends the session and stops the socket', async () => {
      await createSession();
      const ended: RelayEndReason[] = [];
      relay.ended$.subscribe((r) => ended.push(r));
      socket.fire('session:ended', { reason: 'peer_left' });
      expect(relay.status()).toBe('ended');
      expect(relay.ended()).toBe('peer_left');
      expect(ended).toEqual(['peer_left']);
      expect(socket.disconnectCalls).toBeGreaterThan(0);
    });

    it('sendFrame resolves accepted and maps error acks', async () => {
      await createSession();
      socket.answers.set('frame', { ok: true });
      expect(await relay.sendFrame(frame(1))).toBe('accepted');
      socket.answers.set('frame', { ok: false, error: 'rate_limited' });
      expect(await relay.sendFrame(frame(2))).toBe('rate_limited');
    });
  });

  describe('reconnect and resume', () => {
    it('resumes with the stored token after a reconnect', async () => {
      await createSession();
      socket.serverDrop();
      expect(relay.status()).toBe('reconnecting');
      socket.answers.set('session:resume', { ok: true });
      socket.serverConnect();
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.emitted.find((e) => e.event === 'session:resume')?.args[0]).toEqual({
        sessionId: SID,
        token: TOK,
      });
      expect(relay.status()).toBe('connected');
    });

    it('stays reconnecting until the resume ack arrives', async () => {
      await createSession();
      socket.serverDrop();
      socket.serverConnect();
      expect(relay.status()).toBe('reconnecting');
      socket.lastAck('session:resume')({ ok: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(relay.status()).toBe('connected');
    });

    it('not_found on resume ends the session', async () => {
      await createSession();
      const ended: RelayEndReason[] = [];
      relay.ended$.subscribe((r) => ended.push(r));
      socket.serverDrop();
      socket.answers.set('session:resume', { ok: false, error: 'not_found' });
      socket.serverConnect();
      await vi.advanceTimersByTimeAsync(0);
      expect(relay.status()).toBe('ended');
      expect(ended).toEqual(['session_lost']);
      expect(socket.disconnectCalls).toBeGreaterThan(0);
    });

    it('ends when the grace period passes without a resume', async () => {
      await createSession();
      socket.serverDrop();
      await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS - 1);
      expect(relay.status()).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(2);
      expect(relay.status()).toBe('ended');
      expect(relay.ended()).toBe('grace_expired');
    });

    it('a successful resume cancels the grace timer', async () => {
      await createSession();
      socket.serverDrop();
      socket.answers.set('session:resume', { ok: true });
      socket.serverConnect();
      await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS * 2);
      expect(relay.status()).toBe('connected');
    });

    it('a server-initiated disconnect goes offline (no retry) then ends at the grace', async () => {
      await createSession();
      socket.serverDrop('io server disconnect');
      expect(relay.status()).toBe('offline');
      await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS + 1);
      expect(relay.ended()).toBe('grace_expired');
    });

    it('retries the resume when the link breaks mid-resume', async () => {
      await createSession();
      socket.serverDrop();
      socket.serverConnect();
      socket.serverDrop();
      socket.answers.set('session:resume', { ok: true });
      socket.serverConnect();
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.count('session:resume')).toBe(2);
      expect(relay.status()).toBe('connected');
    });
  });

  describe('no buffering while offline', () => {
    it('drops frames by default and never emits them', async () => {
      await createSession();
      socket.serverDrop();
      expect(await relay.sendFrame(frame(1))).toBe('dropped');
      expect(await relay.sendFrame(frame(2))).toBe('dropped');
      expect(socket.count('frame')).toBe(0);
    });

    it('keeps only the latest frame and sends it once after resume', async () => {
      await createSession();
      socket.serverDrop();
      for (let i = 1; i <= 50; i++) {
        expect(await relay.sendFrame(frame(i), { keepLatest: true })).toBe('queued');
      }
      expect(socket.count('frame')).toBe(0);
      socket.answers.set('session:resume', { ok: true });
      socket.answers.set('frame', { ok: true });
      socket.serverConnect();
      await vi.advanceTimersByTimeAsync(0);
      const sent = socket.emitted.filter((e) => e.event === 'frame');
      expect(sent).toHaveLength(1);
      expect(sent[0]?.args[0]).toEqual(frame(50));
    });

    it('does not send the kept frame when the resume fails', async () => {
      await createSession();
      socket.serverDrop();
      await relay.sendFrame(frame(1), { keepLatest: true });
      socket.answers.set('session:resume', { ok: false, error: 'not_found' });
      socket.serverConnect();
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.count('frame')).toBe(0);
    });

    it('does not send during the resume handshake', async () => {
      await createSession();
      socket.serverDrop();
      socket.serverConnect();
      expect(await relay.sendFrame(frame(1))).toBe('dropped');
      expect(socket.count('frame')).toBe(0);
    });

    it('resolves a frame awaiting its ack as dropped when the link breaks', async () => {
      await createSession();
      const p = relay.sendFrame(frame(1));
      socket.serverDrop();
      expect(await p).toBe('dropped');
    });
  });

  describe('leave', () => {
    it('disconnects explicitly, forgets the session and does not reconnect', async () => {
      await createSession();
      const ended: RelayEndReason[] = [];
      relay.ended$.subscribe((r) => ended.push(r));
      relay.leave();
      expect(socket.disconnectCalls).toBe(1);
      expect(relay.status()).toBe('ended');
      expect(relay.ended()).toBe('left');
      expect(ended).toEqual([]);
      // late events from the old socket are ignored
      socket.serverConnect();
      expect(socket.count('session:resume')).toBe(0);
      expect(await relay.sendFrame(frame(1), { keepLatest: true })).toBe('dropped');
    });

    it('a new create starts clean after leave', async () => {
      await createSession();
      relay.leave();
      const first = socket;
      const p = relay.create();
      const second = sock(1);
      expect(second).not.toBe(first);
      second.answers.set('session:create', { ok: true, sessionId: SID, senderToken: TOK2 });
      second.serverConnect();
      expect(await p).toMatchObject({ ok: true, senderToken: TOK2 });
      expect(relay.status()).toBe('connected');
      expect(relay.ended()).toBeNull();
    });
  });

  it('never writes tokens to storage', async () => {
    await createSession();
    for (const store of [localStorage, sessionStorage]) {
      expect(JSON.stringify({ ...store })).not.toContain(TOK);
    }
  });
});
