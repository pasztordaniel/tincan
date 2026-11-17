import {
  FRAME_RATE_WINDOW_MS,
  MAX_FRAMES_PER_WINDOW,
  MAX_SESSION_LIFETIME_MS,
  RECONNECT_GRACE_MS,
  SESSION_IDLE_TTL_MS,
} from '@tincan/shared';

/**
 * Relay timing and capacity. Production uses the defaults (the shared protocol constants); tests inject
 * short durations so grace, TTL and lifetime behaviour runs against a real server in milliseconds.
 */
export interface RelayOptions {
  /** How long a dropped sender or receiver may take to resume. */
  graceMs: number;
  /** A session with no frame and no join/resume for this long ends with `idle`. */
  idleTtlMs: number;
  /** A session ends with `idle` this long after `session:create`, whatever its traffic. */
  lifetimeMs: number;
  /** Most sessions held at once; `session:create` answers `busy` beyond it. */
  maxSessions: number;
  /** Rate limit window, in ms. */
  rateWindowMs: number;
  /** Events a socket may send per window; further `frame`s are answered `rate_limited`, others dropped. */
  maxEventsPerWindow: number;
  /** Events per window at which the socket counts as flooding and is disconnected. */
  floodEventsPerWindow: number;
  /**
   * Packets the relay may hold for a receiver that is not reading (its transport is not writable). At
   * this backlog a further frame drops the receiver's connection instead of buffering it, which starts
   * the receiver's grace; after a resume the sender resends its full state.
   */
  maxReceiverBacklog: number;
  /**
   * A socket that has not completed a create, join or resume this long after connecting is
   * disconnected, so idle connections cannot pile up. Also socket.io's `connectTimeout`, which closes a
   * connection that never joins the namespace.
   */
  unboundTimeoutMs: number;
  /** Clock for the rate limiter. */
  now: () => number;
}

/** Enough for a small deployment; each session costs a few hundred bytes plus a few timers. */
export const DEFAULT_MAX_SESSIONS = 10_000;

/** A real client creates, joins or resumes right after connecting; 10 s leaves room for a slow network. */
export const DEFAULT_UNBOUND_TIMEOUT_MS = 10_000;

export const DEFAULT_RELAY_OPTIONS: Readonly<RelayOptions> = Object.freeze({
  graceMs: RECONNECT_GRACE_MS,
  idleTtlMs: SESSION_IDLE_TTL_MS,
  lifetimeMs: MAX_SESSION_LIFETIME_MS,
  maxSessions: DEFAULT_MAX_SESSIONS,
  rateWindowMs: FRAME_RATE_WINDOW_MS,
  maxEventsPerWindow: MAX_FRAMES_PER_WINDOW,
  // An honest sender sends a few frames per second; three times the limit within one window is never
  // a slow client catching up, so the socket is cut instead of being answered event by event.
  floodEventsPerWindow: 3 * MAX_FRAMES_PER_WINDOW,
  // About two seconds of frames at the rate limit, at most ~4 MB of the largest frames per receiver.
  maxReceiverBacklog: 2 * MAX_FRAMES_PER_WINDOW,
  unboundTimeoutMs: DEFAULT_UNBOUND_TIMEOUT_MS,
  now: () => Date.now(),
});
