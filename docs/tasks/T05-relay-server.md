# T05 — Relay server

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | T03 | in-review | `feat/T05-relay-server` |

## Goal
socket.io handlers: `session:create`, `session:join` (single receiver lock), `session:resume` (token, 20 s grace),
`frame` (sender-only, forwarded to receiver), `peer` status, `session:ended`. In-memory registry with idle TTL and a cap.
Frame size + rate limits. No payload logging.

## Acceptance (tests, socket.io client against a real server)
- Receiver-only socket cannot publish; id-only attacker cannot publish or join a full session.
- Second receiver gets `full`. Disconnect → peer `reconnecting` → resume within grace works, after grace `ended`.
- Oversized / too-frequent frames rejected.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- senior-dev (from T01 review): session IDs must be base64url (no dots), because the SPA fallback in
  `server/src/app.ts` treats any path with a file extension as a missing file and returns 404.
- senior-dev (from T01 review): warn or fail fast when the client build is missing; today the server then serves
  only `/healthz` and socket.io, without any message.
- T01 review: an engine.io handshake can come from an Origin-less cross-site no-cors GET, so never treat "a handshake happened" as proof of same origin; authorise with tokens. Optionally also reject `Sec-Fetch-Site: cross-site`. Consider a startup warning when `PORT` is invalid.
- senior-dev: claimed (stacked on `feat/T03-shared-protocol`, PR #10, until T03 merges).
- senior-dev: ready for review.
  - What: `server/src/relay/` = `relay.ts` (handlers, in-memory sessions, grace, TTL, lifetime cap, takeover),
    `options.ts` (timings and limits, defaults from `shared/`, injectable for tests), `tokens.ts` (ids, tokens,
    constant-time compare), `rate-limit.ts` (fixed-window counter). `app.ts` only gains `maxHttpBufferSize` and one
    `attachRelay` call, to keep the rebase with T06 small. `index.ts`: fail fast without a client build in production
    (warn in dev), warn on an invalid `PORT`, end all sessions with `shutdown` on SIGINT/SIGTERM.
  - Tests: `server/test/relay.spec.ts`, real socket.io clients against the real server on an ephemeral port (create,
    join, ordered relay incl. the 64 KiB bucket, busy, one session per socket, full incl. during grace, unauthorized
    receiver/stranger/ended, 12 malformed frame shapes incl. extra and `__proto__` keys, exact arity, missing or
    non-function ack, non-increasing seq, oversize, binary attachment, rate limit with an injected clock, flood
    disconnect, join probing, resume in grace for both roles, takeover, grace expiry, wrong token vs unknown session,
    explicit leave both ways, idle TTL, TTL kept alive by frames, lifetime cap under traffic, shutdown). Every test
    also asserts that nothing was written to the console. Timing uses injected short durations, not fake timers,
    because socket.io itself runs on timers. Mutation-checked the binary hook and the takeover disconnect.
    `E2E_PORT=3198 npm run verify` green.
  - Decisions:
    - Second join answers `full` per the T03 contract (`busy` is the session cap on create).
    - Events without a function ack are ignored, extra arguments answer `bad_request` ("no ack, no action": a create
      or join nobody can read the answer of would only burn a slot).
    - The rate limit counts every client event per socket, not only frames, so join/resume probing is bounded too;
      join/resume have no `rate_limited` code, so excess ones get no ack. Flood = 3x the limit in one window ->
      disconnect, session ends as `peer_left`.
    - Binary is refused at the engine (`conn.on('packet')`: binary data or socket.io packet type 5/6) before
      socket.io-parser reconstructs attachments, so no custom parser or new dependency is needed.
    - An oversize message closes the transport (ws `maxPayload`), which looks like any drop, so it gets the grace.
    - A takeover sends no `peer` change to the other party and no `session:ended` to the replaced socket; it is just
      disconnected (contract).
    - Server-side `seq` check: strictly increasing per session, kept across resume and takeover.
  - For the security reviewer: (1) resume path in `relay.ts` `onResume`: bound-socket and format checks run before
    and independent of any lookup; both `tokensEqual` calls always run; `ABSENT_TOKEN` is random per process.
    Map lookup timing still reveals session existence, which the 128-bit id already makes unguessable. (2) the
    engine-level binary hook and that `kick` runs before the decoder. (3) the rate limiter's fixed window allows a
    burst of 2x the limit across a window edge (acceptable for a DoS bound). (4) logging: only `relay: <event>
    handler failed (<ErrorClass>)`. (5) `allowRequest` still lets Origin-less clients in (T01 note); authorisation
    rests on tokens only, and no handler treats "connected" as proof of anything.
  - Open questions: (a) unbound sockets are never timed out (a client may connect before it creates/joins); a cap
    on connections per IP belongs at the reverse proxy, or add an unbound-socket timeout? (b) `MAX_SESSIONS` is
    server-local (10 000), not in `shared/`; fine as a deployment knob? (c) T07 must not let socket.io buffer
    frames while offline (`socket.volatile` or check `connected`), or a reconnect replays them as a burst.
- security-pentester: security review (`/security-review` method, attacked locally with socket.io-client, raw
  engine.io/WebSocket frames and a stalled TCP reader).
  - Verified holding: 128-bit ids and tokens from `randomBytes`, `timingSafeEqual` on fixed-length validated input,
    both compares always run against a per-process random stand-in, one `not_found` for every resume failure;
    20 concurrent joins give exactly one `ok`; two concurrent resumes with one token end with the later socket
    bound and the earlier one disconnected; a resume racing grace expiry either wins (session kept) or gets
    `not_found` (session gone), never both; `seq` stays strictly increasing across resume and takeover; receiver,
    unbound and ended sockets get `unauthorized`; `__proto__`/`constructor` payloads answer `bad_request` and pollute
    nothing; unknown event names, other namespaces and 10 000 extra arguments do nothing harmful; the namespace-level
    binary hook does run before socket.io's decoder (`packet` is emitted before `data`, and `kick` removes the
    decoder's listener synchronously); timers are cleared on every end path, per-socket state is in `WeakMap`s; logs
    carry no ids, tokens or payloads; `socket.io-client` 4.8.4 and its three transitive packages are `dev: true`
    in the lockfile with npm registry integrity hashes, nothing reaches the production tree.
  - Fixed (Medium): a receiver that stops reading its TCP socket made engine.io queue every forwarded frame until
    the ping timeout (measured: the write buffer grew by 19 packets of ~87 KB per second, ~75 MB per session over
    45 s, at the attacker's own upload cost). The relay now counts packets queued per socket and drops the
    receiver's connection at 40 (`maxReceiverBacklog`); that is an ordinary drop with grace and resume.
  - Fixed (Low): before a client joined the namespace, the binary hook was not attached yet, so a `BINARY_EVENT`
    header announcing 10 attachments made socket.io buffer up to ~1 MB per connection until `connectTimeout`
    (45 s). The hook now sits on every engine.io connection.
  - Implemented (maintainer decision): a socket with no successful create, join or resume is disconnected after
    10 s (`unboundTimeoutMs`), and socket.io's `connectTimeout` uses the same value.
  - Residual, deferred: connections per IP and the session cap (one attacker with ~10 000 connections can fill it,
    `busy` for everyone) need a per-IP limit at the reverse proxy; a socket stays connected after its session ends
    (per the decision only never-bound sockets time out). Verdict: approve with the fixes above.
- senior-dev: review. Correctness of create/join/resume/frame/disconnect, the takeover unbind-before-disconnect
  order and the end/grace timer handling is sound; tests are real-socket, mutation-checked and assert silent
  logs. Added tests for the three changes above (each fails without its fix). Nits, not blocking: the stalled
  receiver test reaches into the client's `ws._socket` because there is no public way to stall reads; the backlog
  counts all packets (pings, `peer`), which only makes the bound slightly stricter. Verdict: approve.
- qa-tester: QA PASS. Ran the production server on :3208 and 31 checks with a socket.io client (golden path with 5 ordered frames, `full`, `not_found`, `unauthorized`, replayed seq, drop and resume, 20 s grace expiry, explicit leave, 10 s unbound timeout, flood disconnect, 96 KiB oversize, headers, silent logs). Report: [`docs/testing/T05.md`](../testing/T05.md).
