import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  isCreateResult,
  isJoinResult,
  MAX_FRAMES_PER_WINDOW,
  MAX_MESSAGE_BYTES,
} from '@tincan/shared';
import { Manager } from 'socket.io-client';
import { delay, frame, startRelay, type Harness } from './relay-harness.js';

const NOT_FOUND = { ok: false, error: 'not_found' };
const OK = { ok: true };

let harness: Harness | undefined;
let logSpies: MockInstance[] = [];

async function relay(options: Parameters<typeof startRelay>[0] = {}): Promise<Harness> {
  harness = await startRelay(options);
  return harness;
}

beforeEach(() => {
  logSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level),
  );
});

afterEach(async () => {
  await harness?.stop();
  harness = undefined;
  // The relay logs nothing in normal operation, not even counts: no ids, tokens or payloads can leak.
  for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('create, join and relay', () => {
  it('creates a session, tells the sender it is waiting, and relays frames in order', async () => {
    const h = await relay();
    const sender = await h.connect();
    const created = await sender.call('session:create');
    expect(isCreateResult(created) && created.ok).toBe(true);
    const { sessionId } = created as { sessionId: string };
    expect(await sender.next('peer')).toEqual({ state: 'waiting' });

    const receiver = await h.connect();
    const joined = await receiver.call('session:join', { sessionId });
    expect(isJoinResult(joined) && joined.ok).toBe(true);
    expect(await receiver.next('peer')).toEqual({ state: 'connected' });
    expect(await sender.next('peer')).toEqual({ state: 'connected' });

    const frames = [frame(1), frame(2, 1024), frame(3)];
    for (const f of frames) expect(await sender.call('frame', f)).toEqual(OK);
    for (const f of frames) expect(await receiver.next('frame')).toEqual(f);
    expect(await receiver.quietFor(50)).toEqual([]);
    expect(await sender.quietFor(0)).toEqual([]);
  });

  it('relays a frame of the largest padding bucket within the message limit', async () => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    const big = frame(1, 65536);
    expect(JSON.stringify(big).length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(await sender.call('frame', big)).toEqual(OK);
    expect(await receiver.next('frame')).toEqual(big);
  });

  it('accepts frames before a receiver joins without forwarding them anywhere', async () => {
    const h = await relay();
    const { peer: sender, sessionId } = await h.sender();
    expect(await sender.call('frame', frame(1))).toEqual(OK);
    const receiver = await h.connect();
    await receiver.call('session:join', { sessionId });
    expect(await receiver.next('peer')).toEqual({ state: 'connected' });
    expect(await sender.call('frame', frame(2))).toEqual(OK);
    expect((await receiver.next('frame')) as { seq: number }).toMatchObject({ seq: 2 });
    expect(await receiver.quietFor(50)).toEqual([]);
  });

  it('answers busy when the session cap is reached and allows one session per socket', async () => {
    const h = await relay({ maxSessions: 1 });
    const { peer: first } = await h.sender();
    expect(await first.call('session:create')).toEqual({ ok: false, error: 'rate_limited' });
    const second = await h.connect();
    expect(await second.call('session:create')).toEqual({ ok: false, error: 'busy' });
    expect(h.relay.sessionCount).toBe(1);
  });

  it('locks the receiver slot: a second join gets full, even while the first receiver is away', async () => {
    const h = await relay();
    const { sender, receiver, sessionId } = await h.pair();
    const intruder = await h.connect();
    expect(await intruder.call('session:join', { sessionId })).toEqual({
      ok: false,
      error: 'full',
    });

    receiver.drop();
    expect(await sender.next('peer')).toEqual({ state: 'reconnecting' });
    expect(await intruder.call('session:join', { sessionId })).toEqual({
      ok: false,
      error: 'full',
    });
  });

  it('answers not_found for a join to an unknown session', async () => {
    const h = await relay();
    const stranger = await h.connect();
    const sessionId = 'AAAAAAAAAAAAAAAAAAAAAA';
    expect(await stranger.call('session:join', { sessionId })).toEqual(NOT_FOUND);
  });
});

describe('authorisation', () => {
  it('rejects frames from the receiver, from unbound sockets and after the session ended', async () => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    const unauthorized = { ok: false, error: 'unauthorized' };
    expect(await receiver.call('frame', frame(1))).toEqual(unauthorized);
    const stranger = await h.connect();
    expect(await stranger.call('frame', frame(1))).toEqual(unauthorized);
    expect(await sender.quietFor(50)).toEqual([]);

    receiver.leave();
    expect(await sender.next('session:ended')).toEqual({ reason: 'peer_left' });
    expect(await sender.call('frame', frame(1))).toEqual(unauthorized);
  });

  it('does not let a bound socket join or resume another slot', async () => {
    const h = await relay();
    const { sender, sessionId, receiverToken } = await h.pair();
    const badRequest = { ok: false, error: 'bad_request' };
    expect(await sender.call('session:join', { sessionId })).toEqual(badRequest);
    expect(await sender.call('session:resume', { sessionId, token: receiverToken })).toEqual(
      badRequest,
    );
  });
});

describe('untrusted input', () => {
  it.each([
    ['null', null],
    ['a string', 'frame'],
    ['an array', [1, 2]],
    ['an empty object', {}],
    ['an extra key', { ...frame(1), extra: 1 }],
    ['an own __proto__ key', JSON.parse(`{"__proto__":{},${JSON.stringify(frame(1)).slice(1)}`)],
    ['a wrong version', { ...frame(1), v: 2 }],
    ['seq 0', frame(0)],
    ['a fractional seq', frame(1.5)],
    ['a string seq', { ...frame(1), seq: '1' }],
    ['a short iv', { ...frame(1), iv: 'AAAA' }],
    ['an off-bucket ciphertext', { ...frame(1), ct: 'A'.repeat(400) }],
  ])('answers bad_request for a frame that is %s', async (_name, payload) => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    expect(await sender.call('frame', payload)).toEqual({ ok: false, error: 'bad_request' });
    expect(await receiver.quietFor(30)).toEqual([]);
  });

  it('answers bad_request for extra arguments and malformed join/resume payloads', async () => {
    const h = await relay();
    const { sender, sessionId, senderToken } = await h.pair();
    const badRequest = { ok: false, error: 'bad_request' };
    expect(await sender.call('frame', frame(1), 'extra')).toEqual(badRequest);
    const other = await h.connect();
    expect(await other.call('session:join', { sessionId, extra: true })).toEqual(badRequest);
    expect(await other.call('session:join', { sessionId: `${sessionId}.js` })).toEqual(badRequest);
    expect(await other.call('session:join')).toEqual(badRequest);
    expect(await other.call('session:resume', { sessionId })).toEqual(badRequest);
    expect(
      await other.call('session:resume', { sessionId, token: senderToken, role: 'sender' }),
    ).toEqual(badRequest);
  });

  it('ignores events whose ack is missing or not a function', async () => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    sender.socket.emit('frame', frame(1));
    sender.socket.emit('frame', frame(2), 'not-a-function');
    const stranger = await h.connect();
    stranger.socket.emit('session:create');
    stranger.socket.emit('session:create', 'not-a-function');
    expect(await stranger.callExpectingSilence(100, 'session:create', 'payload')).toBe('no-ack');
    expect(h.relay.sessionCount).toBe(1);
    // Nothing was relayed or recorded: seq 1 is still free.
    expect(await sender.call('frame', frame(1))).toEqual(OK);
    expect((await receiver.next('frame')) as { seq: number }).toMatchObject({ seq: 1 });
    expect(await receiver.quietFor(30)).toEqual([]);
  });

  it('rejects a seq that does not increase', async () => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    expect(await sender.call('frame', frame(5))).toEqual(OK);
    expect(await sender.call('frame', frame(5))).toEqual({ ok: false, error: 'bad_request' });
    expect(await sender.call('frame', frame(4))).toEqual({ ok: false, error: 'bad_request' });
    expect(await sender.call('frame', frame(6))).toEqual(OK);
    expect((await receiver.next('frame')) as { seq: number }).toMatchObject({ seq: 5 });
    expect((await receiver.next('frame')) as { seq: number }).toMatchObject({ seq: 6 });
    expect(await receiver.quietFor(30)).toEqual([]);
  });

  it('disconnects a socket that sends a message above the size limit', async () => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    const oversize = { ...frame(1), ct: 'A'.repeat(MAX_MESSAGE_BYTES) };
    sender.socket.emit('frame', oversize, () => undefined);
    expect(await sender.disconnected).toBe('transport close');
    // A dropped transport is indistinguishable from a network blip, so the sender gets its grace.
    expect(await receiver.next('peer')).toEqual({ state: 'reconnecting' });
    expect(receiver.pending()).toEqual([]);
  });

  it('disconnects a socket that sends a binary attachment and ends its session', async () => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    sender.socket.emit('frame', Buffer.from('not a frame'), () => undefined);
    expect(await sender.disconnected).toBe('io server disconnect');
    expect(await receiver.next('peer')).toEqual({ state: 'gone' });
    expect(await receiver.next('session:ended')).toEqual({ reason: 'peer_left' });
    expect(receiver.pending()).toEqual([]);
    expect(h.relay.sessionCount).toBe(0);
  });

  it('closes a connection that sends a binary event before joining the namespace', async () => {
    const h = await relay();
    const manager = new Manager(h.url, {
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) =>
      manager.open((err) => (err ? reject(err) : resolve())),
    );
    const engine = manager.engine;
    const closed = new Promise<string>((resolve) => engine.once('close', resolve));
    // A BINARY_EVENT header announcing ten attachments; socket.io would buffer them until connectTimeout.
    const placeholders = Array.from({ length: 10 }, (_, num) => ({ _placeholder: true, num }));
    engine.send(`510-${JSON.stringify(['frame', ...placeholders])}`);
    for (let i = 0; i < 9; i++) engine.send(Buffer.alloc(1024));
    expect(await closed).toBe('transport close');
    expect(h.relay.sessionCount).toBe(0);
  });
});

describe('unbound sockets', () => {
  it('disconnects a socket that never creates, joins or resumes', async () => {
    const h = await relay({ unboundTimeoutMs: 100 });
    const idle = await h.connect();
    const started = Date.now();
    expect(await idle.disconnected).toBe('io server disconnect');
    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
  });

  it('does not count failed attempts as binding', async () => {
    const h = await relay({ unboundTimeoutMs: 150 });
    const prober = await h.connect();
    expect(await prober.call('session:join', { sessionId: 'A'.repeat(22) })).toEqual(NOT_FOUND);
    expect(await prober.disconnected).toBe('io server disconnect');
  });

  it('keeps sockets bound by create, join or resume, also after their session ends', async () => {
    const h = await relay({ unboundTimeoutMs: 100 });
    const { sender, receiver, sessionId, receiverToken } = await h.pair();
    receiver.drop();
    expect(await sender.next('peer')).toEqual({ state: 'reconnecting' });
    const resumed = await h.connect();
    expect(await resumed.call('session:resume', { sessionId, token: receiverToken })).toEqual(OK);
    expect(await resumed.next('peer')).toEqual({ state: 'connected' });
    expect(await sender.next('peer')).toEqual({ state: 'connected' });
    h.relay.close();
    expect(await sender.next('session:ended')).toEqual({ reason: 'shutdown' });
    expect(await resumed.next('session:ended')).toEqual({ reason: 'shutdown' });
    await delay(250);
    expect(sender.socket.connected).toBe(true);
    expect(resumed.socket.connected).toBe(true);
  });
});

describe('rate limit', () => {
  it('drops frames above the limit per window and accepts them again in the next window', async () => {
    let now = 0;
    const h = await relay({ now: () => now });
    const { sender, receiver } = await h.pair();
    now = 10_000; // a fresh window, so create does not count against the frames below
    const results = await Promise.all(
      Array.from({ length: MAX_FRAMES_PER_WINDOW + 5 }, (_, i) =>
        sender.call('frame', frame(i + 1)),
      ),
    );
    expect(results.slice(0, MAX_FRAMES_PER_WINDOW)).toEqual(
      Array.from({ length: MAX_FRAMES_PER_WINDOW }, () => OK),
    );
    expect(results.slice(MAX_FRAMES_PER_WINDOW)).toEqual(
      Array.from({ length: 5 }, () => ({ ok: false, error: 'rate_limited' })),
    );
    for (let i = 1; i <= MAX_FRAMES_PER_WINDOW; i++) {
      expect((await receiver.next('frame')) as { seq: number }).toMatchObject({ seq: i });
    }
    expect(await receiver.quietFor(30)).toEqual([]);

    now += 1000;
    expect(await sender.call('frame', frame(100))).toEqual(OK);
  });

  it('disconnects a flooding socket and ends its session', async () => {
    const now = 0;
    const h = await relay({ now: () => now });
    const { sender, receiver } = await h.pair();
    for (let i = 1; i <= 100; i++) sender.socket.emit('frame', frame(i), () => undefined);
    expect(await sender.disconnected).toBe('io server disconnect');
    expect(await receiver.next('peer')).toEqual({ state: 'gone' });
    expect(await receiver.next('session:ended')).toEqual({ reason: 'peer_left' });
    expect(h.relay.sessionCount).toBe(0);
  });

  it('also limits join attempts from one socket', async () => {
    const now = 0;
    const h = await relay({ now: () => now });
    const prober = await h.connect();
    const sessionId = 'AAAAAAAAAAAAAAAAAAAAAA';
    const answers = await Promise.all(
      Array.from({ length: MAX_FRAMES_PER_WINDOW + 1 }, () =>
        prober.callExpectingSilence(300, 'session:join', { sessionId }),
      ),
    );
    expect(answers.filter((a) => a === 'no-ack')).toHaveLength(1);
  });
});

describe('reconnect grace and resume', () => {
  it('lets a dropped receiver resume within the grace period', async () => {
    const h = await relay({ graceMs: 1000 });
    const { sender, receiver, sessionId, receiverToken } = await h.pair();
    receiver.drop();
    expect(await sender.next('peer')).toEqual({ state: 'reconnecting' });

    const back = await h.connect();
    expect(await back.call('session:resume', { sessionId, token: receiverToken })).toEqual(OK);
    expect(await back.next('peer')).toEqual({ state: 'connected' });
    expect(await sender.next('peer')).toEqual({ state: 'connected' });
    expect(await sender.call('frame', frame(1))).toEqual(OK);
    expect((await back.next('frame')) as { seq: number }).toMatchObject({ seq: 1 });
  });

  it('lets a dropped sender resume and continue its seq', async () => {
    const h = await relay({ graceMs: 1000 });
    const { sender, receiver, sessionId, senderToken } = await h.pair();
    expect(await sender.call('frame', frame(1))).toEqual(OK);
    await receiver.next('frame');
    sender.drop();
    expect(await receiver.next('peer')).toEqual({ state: 'reconnecting' });

    const back = await h.connect();
    expect(await back.call('session:resume', { sessionId, token: senderToken })).toEqual(OK);
    expect(await back.next('peer')).toEqual({ state: 'connected' });
    expect(await receiver.next('peer')).toEqual({ state: 'connected' });
    expect(await back.call('frame', frame(1))).toEqual({ ok: false, error: 'bad_request' });
    expect(await back.call('frame', frame(2))).toEqual(OK);
    expect((await receiver.next('frame')) as { seq: number }).toMatchObject({ seq: 2 });
  });

  it('tells a resuming sender that no receiver has joined yet', async () => {
    const h = await relay({ graceMs: 1000 });
    const { peer: sender, sessionId, senderToken } = await h.sender();
    sender.drop();
    await sender.disconnected;
    const back = await h.connect();
    expect(await back.call('session:resume', { sessionId, token: senderToken })).toEqual(OK);
    expect(await back.next('peer')).toEqual({ state: 'waiting' });
  });

  it('replaces a still-attached socket on resume without a peer change for the other party', async () => {
    const h = await relay();
    const { sender, receiver, sessionId, senderToken } = await h.pair();
    expect(await sender.call('frame', frame(1))).toEqual(OK);
    await receiver.next('frame');

    const replacement = await h.connect();
    expect(await replacement.call('session:resume', { sessionId, token: senderToken })).toEqual(OK);
    expect(await replacement.next('peer')).toEqual({ state: 'connected' });
    expect(await sender.disconnected).toBe('io server disconnect');
    expect(await receiver.quietFor(100)).toEqual([]);

    expect(await replacement.call('frame', frame(2))).toEqual(OK);
    expect((await receiver.next('frame')) as { seq: number }).toMatchObject({ seq: 2 });
    expect(h.relay.sessionCount).toBe(1);
  });

  it('ends the session with peer_timeout when the grace period expires', async () => {
    const h = await relay({ graceMs: 100 });
    const { sender, receiver, sessionId, senderToken } = await h.pair();
    sender.drop();
    expect(await receiver.next('peer')).toEqual({ state: 'reconnecting' });
    expect(await receiver.next('peer')).toEqual({ state: 'gone' });
    expect(await receiver.next('session:ended')).toEqual({ reason: 'peer_timeout' });
    expect(h.relay.sessionCount).toBe(0);

    const late = await h.connect();
    expect(await late.call('session:resume', { sessionId, token: senderToken })).toEqual(NOT_FOUND);
  });

  it('answers a wrong token exactly like an unknown session', async () => {
    const h = await relay();
    const { sessionId, senderToken, receiverToken } = await h.pair();
    const attacker = await h.connect();
    const wrongToken = await attacker.call('session:resume', {
      sessionId,
      token: 'AAAAAAAAAAAAAAAAAAAAAA',
    });
    const unknownSession = await attacker.call('session:resume', {
      sessionId: 'AAAAAAAAAAAAAAAAAAAAAA',
      token: senderToken,
    });
    const swapped = await attacker.call('session:resume', {
      sessionId: 'BBBBBBBBBBBBBBBBBBBBBA',
      token: receiverToken,
    });
    expect(wrongToken).toEqual(NOT_FOUND);
    expect(unknownSession).toEqual(wrongToken);
    expect(swapped).toEqual(wrongToken);
    expect(await attacker.quietFor(30)).toEqual([]);
  });

  it('answers not_found for a receiver token before anyone joined', async () => {
    const h = await relay();
    const { sessionId } = await h.sender();
    const attacker = await h.connect();
    // The token of an absent receiver slot is never the random stand-in it is compared against.
    expect(
      await attacker.call('session:resume', { sessionId, token: 'AAAAAAAAAAAAAAAAAAAAAA' }),
    ).toEqual(NOT_FOUND);
  });
});

describe('explicit leave', () => {
  it('ends the session at once when the sender leaves', async () => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    sender.leave();
    expect(await receiver.next('peer')).toEqual({ state: 'gone' });
    expect(await receiver.next('session:ended')).toEqual({ reason: 'peer_left' });
    expect(h.relay.sessionCount).toBe(0);
    // The receiver stays connected but is no longer bound to anything.
    expect(receiver.socket.connected).toBe(true);
  });

  it('ends the session at once when the receiver leaves', async () => {
    const h = await relay();
    const { sender, receiver, sessionId, receiverToken } = await h.pair();
    receiver.leave();
    expect(await sender.next('peer')).toEqual({ state: 'gone' });
    expect(await sender.next('session:ended')).toEqual({ reason: 'peer_left' });
    const back = await h.connect();
    expect(await back.call('session:resume', { sessionId, token: receiverToken })).toEqual(
      NOT_FOUND,
    );
  });
});

describe('session lifetime', () => {
  it('ends a session without frames after the idle TTL', async () => {
    const h = await relay({ idleTtlMs: 150 });
    const { sender, receiver } = await h.pair();
    expect(await sender.next('session:ended')).toEqual({ reason: 'idle' });
    expect(await receiver.next('session:ended')).toEqual({ reason: 'idle' });
    expect(h.relay.sessionCount).toBe(0);
  });

  it('keeps a session alive while frames arrive', async () => {
    const h = await relay({ idleTtlMs: 200 });
    const { sender, receiver } = await h.pair();
    for (let seq = 1; seq <= 5; seq++) {
      await delay(80);
      expect(await sender.call('frame', frame(seq))).toEqual(OK);
    }
    expect(h.relay.sessionCount).toBe(1);
    expect(await receiver.next('session:ended')).toEqual({ reason: 'idle' });
  });

  it('ends a busy session at the absolute lifetime cap', async () => {
    const h = await relay({ lifetimeMs: 300 });
    const { sender, receiver } = await h.pair();
    const started = Date.now();
    let seq = 0;
    const ended = receiver.next('session:ended');
    const beating = setInterval(() => {
      sender.socket.emit('frame', frame(++seq), () => undefined);
    }, 50);
    try {
      expect(await ended).toEqual({ reason: 'idle' });
    } finally {
      clearInterval(beating);
    }
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(await sender.next('session:ended')).toEqual({ reason: 'idle' });
  });

  it('ends every session with shutdown when the relay closes', async () => {
    const h = await relay();
    const { sender, receiver } = await h.pair();
    h.relay.close();
    expect(await sender.next('session:ended')).toEqual({ reason: 'shutdown' });
    expect(await receiver.next('session:ended')).toEqual({ reason: 'shutdown' });
  });
});
