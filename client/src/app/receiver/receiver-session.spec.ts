import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { STALE_AFTER_MS, type Frame, type PeerState } from '@tincan/shared';
import { Subject } from 'rxjs';
import { CryptoService } from '../crypto/crypto.service';
import type { FrameSealer } from '../crypto/frame-crypto';
import { randomSessionId } from '../crypto/test-helpers';
import {
  RelayService,
  type ConnectionStatus,
  type JoinOutcome,
  type ProtocolError,
  type RelayEndReason,
} from '../relay/relay.service';
import { RECEIVER_CLOCK, ReceiverSession } from './receiver-session';

class FakeRelay {
  readonly status = signal<ConnectionStatus>('connecting');
  readonly peer = signal<PeerState | null>(null);
  readonly ended = signal<RelayEndReason | null>(null);
  readonly frames$ = new Subject<Frame>();
  readonly protocolErrors$ = new Subject<ProtocolError>();
  outcome: JoinOutcome = { ok: true };
  join = vi.fn((_id: string): Promise<JoinOutcome> => Promise.resolve(this.outcome));
  leave = vi.fn();
}

// WebCrypto settles off the JS thread, so fake timers cannot flush it: wait on the real clock.
const realSetTimeout = globalThis.setTimeout;
const flush = async (): Promise<void> => {
  await new Promise((resolve) => realSetTimeout(resolve, 25));
  await vi.advanceTimersByTimeAsync(0);
};

describe('ReceiverSession', () => {
  let relay: FakeRelay;
  let now: number;
  let sessionId: string;
  let keyString: string;
  let sealer: FrameSealer;
  let session: ReceiverSession;
  let cryptoService: CryptoService;

  /** Visits `/r/<id>#<key>`; the fragment is what the real link carries. */
  async function visit(id: string | null, hash: string | null = keyString): Promise<void> {
    history.replaceState(null, '', '/r/' + (id ?? 'x') + (hash === null ? '' : '#' + hash));
    session = TestBed.inject(ReceiverSession);
    await session.start(id);
    await flush();
  }

  async function openLine(): Promise<void> {
    await visit(sessionId);
    relay.status.set('connected');
    relay.peer.set('connected');
    await session.open();
  }

  async function send(message: Parameters<FrameSealer['seal']>[0]): Promise<Frame> {
    const sealed = await sealer.seal(message);
    if (!sealed.ok) throw new Error(sealed.error);
    relay.frames$.next(sealed.frame);
    await flush();
    return sealed.frame;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    relay = new FakeRelay();
    now = 1_000_000;
    sessionId = randomSessionId();
    TestBed.configureTestingModule({
      providers: [
        ReceiverSession,
        { provide: RelayService, useValue: relay },
        { provide: RECEIVER_CLOCK, useValue: () => now },
      ],
    });
    cryptoService = TestBed.inject(CryptoService);
    const generated = await cryptoService.generateKey();
    if (!generated.ok) throw new Error('key');
    keyString = generated.value.keyString;
    sealer = cryptoService.createSealer(generated.value.key, sessionId);
  });
  afterEach(() => {
    vi.useRealTimers();
    history.replaceState(null, '', '/');
  });

  describe('gate and fragment', () => {
    it('does not talk to the relay before the Open click', async () => {
      await visit(sessionId);
      expect(session.stage()).toBe('gate');
      expect(relay.join).not.toHaveBeenCalled();
      await session.open();
      expect(relay.join).toHaveBeenCalledExactlyOnceWith(sessionId);
      expect(session.stage()).toBe('live');
    });

    it('clears the fragment while reading the key, before the gate is shown', async () => {
      await visit(sessionId);
      expect(location.hash).toBe('');
      expect(location.pathname).toBe('/r/' + sessionId);
    });

    it('ignores a second click while the join is in flight', async () => {
      await visit(sessionId);
      void session.open();
      void session.open();
      await flush();
      expect(relay.join).toHaveBeenCalledOnce();
    });
  });

  describe('invalid links', () => {
    it('without a key (reload) says the link was used', async () => {
      await visit(sessionId, null);
      expect(session.stage()).toBe('used');
      await session.open();
      expect(relay.join).not.toHaveBeenCalled();
    });

    it('with a malformed key is invalid, and the bad fragment is cleared too', async () => {
      await visit(sessionId, 'not-a-key');
      expect(session.stage()).toBe('invalid');
      expect(location.hash).toBe('');
    });

    it.each([null, 'abc', 'a'.repeat(22) + '!'])('with session id %s is invalid', async (id) => {
      await visit(id);
      expect(session.stage()).toBe('invalid');
      expect(location.hash).toBe('');
      expect(relay.join).not.toHaveBeenCalled();
    });
  });

  describe('join outcomes', () => {
    it('full shows the busy line', async () => {
      relay.outcome = { ok: false, error: 'full' };
      await visit(sessionId);
      await session.open();
      expect(session.stage()).toBe('busy');
    });

    it('not_found shows an ended line', async () => {
      relay.outcome = { ok: false, error: 'not_found' };
      await visit(sessionId);
      await session.open();
      expect(session.stage()).toBe('gone');
      expect(session.endReason()).toBe('not_found');
    });

    it('a network failure stays on the gate and can be retried', async () => {
      relay.outcome = { ok: false, error: 'offline' };
      await visit(sessionId);
      await session.open();
      expect(session.stage()).toBe('gate');
      expect(session.openFailure()).toBe('offline');
      relay.outcome = { ok: true };
      await session.open();
      expect(session.stage()).toBe('live');
      expect(session.openFailure()).toBeNull();
    });

    it('a retry keeps lastSeq: a frame accepted during a failed attempt cannot be replayed', async () => {
      await visit(sessionId);
      const first = await sealer.seal({ t: 'text', text: 'old', ts: now });
      const second = await sealer.seal({ t: 'text', text: 'new', ts: now });
      if (!first.ok || !second.ok) throw new Error('seal');
      // The relay delivers frames right behind the join ack, then the attempt still fails.
      relay.join.mockImplementationOnce(async () => {
        relay.frames$.next(first.frame);
        relay.frames$.next(second.frame);
        await flush();
        return { ok: false, error: 'timeout' };
      });
      await session.open();
      expect(session.stage()).toBe('gate');
      expect(session.text()).toBe('new');

      await session.open();
      relay.frames$.next(first.frame);
      await flush();
      expect(session.integrityError()).toBe(true);
      expect(session.text()).toBe('new');
    });
  });

  describe('frames', () => {
    it('shows text, typing and refreshes liveness on a beat', async () => {
      await openLine();
      await send({ t: 'text', text: 'hello', ts: 1 });
      expect(session.text()).toBe('hello');
      await send({ t: 'typing', ts: 2 });
      expect(session.typing()).toBe(true);
      await vi.advanceTimersByTimeAsync(3100);
      expect(session.typing()).toBe(false);

      now += 14_000;
      await send({ t: 'beat', ts: 3 });
      now += 14_000;
      await vi.advanceTimersByTimeAsync(1000);
      expect(session.stale()).toBe(false);
      expect(session.text()).toBe('hello');
    });

    it('a replayed frame warns and leaves the text unchanged', async () => {
      await openLine();
      const first = await send({ t: 'text', text: 'one', ts: 1 });
      await send({ t: 'text', text: 'two', ts: 2 });
      expect(session.integrityError()).toBe(false);
      relay.frames$.next(first);
      await flush();
      expect(session.integrityError()).toBe(true);
      expect(session.text()).toBe('two');
    });

    it('a tampered frame warns and leaves the text unchanged', async () => {
      await openLine();
      await send({ t: 'text', text: 'good', ts: 1 });
      const sealed = await sealer.seal({ t: 'text', text: 'evil', ts: 2 });
      if (!sealed.ok) throw new Error('seal');
      const ct = sealed.frame.ct;
      const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
      relay.frames$.next({ ...sealed.frame, ct: flipped });
      await flush();
      expect(session.integrityError()).toBe(true);
      expect(session.text()).toBe('good');
    });

    it('a frame for another session warns', async () => {
      await openLine();
      const generated = await cryptoService.generateKey();
      if (!generated.ok) throw new Error('key');
      const other = cryptoService.createSealer(generated.value.key, randomSessionId());
      const sealed = await other.seal({ t: 'text', text: 'x', ts: 1 });
      if (!sealed.ok) throw new Error('seal');
      relay.frames$.next(sealed.frame);
      await flush();
      expect(session.integrityError()).toBe(true);
      expect(session.text()).toBe('');
    });

    it('a frame the transport rejected as malformed warns', async () => {
      await openLine();
      relay.protocolErrors$.next({ source: 'frame' });
      expect(session.integrityError()).toBe(true);
    });

    it('a malformed frame object that reaches the opener warns', async () => {
      await openLine();
      relay.frames$.next({ v: 1 } as unknown as Frame);
      await flush();
      expect(session.integrityError()).toBe(true);
    });
  });

  describe('liveness and states', () => {
    it('goes stale after 15 s without a frame and recovers on the next one', async () => {
      await openLine();
      await send({ t: 'text', text: 'hi', ts: 1 });
      now += STALE_AFTER_MS - 1000;
      await vi.advanceTimersByTimeAsync(1000);
      expect(session.stale()).toBe(false);
      now += 1000;
      await vi.advanceTimersByTimeAsync(1000);
      expect(session.stale()).toBe(true);
      expect(session.lastUpdate()).toBe('15 s ago');
      expect(session.text()).toBe('hi');
      await send({ t: 'beat', ts: 2 });
      expect(session.stale()).toBe(false);
    });

    it('maps relay and peer state to the pill state', async () => {
      await openLine();
      expect(session.lineState()).toBe('connected');
      relay.peer.set('reconnecting');
      expect(session.lineState()).toBe('reconnecting');
      relay.peer.set('connected');
      relay.status.set('reconnecting');
      expect(session.lineState()).toBe('reconnecting');
      relay.status.set('connected');
      relay.peer.set(null);
      expect(session.lineState()).toBe('waiting');
    });

    it.each(['peer_left', 'peer_timeout', 'idle', 'shutdown', 'session_lost'] as const)(
      'ended (%s) is reported and is never stale',
      async (reason) => {
        await openLine();
        relay.ended.set(reason);
        expect(session.lineState()).toBe('ended');
        expect(session.endReason()).toBe(reason);
        now += 60_000;
        await vi.advanceTimersByTimeAsync(1000);
        expect(session.stale()).toBe(false);
      },
    );

    it('keeps the last text after the line ends', async () => {
      await openLine();
      await send({ t: 'text', text: 'bye', ts: 1 });
      relay.ended.set('peer_left');
      expect(session.text()).toBe('bye');
    });
  });

  describe('teardown', () => {
    it('does not leave a line it never joined', async () => {
      await visit(sessionId);
      session.ngOnDestroy();
      expect(relay.leave).not.toHaveBeenCalled();
    });

    it('gives the slot back when the page goes away while the join is in flight', async () => {
      await visit(sessionId);
      let answer!: (outcome: JoinOutcome) => void;
      relay.join.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      const opening = session.open();
      session.ngOnDestroy();
      expect(relay.leave).not.toHaveBeenCalled();
      answer({ ok: true });
      await opening;
      expect(relay.leave).toHaveBeenCalledOnce();
      expect(session.stage()).toBe('gate');
    });

    it('leaves a joined line on destroy', async () => {
      await openLine();
      session.ngOnDestroy();
      expect(relay.leave).toHaveBeenCalledOnce();
      expect(relay.frames$.observed).toBe(false);
    });
  });
});
