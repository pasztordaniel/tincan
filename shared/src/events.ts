/**
 * socket.io wire contract: event names, payloads, ack results and their runtime validators.
 *
 * Validators are for untrusted input on both sides: the server validates every client payload, and
 * the client validates every server payload and ack (the relay is not trusted, see docs/security.md).
 */

import { PROTOCOL_VERSION } from './constants.js';
import { hasExactKeys, isCiphertext, isIv, isSeq, isSessionId, isToken, prop } from './guards.js';

// ---------------------------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------------------------

export const EVENTS = Object.freeze({
  /** Sender to server: open a new session. */
  create: 'session:create',
  /** Receiver to server: claim the single receiver slot. */
  join: 'session:join',
  /** Sender or receiver to server: re-attach a new socket to its slot within the grace period. */
  resume: 'session:resume',
  /** Sender to server to receiver: one encrypted frame. */
  frame: 'frame',
  /** Server to client: state of the other party. */
  peer: 'peer',
  /** Server to client: the session is over; the socket is no longer bound to it. */
  ended: 'session:ended',
} as const);

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/**
 * Every error code an ack can carry.
 * - `bad_request`: the payload failed validation.
 * - `not_found`: no such session, or (on resume) no slot this token can resume. Deliberately one code,
 *   so resume does not reveal whether a session exists or a token was wrong.
 * - `full`: the receiver slot is already taken (first join locks it, even while that receiver is
 *   in its reconnect grace period).
 * - `unauthorized`: the socket is not the sender of a session (e.g. a receiver trying to publish).
 * - `rate_limited`: too many frames or session creations.
 * - `busy`: the server's session cap is reached.
 * - `internal`: unexpected server error.
 */
export const ERROR_CODES = Object.freeze([
  'bad_request',
  'not_found',
  'full',
  'unauthorized',
  'rate_limited',
  'busy',
  'internal',
] as const);
export type ErrorCode = (typeof ERROR_CODES)[number];

export const CREATE_ERRORS = Object.freeze(['rate_limited', 'busy', 'internal'] as const);
export type CreateError = (typeof CREATE_ERRORS)[number];

export const JOIN_ERRORS = Object.freeze(['bad_request', 'not_found', 'full', 'internal'] as const);
export type JoinError = (typeof JOIN_ERRORS)[number];

export const RESUME_ERRORS = Object.freeze(['bad_request', 'not_found', 'internal'] as const);
export type ResumeError = (typeof RESUME_ERRORS)[number];

export const FRAME_ERRORS = Object.freeze([
  'bad_request',
  'unauthorized',
  'rate_limited',
  'internal',
] as const);
export type FrameError = (typeof FRAME_ERRORS)[number];

// ---------------------------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------------------------

export interface JoinRequest {
  sessionId: string;
}

export interface ResumeRequest {
  sessionId: string;
  /** The sender token or the receiver token, whichever this tab holds. */
  token: string;
}

/** An encrypted frame. `iv` and `ct` are base64url; AAD is `buildAad(sessionId, seq)`. */
export interface Frame {
  v: typeof PROTOCOL_VERSION;
  seq: number;
  iv: string;
  ct: string;
}

export const PEER_STATES = Object.freeze(['waiting', 'connected', 'reconnecting', 'gone'] as const);
/**
 * - `waiting`: (sender only) no receiver has joined yet.
 * - `connected`: the other party is attached.
 * - `reconnecting`: the other party dropped and is within its grace period.
 * - `gone`: the other party left for good; `session:ended` follows.
 */
export type PeerState = (typeof PEER_STATES)[number];

export interface PeerEvent {
  state: PeerState;
}

export const END_REASONS = Object.freeze([
  'peer_left',
  'peer_timeout',
  'idle',
  'shutdown',
] as const);
/**
 * - `peer_left`: the other party left on purpose (closed or reloaded the tab; the client calls
 *   `socket.disconnect()`, which the server sees as `client namespace disconnect`).
 * - `peer_timeout`: the other party dropped and did not resume within the grace period.
 * - `idle`: no activity for the idle TTL.
 * - `shutdown`: the server is stopping.
 */
export type EndReason = (typeof END_REASONS)[number];

export interface SessionEndedEvent {
  reason: EndReason;
}

// ---------------------------------------------------------------------------------------------
// Ack results
// ---------------------------------------------------------------------------------------------

export interface AckError<E extends ErrorCode> {
  ok: false;
  error: E;
}
export type AckResult<T extends object, E extends ErrorCode> = ({ ok: true } & T) | AckError<E>;

export type CreateResult = AckResult<{ sessionId: string; senderToken: string }, CreateError>;
export type JoinResult = AckResult<{ receiverToken: string }, JoinError>;
export type ResumeResult = AckResult<object, ResumeError>;
export type FrameResult = AckResult<object, FrameError>;

// ---------------------------------------------------------------------------------------------
// socket.io event maps: `Server<ClientToServerEvents, ServerToClientEvents>` and
// `Socket<ServerToClientEvents, ClientToServerEvents>`.
//
// After a successful create, join or resume the server emits `peer` to that socket with the current
// state of the other party, so acks carry no peer state. A successful `frame` ack means "accepted by
// the relay", not "delivered": frames for an absent receiver are dropped, and the sender resends its
// latest text when `peer` turns `connected` (full-state frames, ADR 0002).
//
// The server must treat handler arguments as untrusted: a client can omit the ack, pass a non-function
// ack, or put extra arguments first. Validate the payload with the guards below and only call `ack`
// when it is a function.
// ---------------------------------------------------------------------------------------------

export interface ClientToServerEvents {
  'session:create': (ack: (result: CreateResult) => void) => void;
  'session:join': (request: JoinRequest, ack: (result: JoinResult) => void) => void;
  'session:resume': (request: ResumeRequest, ack: (result: ResumeResult) => void) => void;
  frame: (frame: Frame, ack: (result: FrameResult) => void) => void;
}

export interface ServerToClientEvents {
  frame: (frame: Frame) => void;
  peer: (event: PeerEvent) => void;
  'session:ended': (event: SessionEndedEvent) => void;
}

// ---------------------------------------------------------------------------------------------
// Validators: client payloads (server side)
// ---------------------------------------------------------------------------------------------

export function isJoinRequest(value: unknown): value is JoinRequest {
  return hasExactKeys(value, ['sessionId']) && isSessionId(prop(value, 'sessionId'));
}

export function isResumeRequest(value: unknown): value is ResumeRequest {
  return (
    hasExactKeys(value, ['sessionId', 'token']) &&
    isSessionId(prop(value, 'sessionId')) &&
    isToken(prop(value, 'token'))
  );
}

/** A frame in either direction: `{ v: 1, seq, iv, ct }`, nothing else. */
export function isFrame(value: unknown): value is Frame {
  return (
    hasExactKeys(value, ['v', 'seq', 'iv', 'ct']) &&
    prop(value, 'v') === PROTOCOL_VERSION &&
    isSeq(prop(value, 'seq')) &&
    isIv(prop(value, 'iv')) &&
    isCiphertext(prop(value, 'ct'))
  );
}

// ---------------------------------------------------------------------------------------------
// Validators: server payloads and acks (client side)
// ---------------------------------------------------------------------------------------------

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return isOneOf(ERROR_CODES, value);
}

export function isPeerEvent(value: unknown): value is PeerEvent {
  return hasExactKeys(value, ['state']) && isOneOf(PEER_STATES, prop(value, 'state'));
}

export function isSessionEndedEvent(value: unknown): value is SessionEndedEvent {
  return hasExactKeys(value, ['reason']) && isOneOf(END_REASONS, prop(value, 'reason'));
}

function isAckError<E extends ErrorCode>(
  errors: readonly E[],
  value: unknown,
): value is AckError<E> {
  return (
    hasExactKeys(value, ['ok', 'error']) &&
    prop(value, 'ok') === false &&
    isOneOf(errors, prop(value, 'error'))
  );
}

function isAckOk(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return hasExactKeys(value, ['ok', ...fields]) && prop(value, 'ok') === true;
}

export function isCreateResult(value: unknown): value is CreateResult {
  return (
    (isAckOk(value, ['sessionId', 'senderToken']) &&
      isSessionId(prop(value, 'sessionId')) &&
      isToken(prop(value, 'senderToken'))) ||
    isAckError(CREATE_ERRORS, value)
  );
}

export function isJoinResult(value: unknown): value is JoinResult {
  return (
    (isAckOk(value, ['receiverToken']) && isToken(prop(value, 'receiverToken'))) ||
    isAckError(JOIN_ERRORS, value)
  );
}

export function isResumeResult(value: unknown): value is ResumeResult {
  return isAckOk(value, []) || isAckError(RESUME_ERRORS, value);
}

export function isFrameResult(value: unknown): value is FrameResult {
  return isAckOk(value, []) || isAckError(FRAME_ERRORS, value);
}
