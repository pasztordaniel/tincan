import { Injectable, inject, signal, type OnDestroy } from '@angular/core';
import {
  EVENTS,
  RECONNECT_GRACE_MS,
  isCreateResult,
  isFrame,
  isFrameResult,
  isJoinResult,
  isPeerEvent,
  isResumeResult,
  isSessionEndedEvent,
  type CreateError,
  type EndReason,
  type Frame,
  type FrameError,
  type JoinError,
  type PeerState,
} from '@tincan/shared';
import { Subject, type Observable } from 'rxjs';
import { RELAY_SOCKET_FACTORY, type TincanSocket } from './relay-socket';

/** `connecting` before the first connect, `reconnecting` while resuming within the grace period. */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'ended';

/** Server reasons plus the ones only this client can determine. */
export type RelayEndReason = EndReason | 'left' | 'session_lost' | 'grace_expired';

/** Local failures on top of the server's error codes. */
export type LocalError = 'offline' | 'timeout' | 'protocol';

export type CreateOutcome =
  | { ok: true; sessionId: string; senderToken: string }
  | { ok: false; error: CreateError | LocalError };
export type JoinOutcome =
  { ok: true; receiverToken: string } | { ok: false; error: JoinError | LocalError };
/**
 * - `accepted`: the relay acked the frame (not "delivered").
 * - `queued`: not connected; kept as the single latest frame and sent after a successful resume.
 * - `dropped`: not connected and not kept, or the link broke while waiting for the ack.
 */
export type FrameOutcome = 'accepted' | 'queued' | 'dropped' | FrameError | LocalError;

export interface ProtocolError {
  /** Where the invalid data came from. Never the data itself: it is untrusted and may be sensitive. */
  source: 'frame' | 'peer' | 'ended' | 'ack:create' | 'ack:join' | 'ack:resume' | 'ack:frame';
}

export interface SendFrameOptions {
  /**
   * While not connected keep this frame (replacing any older kept one) and send it after a successful
   * resume. Only for full-state frames, where the latest one makes every earlier one redundant.
   */
  keepLatest?: boolean;
}

const ACK_TIMEOUT_MS = 8_000;
const CONNECT_TIMEOUT_MS = 10_000;

interface Session {
  sessionId: string;
  /** Sender or receiver token. Memory only: never stored, put in a URL, exposed or logged. */
  token: string;
}

type AckResult<T> = T | 'timeout' | 'protocol' | 'offline';

/**
 * Transport only: wraps socket.io-client, validates everything the relay sends, and keeps the link
 * alive within the reconnect grace. No crypto here; frames are opaque `{ v, seq, iv, ct }` objects.
 *
 * Anything that fails validation is dropped and reported on `protocolErrors$`, never trusted.
 * `create()` and `join()` start from a clean slate: they drop any previous session first.
 */
@Injectable({ providedIn: 'root' })
export class RelayService implements OnDestroy {
  private readonly createSocket = inject(RELAY_SOCKET_FACTORY);

  private readonly _status = signal<ConnectionStatus>('connecting');
  private readonly _peer = signal<PeerState | null>(null);
  private readonly _ended = signal<RelayEndReason | null>(null);
  private readonly _protocolErrorCount = signal(0);

  readonly status = this._status.asReadonly();
  /** State of the other party, `null` until the relay reports one. */
  readonly peer = this._peer.asReadonly();
  /** Why the session is over, `null` while it is not. */
  readonly ended = this._ended.asReadonly();
  readonly protocolErrorCount = this._protocolErrorCount.asReadonly();

  private readonly frameSubject = new Subject<Frame>();
  private readonly peerSubject = new Subject<PeerState>();
  private readonly endedSubject = new Subject<RelayEndReason>();
  private readonly protocolErrorSubject = new Subject<ProtocolError>();

  /** Validated frames from the relay (receiver side). */
  readonly frames$: Observable<Frame> = this.frameSubject.asObservable();
  readonly peer$: Observable<PeerState> = this.peerSubject.asObservable();
  /** Fires once per ended session, except for our own `leave()`. */
  readonly ended$: Observable<RelayEndReason> = this.endedSubject.asObservable();
  readonly protocolErrors$: Observable<ProtocolError> = this.protocolErrorSubject.asObservable();

  private socket: TincanSocket | null = null;
  private session: Session | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingAcks = new Set<() => void>();
  private keptFrame: Frame | null = null;

  /** Opens a session as the sender. */
  async create(): Promise<CreateOutcome> {
    const socket = await this.open();
    if (!socket) return { ok: false, error: 'offline' };
    const result = await this.ack(
      isCreateResult,
      (cb) => socket.emit(EVENTS.create, cb),
      'ack:create',
    );
    if (typeof result === 'string' || !result.ok) {
      return this.failOpen(typeof result === 'string' ? result : result.error);
    }
    this.session = { sessionId: result.sessionId, token: result.senderToken };
    this.setConnected();
    return { ok: true, sessionId: result.sessionId, senderToken: result.senderToken };
  }

  /** Claims the receiver slot of `sessionId`. */
  async join(sessionId: string): Promise<JoinOutcome> {
    const socket = await this.open();
    if (!socket) return { ok: false, error: 'offline' };
    const result = await this.ack(
      isJoinResult,
      (cb) => socket.emit(EVENTS.join, { sessionId }, cb),
      'ack:join',
    );
    if (typeof result === 'string' || !result.ok) {
      return this.failOpen(typeof result === 'string' ? result : result.error);
    }
    this.session = { sessionId, token: result.receiverToken };
    this.setConnected();
    return { ok: true, receiverToken: result.receiverToken };
  }

  /**
   * Sends one frame. Never lets socket.io buffer: when not connected the frame is dropped, or with
   * `keepLatest` held as the single latest frame and sent after a successful resume. A burst on
   * reconnect would hit the relay's rate limit and flood disconnect.
   */
  async sendFrame(frame: Frame, options: SendFrameOptions = {}): Promise<FrameOutcome> {
    if (!isFrame(frame)) return 'bad_request';
    const socket = this.socket;
    if (socket?.connected && this._status() === 'connected') return this.emitFrame(socket, frame);
    if (options.keepLatest && this.session && this._status() === 'reconnecting') {
      this.keptFrame = frame;
      return 'queued';
    }
    return 'dropped';
  }

  /**
   * Leaves on purpose: an explicit `disconnect()`, so the relay ends the session for the other party
   * with `peer_left` at once instead of starting a grace period.
   */
  leave(): void {
    this.teardown();
    this._status.set('ended');
    this._ended.set('left');
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  // --- connection ---------------------------------------------------------------------------

  private async open(): Promise<TincanSocket | null> {
    this.teardown();
    this._ended.set(null);
    this._peer.set(null);
    this._status.set('connecting');
    const socket = this.createSocket();
    this.socket = socket;
    this.attach(socket);
    const connected = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean): void => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        resolve(ok);
      };
      const onConnect = (): void => done(true);
      const timer = setTimeout(() => done(false), CONNECT_TIMEOUT_MS);
      socket.on('connect', onConnect);
      if (socket.connected) done(true);
      else socket.connect();
    });
    if (this.socket !== socket) return null; // torn down or replaced meanwhile
    if (!connected) {
      this.teardown();
      this._status.set('offline');
      return null;
    }
    return socket;
  }

  private attach(socket: TincanSocket): void {
    // Handlers take `unknown`: the relay is not trusted, see docs/security.md.
    socket.on('connect', () => {
      if (this.socket !== socket || !this.session) return;
      void this.resume(socket, this.session);
    });
    socket.on('disconnect', (reason) => {
      if (this.socket !== socket) return;
      this.flushAcks();
      if (this._status() === 'ended') return;
      if (!this.session) {
        this._status.set('offline');
        return;
      }
      // `io server disconnect`: the relay cut us and socket.io will not retry. Stay offline; the grace
      // timer still ends the session.
      this._status.set(reason === 'io server disconnect' ? 'offline' : 'reconnecting');
      this.startGrace();
    });
    socket.on('connect_error', () => {
      if (this.socket !== socket || this._status() === 'ended') return;
      if (!this.session) this._status.set('offline');
    });
    socket.on('frame', (payload: unknown) => {
      if (this.socket !== socket) return;
      if (isFrame(payload)) this.frameSubject.next(payload);
      else this.protocolError('frame');
    });
    socket.on('peer', (payload: unknown) => {
      if (this.socket !== socket) return;
      if (isPeerEvent(payload)) {
        this._peer.set(payload.state);
        this.peerSubject.next(payload.state);
      } else this.protocolError('peer');
    });
    socket.on('session:ended', (payload: unknown) => {
      if (this.socket !== socket) return;
      if (isSessionEndedEvent(payload)) this.finish(payload.reason);
      else this.protocolError('ended');
    });
  }

  /** After a reconnect: re-attach to the slot with the stored token, within the grace period. */
  private async resume(socket: TincanSocket, session: Session): Promise<void> {
    this._status.set('reconnecting');
    const result = await this.ack(
      isResumeResult,
      (cb) =>
        socket.emit(EVENTS.resume, { sessionId: session.sessionId, token: session.token }, cb),
      'ack:resume',
    );
    if (this.socket !== socket || this.session !== session) return;
    // The link broke mid-resume: the next `connect` retries.
    if (result === 'offline') return;
    if (typeof result === 'string' || !result.ok) {
      // `not_found` means the session is over (unknown, wrong token and expired grace look the same).
      // Any other failure gets the same treatment: we cannot prove the slot is still ours.
      this.finish('session_lost');
      return;
    }
    this.setConnected();
    const kept = this.keptFrame;
    this.keptFrame = null;
    if (kept) void this.emitFrame(socket, kept);
  }

  private setConnected(): void {
    this.clearGrace();
    this._status.set('connected');
  }

  private startGrace(): void {
    if (this.graceTimer) return;
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      this.finish('grace_expired');
    }, RECONNECT_GRACE_MS);
  }

  private clearGrace(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  /** The session is over: stop reconnecting, forget the token, tell the views. */
  private finish(reason: RelayEndReason): void {
    if (this._status() === 'ended') return;
    this.teardown();
    this._status.set('ended');
    this._ended.set(reason);
    this.endedSubject.next(reason);
  }

  private failOpen<E>(error: E): { ok: false; error: E } {
    this.teardown();
    this._status.set('offline');
    return { ok: false, error };
  }

  private teardown(): void {
    this.clearGrace();
    this.flushAcks();
    this.keptFrame = null;
    this.session = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
  }

  // --- acks ---------------------------------------------------------------------------------

  private async emitFrame(socket: TincanSocket, frame: Frame): Promise<FrameOutcome> {
    const result = await this.ack(
      isFrameResult,
      (cb) => socket.emit(EVENTS.frame, frame, cb),
      'ack:frame',
    );
    if (result === 'offline') return 'dropped';
    if (typeof result === 'string') return result;
    return result.ok ? 'accepted' : result.error;
  }

  /**
   * Emits with the ack as the last argument (always a function) and validates the answer. Resolves
   * `timeout` / `protocol` / `offline` instead of rejecting, so callers handle one result shape.
   */
  private ack<T extends object>(
    guard: (value: unknown) => value is T,
    send: (cb: (result: unknown) => void) => void,
    source: ProtocolError['source'],
  ): Promise<AckResult<T>> {
    return new Promise((resolve) => {
      const settle = (value: AckResult<T>): void => {
        clearTimeout(timer);
        this.pendingAcks.delete(flush);
        resolve(value); // a second call is a no-op on a settled promise
      };
      const flush = (): void => settle('offline');
      const timer = setTimeout(() => settle('timeout'), ACK_TIMEOUT_MS);
      this.pendingAcks.add(flush);
      send((result: unknown) => {
        if (guard(result)) settle(result);
        else {
          this.protocolError(source);
          settle('protocol');
        }
      });
    });
  }

  private flushAcks(): void {
    for (const flush of [...this.pendingAcks]) flush();
  }

  private protocolError(source: ProtocolError['source']): void {
    this._protocolErrorCount.update((n) => n + 1);
    this.protocolErrorSubject.next({ source });
  }
}
