import {
  Injectable,
  InjectionToken,
  computed,
  inject,
  signal,
  type OnDestroy,
} from '@angular/core';
import { STALE_AFTER_MS, isSessionId, type JoinError } from '@tincan/shared';
import { CryptoService } from '../crypto/crypto.service';
import type { FrameOpener } from '../crypto/frame-crypto';
import { PageLifecycle } from '../lifecycle/page-lifecycle';
import { RelayService, type RelayEndReason } from '../relay/relay.service';
import type { LineState } from '../ui/status-pill/status-pill.model';

/** Milliseconds clock, injectable so staleness can be tested without waiting. */
export const RECEIVER_CLOCK = new InjectionToken<() => number>('RECEIVER_CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

/**
 * - `checking`: reading the fragment (a few microtasks).
 * - `invalid`: the id or the key in the link is malformed, or WebCrypto is unavailable.
 * - `used`: no key in the link (reload, or the fragment was already consumed).
 * - `gate`: the Open step; nothing has been sent to the relay yet.
 * - `busy`: the receiver slot is taken.
 * - `gone`: the relay does not know the session.
 * - `live`: joined; `lineState` and `endReason` say how it is going.
 */
export type ReceiverStage = 'checking' | 'invalid' | 'used' | 'gate' | 'busy' | 'gone' | 'live';

export type OpenFailure =
  Exclude<JoinError, 'full' | 'not_found'> | 'offline' | 'timeout' | 'protocol';

/** How long a `typing` message keeps the indicator up (the sender repeats it at most once a second). */
const TYPING_HOLD_MS = 3000;
const TICK_MS = 1000;

/**
 * Everything the receiver page needs, no UI: the fragment key, the join (only on `open()`), decrypting
 * frames one at a time, liveness and integrity state. Provided by the page, so each visit starts clean.
 */
@Injectable()
export class ReceiverSession implements OnDestroy {
  private readonly relay = inject(RelayService);
  private readonly crypto = inject(CryptoService);
  private readonly now = inject(RECEIVER_CLOCK);

  private readonly _stage = signal<ReceiverStage>('checking');
  private readonly _text = signal('');
  private readonly _typing = signal(false);
  private readonly _integrityError = signal(false);
  private readonly _openFailure = signal<OpenFailure | null>(null);
  private readonly _joining = signal(false);
  private readonly lastFrameAt = signal(0);
  private readonly clock = signal(0);

  readonly stage = this._stage.asReadonly();
  /** The last good text. Replaced only by an authenticated text message. */
  readonly text = this._text.asReadonly();
  /** Never shown next to "line cut": a typing hold may still be running when the line ends. */
  readonly typing = computed(() => this._typing() && this.lineState() !== 'ended');
  /** Set once any frame was dropped as untrustworthy; stays up for the rest of the visit. */
  readonly integrityError = this._integrityError.asReadonly();
  /** Why the last Open attempt failed in a way the user can retry, `null` otherwise. */
  readonly openFailure = this._openFailure.asReadonly();

  readonly endReason = computed<RelayEndReason | 'not_found' | null>(() => {
    if (this._stage() === 'gone') return 'not_found';
    return this._stage() === 'live' ? this.relay.ended() : null;
  });

  readonly lineState = computed<LineState>(() => {
    if (this.relay.ended() !== null) return 'ended';
    const status = this.relay.status();
    const peer = this.relay.peer();
    if (status === 'reconnecting' || status === 'offline' || peer === 'reconnecting') {
      return 'reconnecting';
    }
    if (peer === 'gone') return 'ended';
    return peer === 'connected' ? 'connected' : 'waiting';
  });

  /** No fresh frame of any kind (text, typing, beat) for `STALE_AFTER_MS`, judged by its sender timestamp. */
  readonly stale = computed(
    () =>
      this._stage() === 'live' &&
      this.lineState() !== 'ended' &&
      this.clock() - this.lastFrameAt() >= STALE_AFTER_MS,
  );

  readonly lastUpdate = computed(() => {
    const seconds = Math.max(0, Math.floor((this.clock() - this.lastFrameAt()) / 1000));
    return seconds < 60 ? `${seconds} s ago` : `${Math.floor(seconds / 60)} min ago`;
  });

  private sessionId = '';
  /** Smallest `arrival - ts` seen, see `markFresh`. */
  private skew: number | null = null;
  private opener: FrameOpener | null = null;
  private joined = false;
  private destroyed = false;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private readonly offHide = inject(PageLifecycle).onHide(() => this.hangUp());

  /**
   * Reads (and clears) the fragment, then checks the id. The fragment is consumed synchronously, before
   * anything else can navigate, even when the id turns out to be invalid.
   */
  async start(sessionId: string | null): Promise<void> {
    const imported = await this.crypto.importKeyFromFragment();
    if (this.destroyed) return;
    if (sessionId === null || !isSessionId(sessionId)) return this._stage.set('invalid');
    if (!imported.ok) {
      this._stage.set(imported.error === 'missing_key' ? 'used' : 'invalid');
      return;
    }
    this.sessionId = sessionId;
    // One opener for the whole visit: a retried Open must not reset `lastSeq`, or a frame accepted
    // during a failed attempt could be replayed after the retry.
    this.opener = this.crypto.createOpener(imported.value, sessionId);
    this._stage.set('gate');
  }

  /** The explicit Open click: the first (and only) thing that talks to the relay. */
  async open(): Promise<void> {
    if (this._stage() !== 'gate' || this._joining() || this.opener === null) return;
    this._joining.set(true);
    this._openFailure.set(null);
    // Subscribe before joining: the relay may deliver a frame right behind the join ack.
    this.listen();
    const result = await this.relay.join(this.sessionId);
    this._joining.set(false);
    if (this.destroyed) {
      // The page went away while the join was in flight: give the slot back instead of holding it
      // with nobody reading (cleanup ran before `joined` was set, so it did not leave).
      if (result.ok) this.relay.leave();
      return;
    }
    if (result.ok) {
      this.joined = true;
      this.lastFrameAt.set(this.now());
      this.clock.set(this.now());
      this.tickTimer = setInterval(() => this.tick(), TICK_MS);
      this._stage.set('live');
      return;
    }
    this.stopListening();
    if (result.error === 'full') this._stage.set('busy');
    else if (result.error === 'not_found') this._stage.set('gone');
    else this._openFailure.set(result.error);
  }

  ngOnDestroy(): void {
    this.offHide();
    this.cleanup();
  }

  /**
   * The page goes away (`pagehide`): like a reload, the key, the plaintext and the timers go with it. A
   * page restored from bfcache then says the link was used instead of showing the old text or offering
   * an Open that would join with a key the page should no longer hold (ADR 0004).
   */
  private hangUp(): void {
    this.cleanup();
    this._text.set('');
    this._typing.set(false);
    const stage = this._stage();
    if (stage === 'checking' || stage === 'gate' || stage === 'live') this._stage.set('used');
  }

  // --- frames -------------------------------------------------------------------------------

  private subscriptions: { unsubscribe(): void }[] = [];

  private listen(): void {
    this.stopListening();
    this.subscriptions = [
      this.relay.frames$.subscribe((frame) => void this.onFrame(frame)),
      // A frame the transport already rejected as malformed is an integrity failure too.
      this.relay.protocolErrors$.subscribe((e) => {
        if (e.source === 'frame') this._integrityError.set(true);
      }),
    ];
  }

  private stopListening(): void {
    for (const s of this.subscriptions) s.unsubscribe();
    this.subscriptions = [];
  }

  private async onFrame(frame: unknown): Promise<void> {
    const opener = this.opener;
    // The UI says nothing more will arrive once the line is cut (a relay could still push frames
    // after a bare `peer: gone`).
    if (opener === null || this.lineState() === 'ended') return;
    const result = await opener.open(frame);
    if (this.destroyed) return;
    if (!result.ok) {
      // Replay, tamper, wrong session, bad padding: drop it, keep the last good text, say so.
      this._integrityError.set(true);
      return;
    }
    const message = result.message;
    this.markFresh(message.ts);
    if (message.t === 'text') {
      this._text.set(message.text);
      this.setTyping(false);
    } else if (message.t === 'typing') {
      this.setTyping(true);
    }
  }

  /**
   * Freshness comes from the sender's encrypted timestamp, not from when the relay delivered the
   * frame: otherwise a relay could hold frames back and replay them later at the usual pace, keeping
   * the view "live" while it shows old text. The two clocks are not synchronized, so the smallest
   * `arrival - ts` seen so far is taken as skew plus the fastest delivery; a frame delivered later
   * than that counts as sent at `ts + skew`. A delay present from the very first frame cannot be told
   * from clock skew (security.md, Withholding / freezing).
   */
  private markFresh(ts: number): void {
    const arrival = this.now();
    const offset = arrival - ts;
    if (this.skew === null || offset < this.skew) this.skew = offset;
    this.lastFrameAt.set(ts + this.skew);
    this.clock.set(arrival);
  }

  /** Advances the clock for staleness; stops for good once the line has ended. */
  private tick(): void {
    if (this.lineState() === 'ended') {
      if (this.tickTimer) clearInterval(this.tickTimer);
      this.tickTimer = null;
      return;
    }
    this.clock.set(this.now());
  }

  private setTyping(on: boolean): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = null;
    this._typing.set(on);
    if (on) this.typingTimer = setTimeout(() => this._typing.set(false), TYPING_HOLD_MS);
  }

  private cleanup(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopListening();
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.opener = null;
    if (this.joined) this.relay.leave();
  }
}
