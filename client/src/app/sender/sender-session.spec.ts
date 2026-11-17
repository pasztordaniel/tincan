import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BEAT_INTERVAL_MS,
  IDLE_CUT_MS,
  IDLE_WARNING_MS,
  MAX_TEXT_LENGTH,
  TEXT_DEBOUNCE_MS,
  TEXT_MAX_WAIT_MS,
  type Frame,
  type PeerState,
  type PlaintextMessage,
} from '@tincan/shared';
import { Subject } from 'rxjs';
import { CryptoService } from '../crypto/crypto.service';
import type { SealResult } from '../crypto/frame-crypto';
import {
  RelayService,
  type ConnectionStatus,
  type FrameOutcome,
  type RelayEndReason,
  type SendFrameOptions,
} from '../relay/relay.service';
import { SenderSession } from './sender-session';

const SID = 'A'.repeat(22);
const KEY_STRING = 'k'.repeat(43);

class FakeRelay {
  readonly status = signal<ConnectionStatus>('connected');
  readonly peer = signal<PeerState | null>('waiting');
  readonly peer$ = new Subject<PeerState>();
  readonly ended$ = new Subject<RelayEndReason>();
  readonly sent: { frame: Frame; options: SendFrameOptions | undefined }[] = [];
  outcome: FrameOutcome = 'accepted';
  leaves = 0;
  createResult: { ok: true; sessionId: string } | { ok: false; error: string } = {
    ok: true,
    sessionId: SID,
  };
  /** When set, `create()` waits for it (a slow relay). */
  createGate: Promise<void> | null = null;
  /** When set, `sendFrame` answers with this instead of `outcome` (an ack still in flight). */
  nextOutcome: Promise<FrameOutcome> | null = null;
  async create(): Promise<unknown> {
    if (this.createGate) await this.createGate;
    return this.createResult;
  }
  sendFrame(frame: Frame, options?: SendFrameOptions): Promise<FrameOutcome> {
    this.sent.push({ frame, options });
    const next = this.nextOutcome;
    this.nextOutcome = null;
    return next ?? Promise.resolve(this.outcome);
  }
  leave(): void {
    this.leaves++;
    this.status.set('ended');
  }
}

/** Records the exact message objects handed to `seal` and returns a frame that encodes the message. */
class FakeSealer {
  readonly messages: PlaintextMessage[] = [];
  /** When set, seals wait for it (a slow WebCrypto call). */
  gate: Promise<void> | null = null;
  async seal(message: PlaintextMessage): Promise<SealResult> {
    this.messages.push(message);
    const frame = { v: 1, seq: this.messages.length, iv: JSON.stringify(message), ct: '' };
    if (this.gate) await this.gate;
    return { ok: true, frame: frame as unknown as Frame };
  }
  texts(): string[] {
    return this.messages.flatMap((m) => (m.t === 'text' ? [m.text] : []));
  }
  count(t: PlaintextMessage['t']): number {
    return this.messages.filter((m) => m.t === t).length;
  }
}

describe('SenderSession', () => {
  let relay: FakeRelay;
  let sealer: FakeSealer;
  let session: SenderSession;
  let keyFailure = false;

  beforeEach(async () => {
    vi.useFakeTimers();
    keyFailure = false;
    relay = new FakeRelay();
    sealer = new FakeSealer();
    TestBed.configureTestingModule({
      providers: [
        { provide: RelayService, useValue: relay },
        {
          provide: CryptoService,
          useValue: {
            generateKey: () =>
              Promise.resolve(
                keyFailure
                  ? { ok: false, error: 'unsupported' }
                  : { ok: true, value: { key: {} as CryptoKey, keyString: KEY_STRING } },
              ),
            createSealer: () => sealer,
          },
        },
      ],
    });
    session = TestBed.inject(SenderSession);
  });
  afterEach(() => {
    session.end();
    vi.useRealTimers();
  });

  async function started(): Promise<void> {
    expect(await session.start()).toEqual({ ok: true });
  }
  const advance = async (ms: number): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  describe('start', () => {
    it('builds the receiver link with the key in the fragment only', async () => {
      await started();
      expect(session.link()).toBe(`${location.origin}/r/${SID}#${KEY_STRING}`);
      expect(session.active()).toBe(true);
      expect(session.state()).toBe('waiting');
    });

    it('reports a crypto failure and a relay failure without a link', async () => {
      keyFailure = true;
      expect(await session.start()).toEqual({ ok: false, error: 'crypto' });
      keyFailure = false;
      relay.createResult = { ok: false, error: 'busy' };
      expect(await session.start()).toEqual({ ok: false, error: 'busy' });
      relay.createResult = { ok: false, error: 'offline' };
      expect(await session.start()).toEqual({ ok: false, error: 'offline' });
      relay.createResult = { ok: false, error: 'rate_limited' };
      expect(await session.start()).toEqual({ ok: false, error: 'failed' });
      expect(session.link()).toBeNull();
      expect(session.active()).toBe(false);
      expect(session.starting()).toBe(false);
    });

    it('end() while the relay is creating cancels the start and leaves the new session', async () => {
      let release!: () => void;
      relay.createGate = new Promise((r) => (release = r));
      const pending = session.start();
      await advance(0);
      expect(session.starting()).toBe(true);
      session.end();
      expect(session.starting()).toBe(false);
      release();
      expect(await pending).toEqual({ ok: false, error: 'cancelled' });
      expect(relay.leaves).toBe(1);
      expect(session.active()).toBe(false);
      expect(session.link()).toBeNull();
      await advance(BEAT_INTERVAL_MS * 2);
      expect(sealer.messages).toEqual([]);
    });

    it('a newer start wins over one still in flight', async () => {
      let release!: () => void;
      relay.createGate = new Promise((r) => (release = r));
      const first = session.start();
      await advance(0);
      const second = session.start();
      release();
      expect(await first).toEqual({ ok: false, error: 'cancelled' });
      expect(await second).toEqual({ ok: true });
      expect(session.active()).toBe(true);
      expect(session.starting()).toBe(false);
    });
  });

  describe('status', () => {
    it('maps relay and peer state to the design states', async () => {
      await started();
      relay.peer.set('connected');
      expect(session.state()).toBe('connected');
      relay.peer.set('reconnecting');
      expect(session.state()).toBe('reconnecting');
      relay.peer.set('connected');
      relay.status.set('reconnecting');
      expect(session.state()).toBe('reconnecting');
      relay.status.set('connected');
      relay.peer.set('gone');
      expect(session.state()).toBe('ended');
      relay.peer.set('connected');
      relay.status.set('ended');
      expect(session.state()).toBe('ended');
    });
  });

  describe('text frames', () => {
    it('collapses a typing burst into one text frame with the newest text', async () => {
      await started();
      for (const t of ['h', 'he', 'hel', 'hell', 'hello']) {
        session.edit(t);
        await advance(50);
      }
      expect(sealer.count('text')).toBe(0);
      await advance(TEXT_DEBOUNCE_MS);
      expect(sealer.texts()).toEqual(['hello']);
      expect(relay.sent.at(-1)?.options).toEqual({ keepLatest: true });
    });

    it('sends at least every max wait while typing continuously', async () => {
      await started();
      let chars = '';
      // 10 s of a keystroke every 100 ms: never idle for the debounce, so only the max wait fires.
      for (let i = 0; i < 100; i++) {
        chars += 'x';
        session.edit(chars);
        await advance(100);
      }
      expect(sealer.count('text')).toBeGreaterThanOrEqual(9);
      expect(sealer.count('text')).toBeLessThanOrEqual(11);
      // typing is throttled to one per second, beats come every 5 s
      expect(sealer.count('typing')).toBeLessThanOrEqual(11);
      expect(sealer.count('beat')).toBe(2);
      expect(TEXT_MAX_WAIT_MS).toBe(1000);
    });

    it('seals a fresh message object every time', async () => {
      await started();
      session.edit('a');
      await advance(TEXT_DEBOUNCE_MS);
      session.edit('b');
      await advance(TEXT_DEBOUNCE_MS);
      await advance(BEAT_INTERVAL_MS);
      const msgs = sealer.messages;
      expect(msgs.length).toBeGreaterThanOrEqual(4);
      expect(new Set(msgs).size).toBe(msgs.length);
    });

    it('clamps the text to the shared maximum', async () => {
      await started();
      session.edit('x'.repeat(MAX_TEXT_LENGTH + 50));
      expect(session.text().length).toBe(MAX_TEXT_LENGTH);
    });

    it('sends the current text, even empty, when a receiver joins', async () => {
      await started();
      relay.peer$.next('connected');
      await advance(0);
      expect(sealer.texts()).toEqual(['']);
      session.edit('draft');
      await advance(TEXT_DEBOUNCE_MS);
      relay.peer$.next('connected');
      await advance(0);
      expect(sealer.texts().at(-1)).toBe('draft');
    });

    it('resends the text on the next beat when the relay did not take it', async () => {
      await started();
      relay.outcome = 'dropped';
      session.edit('lost');
      await advance(TEXT_DEBOUNCE_MS);
      expect(sealer.texts()).toEqual(['lost']);
      relay.outcome = 'accepted';
      await advance(BEAT_INTERVAL_MS);
      expect(sealer.texts()).toEqual(['lost', 'lost']);
      await advance(BEAT_INTERVAL_MS);
      expect(sealer.texts()).toEqual(['lost', 'lost']);
    });

    it('a late ack of an older text does not cancel the resend of a newer one', async () => {
      await started();
      let ackOld!: (o: FrameOutcome) => void;
      session.edit('old');
      await advance(0); // its typing frame goes out at once
      relay.nextOutcome = new Promise((r) => (ackOld = r)); // the text frame's ack stays in flight
      await advance(TEXT_DEBOUNCE_MS);
      relay.outcome = 'rate_limited';
      session.edit('new');
      await advance(TEXT_DEBOUNCE_MS);
      ackOld('accepted'); // the older frame's ack lands after the newer one was refused
      relay.outcome = 'accepted';
      await advance(BEAT_INTERVAL_MS);
      expect(sealer.texts()).toEqual(['old', 'new', 'new']);
    });
  });

  describe('typing and beat', () => {
    it('throttles typing to one per interval', async () => {
      await started();
      for (let i = 0; i < 30; i++) {
        session.edit('x'.repeat(i + 1));
        await advance(50);
      }
      // 1.5 s of typing: the first keystroke and one more after a second
      expect(sealer.count('typing')).toBe(2);
    });

    it('beats every interval while connected and not while the line is slack', async () => {
      await started();
      await advance(BEAT_INTERVAL_MS);
      expect(sealer.count('beat')).toBe(1);
      relay.status.set('reconnecting');
      await advance(BEAT_INTERVAL_MS * 2);
      expect(sealer.count('beat')).toBe(1);
      relay.status.set('connected');
      await advance(BEAT_INTERVAL_MS);
      expect(sealer.count('beat')).toBe(2);
    });
  });

  describe('idle', () => {
    it('warns at the warning mark with a countdown, then cuts and leaves', async () => {
      await started();
      await advance(IDLE_WARNING_MS - 1000);
      expect(session.state()).toBe('waiting');
      await advance(1000);
      expect(session.state()).toBe('idle');
      expect(session.idleSecondsLeft()).toBe((IDLE_CUT_MS - IDLE_WARNING_MS) / 1000);
      await advance(10_000);
      expect(session.idleSecondsLeft()).toBe((IDLE_CUT_MS - IDLE_WARNING_MS) / 1000 - 10);
      await advance(IDLE_CUT_MS - IDLE_WARNING_MS - 10_000);
      expect(session.state()).toBe('ended');
      expect(relay.leaves).toBe(1);
      expect(session.link()).toBeNull();
      // nothing is sent after the cut
      const before = sealer.messages.length;
      session.edit('too late');
      await advance(BEAT_INTERVAL_MS * 3);
      expect(sealer.messages.length).toBe(before);
    });

    it('typing resets the idle clock', async () => {
      await started();
      await advance(IDLE_WARNING_MS + 5000);
      expect(session.state()).toBe('idle');
      session.edit('hi');
      expect(session.state()).not.toBe('idle');
      await advance(IDLE_WARNING_MS - 1000);
      expect(session.state()).not.toBe('idle');
      await advance(1000);
      expect(session.state()).toBe('idle');
    });

    it('"Keep the line open" resets the clock and never cuts', async () => {
      await started();
      for (let i = 0; i < 3; i++) {
        await advance(IDLE_WARNING_MS + 30_000);
        expect(session.state()).toBe('idle');
        session.keepOpen();
        expect(session.state()).toBe('waiting');
      }
      expect(relay.leaves).toBe(0);
    });

    it('beats and typing do not count as activity', async () => {
      await started();
      await advance(IDLE_CUT_MS + 1);
      expect(session.state()).toBe('ended');
    });
  });

  describe('ended', () => {
    it('ignores edits after the relay ended the session and stops the timers', async () => {
      await started();
      session.edit('kept on screen');
      await advance(TEXT_DEBOUNCE_MS);
      relay.status.set('ended');
      relay.ended$.next('peer_timeout');
      expect(session.state()).toBe('ended');
      const before = sealer.messages.length;
      session.edit('ignored');
      await advance(BEAT_INTERVAL_MS * 3);
      expect(session.text()).toBe('kept on screen');
      expect(sealer.messages.length).toBe(before);
      expect(session.link()).toBeNull();
    });

    it('end() leaves the relay once and clears the text', async () => {
      await started();
      session.edit('secret');
      session.end();
      session.end();
      expect(relay.leaves).toBe(1);
      expect(session.text()).toBe('');
    });

    it('a frame sealed while the session ends is never handed to the relay', async () => {
      await started();
      let release!: () => void;
      sealer.gate = new Promise((r) => (release = r));
      session.edit('in flight');
      await advance(TEXT_DEBOUNCE_MS);
      expect(sealer.texts()).toEqual(['in flight']);
      const sent = relay.sent.length;
      session.end();
      release();
      await advance(0);
      expect(relay.sent.length).toBe(sent);
    });

    it('a pending text frame is not sent after end()', async () => {
      await started();
      session.edit('pending');
      session.end();
      await advance(TEXT_DEBOUNCE_MS * 2);
      expect(sealer.texts()).toEqual([]);
    });
  });
});
