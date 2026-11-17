# T07 — Client relay service

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T03 | in-review | feat/T07-relay-client |

## Goal
`RelayService` wrapping socket.io-client: typed emit/ack helpers, connection state as a signal
(`connecting | connected | reconnecting | offline | ended`), resume with token on reconnect, no frame logging.

## Acceptance
- Unit tests with a fake socket for state transitions and resume.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- dev: claimed
- dev: implemented `client/src/app/relay/` (`RelayService`, `RELAY_SOCKET_FACTORY`) with 31 unit tests on a fake socket
  (validation drops, resume, grace, no offline buffering, leave). `E2E_PORT=3201 npm run verify` green.
  - API: `create()`, `join(id)`, `sendFrame(frame, { keepLatest? })`, `leave()`; signals `status`, `peer`, `ended`,
    `protocolErrorCount`; observables `frames$`, `peer$`, `ended$`, `protocolErrors$`. Failures resolve as values
    (`{ ok: false, error }`, `FrameOutcome`), they do not reject.
  - Every payload and ack goes through the shared validators; invalid data is dropped and surfaced on
    `protocolErrors$` as a source tag only (never the data). Acks have an 8 s timeout (`timeout`), the connect 10 s.
  - Offline frames: never emitted, so socket.io cannot buffer them. Default `dropped`; with `keepLatest` only the
    newest frame is kept (`queued`) and sent once after a successful resume. Frames are also not sent during the
    resume handshake (status stays `reconnecting` until the ack).
  - Reconnect: socket.io's reconnection (websocket transport only, unlimited attempts); on every `connect` with a
    session the service sends `session:resume`. A client-side timer of `RECONNECT_GRACE_MS` from the drop ends the
    session (`grace_expired`); any failed resume ends it (`session_lost`, which includes `not_found`). A link that
    breaks mid-resume is retried by the next connect. `io server disconnect` (relay cut us, no auto retry) goes
    `offline` and ends at the grace timer.
  - Local end reasons beyond the server's: `left`, `session_lost`, `grace_expired`. `leave()` sets status `ended`
    and `ended() === 'left'` but does not fire `ended$`.
  - `create()` / `join()` start from a clean slate and drop any previous session; a failed create/join closes the
    socket and leaves status `offline`.
  - Tokens live in private fields only; nothing is logged, stored or exposed.
  - Added dependency `socket.io-client` (client): needs the dependency review.
  - Open: integration test against `createTincanServer` is a follow-up once T05 is on main. T10 may want a visible
    retry for `offline` after a server-forced disconnect.
- senior-dev review (2026-11-17): changes requested, fixed on the branch.
  - Medium (blocking), fixed (a5d9429): a create/join whose socket was torn down or replaced while its ack was pending
    called `failOpen()`, which tore down the newer session (e.g. `create()` then `join()`); `leave()` between an
    ack and its continuation revived the session; `teardown()` left a pending `open()` and its 10 s timer hanging;
    a create/join/resume acked on a link that broke before the continuation reported `connected` and cleared the
    grace. Now: identity check after every ack, `cancelOpen` in teardown, `bind()` goes `reconnecting` under the
    grace when the link is already down, resume returns when `!socket.connected`.
  - API change (9486297): `create()` resolves `{ ok: true, sessionId }`, `join()` `{ ok: true }` (no tokens);
    `join()` refuses a malformed id with `bad_request` without connecting.
  - Hand mutation testing of validation, no-buffer, keepLatest, grace and timer clearing: 36 mutants, all killed
    except four that are redundant guards (masked by another layer): `finish()` idempotence, per-handler socket
    identity checks (listeners are removed too), resume identity check and the ack-level `connected` check
    (masked by the `socket.connected` checks). Tests 31 -> 48, including `vi.getTimerCount()` checks after
    create, frame ack, resume, `leave()` during grace and during resume.
  - Note for T10: tab close/reload must call `leave()` (e.g. on `pagehide`); socket.io's default
    `closeOnBeforeunload: false` alone ends in `transport close`, i.e. a 20 s grace and `peer_timeout` for the peer
    instead of `peer_left`.
- security review (2026-11-17): `/security-review` + `crypto-review` on the branch diff. Fixed, no open findings.
  - Low, fixed (68518eb): socket.io-client buffers an emit when `connected` is still true but the ping has
    expired (laptop wake-up) and flushes it on the next connection before `connect`, i.e. before `session:resume`.
    The disconnect handler now empties `socket.sendBuffer`, and no ack-emit happens on a disconnected socket.
  - Low, fixed (3dd4d81): no client-side guard against the relay's per-connection limit (20/s answers
    `rate_limited`, 60 cuts the socket and ends the session for both). The service now counts its emits per
    connection and refuses frames locally above `MAX_FRAMES_PER_WINDOW`. Reconnect path: one `session:resume` plus
    at most one kept frame per new connection; socket.io's reconnect delay (500 ms-3 s) bounds connects.
  - Low, fixed (9486297): tokens were returned from `create()`/`join()` although the service is their only user.
  - Checked, PASS: every inbound event and ack goes through the shared strict validators (`unknown` handlers), invalid
    data is dropped and reported as a source tag only; no `console`, storage or URL use; tokens only in a private
    field and the resume payload; no frame queueing beyond the single kept slot, nothing sent during the resume
    handshake; `resume` failing with `internal` ends the session (fail closed, as decided).
  - socket.io-client config: `io()` without URL (same origin, matches `connect-src 'self'`), `transports:
    ['websocket']`, `withCredentials` unset (default `false`, irrelevant for websocket), no `retries`/`ackTimeout`
    (no socket.io-level resend), connect timeout 10 s and ack timeout 8 s in the service.
  - Dependency: `socket.io-client@4.8.4` (`^4.8.4`, lockfile 4.8.4, same minor as server `socket.io@4.8.4`, shared
    `socket.io-parser@4.2.7` and `ws@8.21.3`); adds `engine.io-client@6.6.8` and `xmlhttprequest-ssl@2.1.2`
    (Node-only, not in the browser bundle), all MIT, no install scripts. `npm audit`: 0 vulnerabilities. Justified:
    it is the client half of the transport the server already uses; a hand-written engine.io client would be more
    risk, not less.
  - crypto-review: relay/web-platform items for this module PASS; key handling, encryption, receiving N/A (T04,
    T08/T09); negative tests present for malformed frames/peer/ended/acks, offline sends, ping-expired buffer, rate cap.
