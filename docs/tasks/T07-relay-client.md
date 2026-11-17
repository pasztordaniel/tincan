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
