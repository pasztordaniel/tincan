import type { Server, Socket } from 'socket.io';
import {
  EVENTS,
  isFrame,
  isJoinRequest,
  isResumeRequest,
  type ClientToServerEvents,
  type EndReason,
  type ErrorCode,
  type PeerState,
  type ServerToClientEvents,
} from '@tincan/shared';
import { DEFAULT_RELAY_OPTIONS, type RelayOptions } from './options.js';
import { RateLimiter } from './rate-limit.js';
import { newSessionId, newToken, tokensEqual } from './tokens.js';

/**
 * What the server actually receives: the same event names as the contract, but every argument is
 * untrusted. Handlers validate payloads with the shared guards and call the ack only if it is a function.
 */
export type InboundEvents = { [K in keyof ClientToServerEvents]: (...args: unknown[]) => void };
export type RelayServer = Server<InboundEvents, ServerToClientEvents>;
type RelaySocket = Socket<InboundEvents, ServerToClientEvents>;

type Role = 'sender' | 'receiver';
type Ack = (result: object) => void;

interface Slot {
  token: string;
  /** The attached socket, or null while the slot is in its reconnect grace period. */
  socket: RelaySocket | null;
  grace: NodeJS.Timeout | null;
}

interface Session {
  id: string;
  sender: Slot;
  /** Null until the first join; once set, the receiver slot is locked for the session's life. */
  receiver: Slot | null;
  /** Highest seq the relay accepted from the sender; frames must strictly increase it. */
  lastSeq: number;
  idle: NodeJS.Timeout;
  lifetime: NodeJS.Timeout;
}

interface Binding {
  session: Session;
  role: Role;
}

export interface Relay {
  /** Sessions currently held (for tests and health metrics; a count, never ids). */
  readonly sessionCount: number;
  /** Ends every session with `shutdown`. Call before `io.close()`. */
  close(): void;
}

/** Compared against when a session or receiver slot does not exist, so resume always does the same work. */
const ABSENT_TOKEN = newToken();

const fail = (error: ErrorCode) => ({ ok: false as const, error });

/** Splits `[...payload, ack]`. An event without a function ack is ignored: nobody would learn the result. */
function takeAck(args: unknown[]): { payload: unknown[]; ack: Ack } | undefined {
  const last = args.at(-1);
  if (typeof last !== 'function') return undefined;
  return { payload: args.slice(0, -1), ack: last as Ack };
}

/**
 * Socket.io packet types a client never needs to send: BINARY_EVENT (5) and BINARY_ACK (6). Rejecting
 * them, and any binary engine.io message, at the transport keeps attachments from ever being decoded.
 */
function isBinaryMessage(data: unknown): boolean {
  return typeof data !== 'string' || data.startsWith('5') || data.startsWith('6');
}

export function attachRelay(io: RelayServer, overrides: Partial<RelayOptions> = {}): Relay {
  const options: RelayOptions = { ...DEFAULT_RELAY_OPTIONS, ...overrides };
  const sessions = new Map<string, Session>();
  const bindings = new WeakMap<RelaySocket, Binding>();

  // -------------------------------------------------------------------------------------------
  // Session state
  // -------------------------------------------------------------------------------------------

  function bind(socket: RelaySocket, session: Session, role: Role): void {
    const slot = role === 'sender' ? session.sender : session.receiver;
    if (!slot) throw new Error('bind to a missing slot');
    slot.socket = socket;
    bindings.set(socket, { session, role });
  }

  function slotOf(session: Session, role: Role): Slot | null {
    return role === 'sender' ? session.sender : session.receiver;
  }

  function other(role: Role): Role {
    return role === 'sender' ? 'receiver' : 'sender';
  }

  /** What `role` should be told about the other party. */
  function peerStateFor(session: Session, role: Role): PeerState {
    const slot = slotOf(session, other(role));
    if (!slot) return 'waiting';
    return slot.socket ? 'connected' : 'reconnecting';
  }

  function touch(session: Session): void {
    session.idle.refresh();
  }

  /**
   * Ends a session and forgets it. With `leaver`, the other party is told `peer: gone` first; without
   * it (idle, lifetime, shutdown) both attached parties just get `session:ended`. Sockets stay
   * connected but are no longer bound to anything.
   */
  function end(session: Session, reason: EndReason, leaver?: Role): void {
    if (sessions.get(session.id) !== session) return;
    sessions.delete(session.id);
    clearTimeout(session.idle);
    clearTimeout(session.lifetime);
    for (const role of ['sender', 'receiver'] as const) {
      const slot = slotOf(session, role);
      if (!slot) continue;
      if (slot.grace) clearTimeout(slot.grace);
      slot.grace = null;
      const socket = slot.socket;
      slot.socket = null;
      if (!socket) continue;
      bindings.delete(socket);
      if (role === leaver) continue;
      if (leaver) socket.emit(EVENTS.peer, { state: 'gone' });
      socket.emit(EVENTS.ended, { reason });
    }
  }

  function startGrace(session: Session, role: Role): void {
    const slot = slotOf(session, role);
    if (!slot) return;
    slot.socket = null;
    slot.grace = setTimeout(() => end(session, 'peer_timeout', role), options.graceMs);
    slot.grace.unref();
    slotOf(session, other(role))?.socket?.emit(EVENTS.peer, { state: 'reconnecting' });
  }

  /** Disconnects a misbehaving socket. Its session ends at once, as if it had left on purpose. */
  function kick(socket: RelaySocket): void {
    const binding = bindings.get(socket);
    if (binding) end(binding.session, 'peer_left', binding.role);
    socket.disconnect(true);
  }

  // -------------------------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------------------------

  function onCreate(socket: RelaySocket, args: unknown[]): void {
    const call = takeAck(args);
    if (!call || call.payload.length !== 0) return;
    const { ack } = call;
    // One session per socket: a second create on the same socket is treated like a creation flood.
    if (bindings.has(socket)) return ack(fail('rate_limited'));
    if (sessions.size >= options.maxSessions) return ack(fail('busy'));

    let id = newSessionId();
    while (sessions.has(id)) id = newSessionId();
    const session: Session = {
      id,
      sender: { token: newToken(), socket: null, grace: null },
      receiver: null,
      lastSeq: 0,
      idle: setTimeout(() => end(session, 'idle'), options.idleTtlMs).unref(),
      lifetime: setTimeout(() => end(session, 'idle'), options.lifetimeMs).unref(),
    };
    sessions.set(id, session);
    bind(socket, session, 'sender');
    ack({ ok: true, sessionId: id, senderToken: session.sender.token });
    socket.emit(EVENTS.peer, { state: 'waiting' });
  }

  function onJoin(socket: RelaySocket, args: unknown[]): void {
    const call = takeAck(args);
    if (!call) return;
    const { payload, ack } = call;
    const request = payload[0];
    if (payload.length !== 1 || !isJoinRequest(request) || bindings.has(socket)) {
      return ack(fail('bad_request'));
    }
    const session = sessions.get(request.sessionId);
    if (!session) return ack(fail('not_found'));
    if (session.receiver) return ack(fail('full'));

    session.receiver = { token: newToken(), socket: null, grace: null };
    bind(socket, session, 'receiver');
    touch(session);
    ack({ ok: true, receiverToken: session.receiver.token });
    socket.emit(EVENTS.peer, { state: peerStateFor(session, 'receiver') });
    session.sender.socket?.emit(EVENTS.peer, { state: 'connected' });
  }

  function onResume(socket: RelaySocket, args: unknown[]): void {
    const call = takeAck(args);
    if (!call) return;
    const { payload, ack } = call;
    const request = payload[0];
    // Depends only on the payload format and this socket, never on a session or token.
    if (payload.length !== 1 || !isResumeRequest(request) || bindings.has(socket)) {
      return ack(fail('bad_request'));
    }

    // Both comparisons always run, against a random stand-in when a session or slot is absent, so the
    // work does not depend on whether the session exists or which token matched.
    const session = sessions.get(request.sessionId);
    const isSender = tokensEqual(request.token, session?.sender.token ?? ABSENT_TOKEN);
    const isReceiver = tokensEqual(request.token, session?.receiver?.token ?? ABSENT_TOKEN);
    // Unknown session, wrong token and an expired grace (the session is gone) all look the same.
    if (!session || (!isSender && !isReceiver)) return ack(fail('not_found'));

    const role: Role = isSender ? 'sender' : 'receiver';
    const slot = slotOf(session, role);
    if (!slot) return ack(fail('not_found'));
    const previous = slot.socket;
    if (slot.grace) clearTimeout(slot.grace);
    slot.grace = null;
    if (previous) bindings.delete(previous);
    bind(socket, session, role);
    touch(session);
    ack({ ok: true });
    socket.emit(EVENTS.peer, { state: peerStateFor(session, role) });
    if (previous) {
      // Takeover (e.g. a network switch the server has not noticed): the other party saw no drop, so
      // it gets no `peer` change. The old socket is already unbound, so its disconnect is a no-op.
      previous.disconnect(true);
    } else {
      slotOf(session, other(role))?.socket?.emit(EVENTS.peer, { state: 'connected' });
    }
  }

  function onFrame(socket: RelaySocket, args: unknown[]): void {
    const call = takeAck(args);
    if (!call) return;
    const { payload, ack } = call;
    const binding = bindings.get(socket);
    if (!binding || binding.role !== 'sender') return ack(fail('unauthorized'));
    const frame = payload[0];
    if (payload.length !== 1 || !isFrame(frame)) return ack(fail('bad_request'));
    const { session } = binding;
    // The receiver would drop a non-increasing seq as a replay anyway; refusing it here keeps the
    // relay from forwarding junk. The relay never decrypts, so this is all it can check.
    if (frame.seq <= session.lastSeq) return ack(fail('bad_request'));
    session.lastSeq = frame.seq;
    touch(session);
    // Forward a fresh object with exactly the validated fields.
    session.receiver?.socket?.emit(EVENTS.frame, {
      v: frame.v,
      seq: frame.seq,
      iv: frame.iv,
      ct: frame.ct,
    });
    ack({ ok: true });
  }

  function onDisconnect(socket: RelaySocket, reason: string): void {
    const binding = bindings.get(socket);
    if (!binding) return;
    bindings.delete(socket);
    // A tab that leaves on purpose calls socket.disconnect(); anything else is a drop that may resume.
    if (reason === 'client namespace disconnect' || reason === 'server namespace disconnect') {
      end(binding.session, 'peer_left', binding.role);
    } else {
      startGrace(binding.session, binding.role);
    }
  }

  /** Runs a handler; an unexpected error answers `internal` and logs no request data. */
  function guarded(
    name: string,
    handler: (socket: RelaySocket, args: unknown[]) => void,
  ): (socket: RelaySocket, args: unknown[]) => void {
    return (socket, args) => {
      try {
        handler(socket, args);
      } catch (err) {
        console.error(
          `relay: ${name} handler failed (${err instanceof Error ? err.name : 'unknown'})`,
        );
        const ack = args.at(-1);
        if (typeof ack === 'function') (ack as Ack)(fail('internal'));
      }
    };
  }

  const handlers = {
    [EVENTS.create]: guarded(EVENTS.create, onCreate),
    [EVENTS.join]: guarded(EVENTS.join, onJoin),
    [EVENTS.resume]: guarded(EVENTS.resume, onResume),
    [EVENTS.frame]: guarded(EVENTS.frame, onFrame),
  } as const;

  io.on('connection', (socket) => {
    // Binary attachments are never part of the protocol; cut the socket before they are decoded.
    socket.conn.on('packet', (packet: { type: string; data?: unknown }) => {
      if (packet.type === 'message' && isBinaryMessage(packet.data)) kick(socket);
    });

    const limiter = new RateLimiter(
      options.rateWindowMs,
      options.maxEventsPerWindow,
      options.floodEventsPerWindow,
    );
    socket.use((event, next) => {
      const verdict = limiter.hit(options.now());
      if (verdict === 'ok') return next();
      if (verdict === 'flood') return kick(socket);
      // Over the limit: drop. A frame gets `rate_limited`; join/resume have no such code and get nothing.
      const ack = event.at(-1);
      if (event[0] === EVENTS.frame && typeof ack === 'function')
        (ack as Ack)(fail('rate_limited'));
    });

    for (const [name, handler] of Object.entries(handlers)) {
      socket.on(name as keyof InboundEvents, (...args: unknown[]) => handler(socket, args));
    }
    socket.on('disconnect', (reason) => onDisconnect(socket, reason));
  });

  return {
    get sessionCount() {
      return sessions.size;
    },
    close() {
      for (const session of [...sessions.values()]) end(session, 'shutdown');
    },
  };
}
