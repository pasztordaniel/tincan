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
  readonly typing = this._typing.asReadonly();
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

  /** No frame of any kind (text, typing, beat) for `STALE_AFTER_MS`. */
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

  private key: CryptoKey | null = null;
  private sessionId = '';
  private opener: FrameOpener | null = null;
  private joined = false;
  private destroyed = false;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

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
    this.key = imported.value;
    this.sessionId = sessionId;
    this._stage.set('gate');
  }

  /** The explicit Open click: the first (and only) thing that talks to the relay. */
  async open(): Promise<void> {
    if (this._stage() !== 'gate' || this._joining() || this.key === null) return;
    this._joining.set(true);
    this._openFailure.set(null);
    this.opener = this.crypto.createOpener(this.key, this.sessionId);
    // Subscribe before joining: the relay may deliver a frame right behind the join ack.
    this.listen();
    const result = await this.relay.join(this.sessionId);
    this._joining.set(false);
    if (this.destroyed) return;
    if (result.ok) {
      this.joined = true;
      this.lastFrameAt.set(this.now());
      this.clock.set(this.now());
      this.tickTimer = setInterval(() => this.clock.set(this.now()), TICK_MS);
      this._stage.set('live');
      return;
    }
    this.stopListening();
    if (result.error === 'full') this._stage.set('busy');
    else if (result.error === 'not_found') this._stage.set('gone');
    else this._openFailure.set(result.error);
  }

  ngOnDestroy(): void {
    this.cleanup();
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
    if (opener === null) return;
    const result = await opener.open(frame);
    if (this.destroyed) return;
    if (!result.ok) {
      // Replay, tamper, wrong session, bad padding: drop it, keep the last good text, say so.
      this._integrityError.set(true);
      return;
    }
    this.lastFrameAt.set(this.now());
    this.clock.set(this.now());
    const message = result.message;
    if (message.t === 'text') {
      this._text.set(message.text);
      this.setTyping(false);
    } else if (message.t === 'typing') {
      this.setTyping(true);
    }
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
    this.key = null;
    this.opener = null;
    if (this.joined) this.relay.leave();
  }
}
