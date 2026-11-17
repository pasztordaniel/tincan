import { DOCUMENT, Injectable, computed, inject, signal, type OnDestroy } from '@angular/core';
import {
  BEAT_INTERVAL_MS,
  IDLE_CUT_MS,
  IDLE_WARNING_MS,
  MAX_TEXT_LENGTH,
  TEXT_DEBOUNCE_MS,
  TEXT_MAX_WAIT_MS,
  TYPING_MIN_INTERVAL_MS,
  type PlaintextMessage,
} from '@tincan/shared';
import type { Subscription } from 'rxjs';
import { CryptoService } from '../crypto/crypto.service';
import type { FrameSealer } from '../crypto/frame-crypto';
import { RelayService, type SendFrameOptions } from '../relay/relay.service';
import type { LineState } from '../ui/status-pill/status-pill.model';

/** Why `start()` did not produce a session. */
/** `cancelled`: `end()` or a newer `start()` ran while this one was in flight; nothing to report. */
export type StartError = 'crypto' | 'busy' | 'offline' | 'failed' | 'cancelled';

export type StartOutcome = { ok: true } | { ok: false; error: StartError };

/**
 * Sender side of one session: creates the key and the relay session, builds the receiver link, and
 * runs the sending model (ADR 0002 full-state frames) and the idle clock.
 *
 * - The `CryptoKey` and the sealer live in private fields and die with the session. The key string
 *   exists only inside `start()` and as the fragment of `link`; it is never in the sender's own URL,
 *   storage, logs or any request.
 * - Timing is plain `setTimeout` / `Date.now`, so tests drive it with fake timers.
 * - Every seal gets a fresh message object: nothing is shared between frames.
 */
@Injectable({ providedIn: 'root' })
export class SenderSession implements OnDestroy {
  private readonly relay = inject(RelayService);
  private readonly crypto = inject(CryptoService);
  private readonly origin = inject(DOCUMENT).location.origin;

  private readonly _link = signal<string | null>(null);
  private readonly _text = signal('');
  private readonly _starting = signal(false);
  private readonly _idleSecondsLeft = signal(Math.ceil((IDLE_CUT_MS - IDLE_WARNING_MS) / 1000));
  private readonly _idle = signal(false);
  private readonly _cut = signal(false);
  /** The cut was the user's "Cut the line", not the idle clock. */
  private readonly _cutByYou = signal(false);
  /** True from a successful `start()` until `end()` / the relay ending the session. */
  private readonly _active = signal(false);

  /** `<origin>/r/<sessionId>#<key>`: for the receiver only. `null` when there is no live session. */
  readonly link = this._link.asReadonly();
  readonly text = this._text.asReadonly();
  readonly starting = this._starting.asReadonly();
  readonly active = this._active.asReadonly();
  readonly idleSecondsLeft = this._idleSecondsLeft.asReadonly();
  readonly cutByYou = this._cutByYou.asReadonly();

  readonly state = computed<LineState>(() => {
    if (this._cut() || this.relay.status() === 'ended') return 'ended';
    if (this._idle()) return 'idle';
    const peer = this.relay.peer();
    if (peer === 'gone') return 'ended';
    const status = this.relay.status();
    if (status === 'reconnecting' || status === 'offline' || peer === 'reconnecting') {
      return 'reconnecting';
    }
    return peer === 'connected' ? 'connected' : 'waiting';
  });

  private sealer: FrameSealer | null = null;
  private subs: Subscription[] = [];
  private textTimer: ReturnType<typeof setTimeout> | null = null;
  /** When the oldest not yet sent edit happened (the max-wait anchor), `null` when nothing is pending. */
  private pendingSince: number | null = null;
  private lastTypingAt = -Infinity;
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityAt = 0;
  /** The latest text did not reach the relay (dropped, rate limited): resend on the next beat. */
  private resync = false;
  /** Numbers text sends, so only the newest one's outcome decides `resync` (acks settle out of order). */
  private textSendId = 0;
  /** Bumped by `stop()`: a `start()` that sees another epoch after an await was cancelled meanwhile. */
  private epoch = 0;

  /** Creates a fresh key and session, replacing any earlier one. */
  async start(): Promise<StartOutcome> {
    this.end();
    const epoch = this.epoch;
    this._cut.set(false);
    this._cutByYou.set(false);
    this._starting.set(true);
    try {
      const generated = await this.crypto.generateKey();
      if (epoch !== this.epoch) return { ok: false, error: 'cancelled' };
      if (!generated.ok) return { ok: false, error: 'crypto' };
      const created = await this.relay.create();
      if (epoch !== this.epoch) {
        // Ended (or replaced) while the relay was creating: a session made for nobody must not stay open.
        // If a newer start() had already called create(), ours came back failed (replaced), so this
        // never leaves the newer session.
        if (created.ok) this.relay.leave();
        return { ok: false, error: 'cancelled' };
      }
      if (!created.ok) {
        const error = created.error;
        return {
          ok: false,
          error: error === 'busy' ? 'busy' : error === 'offline' ? 'offline' : 'failed',
        };
      }
      this.sealer = this.crypto.createSealer(generated.value.key, created.sessionId);
      this._link.set(`${this.origin}/r/${created.sessionId}#${generated.value.keyString}`);
      this._active.set(true);
      this.subs = [
        // A receiver that (re)joins has seen nothing yet: send it the current state.
        this.relay.peer$.subscribe((peer) => {
          if (peer === 'connected') this.sendText();
        }),
        this.relay.ended$.subscribe(() => this.stop()),
      ];
      this.beatTimer = setInterval(() => this.beat(), BEAT_INTERVAL_MS);
      this.resetIdle();
      return { ok: true };
    } finally {
      if (epoch === this.epoch) this._starting.set(false);
    }
  }

  /** The text area changed. Ignored once the line is cut. */
  edit(value: string): void {
    if (!this._active() || this.state() === 'ended') return;
    const text = value.slice(0, MAX_TEXT_LENGTH);
    this._text.set(text);
    this.resetIdle();
    this.sendTyping();
    this.scheduleText();
  }

  /** "Keep the line open": restarts the idle clock without a text change. */
  keepOpen(): void {
    if (this._active() && this.state() !== 'ended') this.resetIdle();
  }

  /** Leaves on purpose: the relay tells the receiver at once. Safe to call at any time. */
  end(): void {
    const wasActive = this._active();
    this.stop();
    if (wasActive) this.relay.leave();
    this._text.set('');
  }

  /**
   * "Cut the line": ends the session on purpose. Same wipe as the idle cut (key, timers, link) and an
   * explicit leave: the receiver sees `peer_left` at once while connected, and only after the 20 s grace if this
   * side is reconnecting or offline (the disconnect cannot be delivered then); the text stays on screen, read-only.
   */
  cutLine(): void {
    if (!this._active() || this.state() === 'ended') return;
    this._cutByYou.set(true);
    this.cut();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // --- sending ------------------------------------------------------------------------------

  /** Debounce with a max wait: a steady typist still gets a frame at least every `TEXT_MAX_WAIT_MS`. */
  private scheduleText(): void {
    const now = Date.now();
    this.pendingSince ??= now;
    if (this.textTimer) clearTimeout(this.textTimer);
    const delay = Math.min(
      TEXT_DEBOUNCE_MS,
      Math.max(0, this.pendingSince + TEXT_MAX_WAIT_MS - now),
    );
    this.textTimer = setTimeout(() => this.sendText(), delay);
  }

  private sendText(): void {
    if (this.textTimer) clearTimeout(this.textTimer);
    this.textTimer = null;
    this.pendingSince = null;
    // The text is read now, so a burst collapses into one frame carrying the newest state.
    const text = this._text();
    const id = ++this.textSendId;
    this.send(() => ({ t: 'text', text, ts: Date.now() }), { keepLatest: true }, id);
  }

  private sendTyping(): void {
    const now = Date.now();
    if (now - this.lastTypingAt < TYPING_MIN_INTERVAL_MS) return;
    this.lastTypingAt = now;
    this.send(() => ({ t: 'typing', ts: Date.now() }), {});
  }

  private beat(): void {
    if (this.relay.status() !== 'connected') return;
    if (this.resync) this.sendText();
    this.send(() => ({ t: 'beat', ts: Date.now() }), {});
  }

  /**
   * `make` runs per call, so every seal gets its own message object. `textId` marks a text send.
   *
   * A frame sealed for a session that ended (or was replaced) during the seal is never handed to the
   * relay: on a new session's socket it would carry the old key and seq, fail authentication at the
   * receiver and, with a high seq, make the relay refuse the new session's frames as non-increasing.
   */
  private send(make: () => PlaintextMessage, options: SendFrameOptions, textId?: number): void {
    const sealer = this.sealer;
    if (!sealer) return;
    void (async () => {
      const sealed = await sealer.seal(make());
      if (!sealed.ok || this.sealer !== sealer) return;
      const outcome = await this.relay.sendFrame(sealed.frame, options);
      // Only the newest text send counts: an older ack settling late must not clear (or set) the flag.
      if (textId === this.textSendId && this.sealer === sealer) {
        this.resync = outcome !== 'accepted' && outcome !== 'queued';
      }
    })();
  }

  // --- idle ---------------------------------------------------------------------------------

  private resetIdle(): void {
    this.lastActivityAt = Date.now();
    this._idle.set(false);
    this.checkIdle();
  }

  private checkIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const elapsed = Date.now() - this.lastActivityAt;
    if (elapsed >= IDLE_CUT_MS) {
      this.cut();
      return;
    }
    if (elapsed < IDLE_WARNING_MS) {
      this.idleTimer = setTimeout(() => this.checkIdle(), IDLE_WARNING_MS - elapsed);
      return;
    }
    this._idle.set(true);
    this._idleSecondsLeft.set(Math.ceil((IDLE_CUT_MS - elapsed) / 1000));
    this.idleTimer = setTimeout(() => this.checkIdle(), Math.min(1000, IDLE_CUT_MS - elapsed));
  }

  private cut(): void {
    this._cut.set(true);
    this.stop();
    this.relay.leave();
  }

  /** Drops timers, subscriptions, the key and the link. The relay is told separately. */
  private stop(): void {
    this.epoch++;
    this._starting.set(false);
    this._active.set(false);
    this._idle.set(false);
    this._link.set(null);
    if (this.textTimer) clearTimeout(this.textTimer);
    if (this.beatTimer) clearInterval(this.beatTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.textTimer = this.beatTimer = this.idleTimer = null;
    this.pendingSince = null;
    this.resync = false;
    this.sealer = null;
    for (const s of this.subs) s.unsubscribe();
    this.subs = [];
  }
}
