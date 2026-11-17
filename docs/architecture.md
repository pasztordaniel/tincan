# Architecture

```
 Sender browser                        Relay (Node)                     Receiver browser
 ┌──────────────────────┐   socket.io  ┌─────────────────────┐ socket.io ┌──────────────────────┐
 │ Angular  SenderView  │ ───frame───▶ │ Express + socket.io │ ──frame─▶ │ Angular ReceiverView │
 │  CryptoService       │              │  SessionRegistry    │           │  CryptoService       │
 │  key: memory only    │ ◀──status─── │  (in-memory, TTL)   │ ◀─status─ │  key: from #fragment │
 └──────────────────────┘              └─────────────────────┘           └──────────────────────┘
          │ link: https://host/r/<sessionId>#<key>    (fragment is never sent to the server)
```

## Packages (npm workspaces)
- **`shared/`** — protocol types, event names, limits, strict runtime validators, base64url, AAD builder and
  padding-bucket choice. Pure TypeScript, no runtime dependencies, no crypto calls, no I/O.
- **`client/`** — Angular. `CryptoService` (WebCrypto), `RelayService` (socket.io client, connection state as
  signals), `SenderPage`, `ReceiverPage`. Crypto and transport are framework-free TS where possible, so they are
  unit-testable without Angular. The crypto module lives in `client/src/app/crypto/`: `key.ts` (generate, import,
  clear the fragment), `padding.ts` (bucket padding), `frame-crypto.ts` (`sealFrame`/`openFrame`, `FrameSealer`/
  `FrameOpener`) and `crypto.service.ts` (thin injectable over them). Every function returns a typed result
  (`{ ok: true, ... } | { ok: false, error }`) and never throws or logs.
- **`server/`** — Express serves the built client and security headers; socket.io relays frames. In-memory
  `SessionRegistry`; nothing persisted, ciphertext not logged.
- **`e2e/`** — Playwright drives two browser contexts (sender + receiver) against `npm start`.

## Session lifecycle
1. Sender page generates a 256-bit key (`crypto.getRandomValues`), encodes it once for the link and imports it as a
   non-extractable `CryptoKey` (no extractable key object ever exists), then emits `session:create`.
   Server answers `{ sessionId, senderToken }` (both 128-bit random, base64url).
2. Link = `/r/<sessionId>#<base64url(key)>`. The sender token is never part of the link.
3. Receiver opens the link → **Open** button → reads the fragment, clears it with `history.replaceState` (before
   validating, so a malformed key is cleared too), imports it as a non-extractable key (strict `isKeyString`),
   emits `session:join`. The first join locks the session.
4. Sender emits `frame`s; server forwards them to the receiver socket only.
5. Disconnect → peer sees `reconnecting`; within the grace period the same tab may resume
   (`session:resume` with its token/receiver token). After the grace period, or on reload, the session ends.
   A valid resume also replaces a socket the server still considers attached to that slot (network switch): the
   new socket takes the slot and the server disconnects the old one, without a grace period or `peer` change.
6. Idleness: the sender's client measures time since the last text change (or "keep line open" action). At
   `IDLE_WARNING_MS` (9 min) it warns that the line will be cut; at `IDLE_CUT_MS` (10 min) it ends the session
   itself (local reason `idle`, explicit leave, so the receiver sees `peer_left`). The server only has backstops:
   `SESSION_IDLE_TTL_MS` (15 min without any frame) and `MAX_SESSION_LIFETIME_MS` (2 h after create), both ending
   with `idle`. The relay cannot tell text from beats and must not be able to, so it cannot enforce idleness itself.

Reload and close: `client/src/app/lifecycle/page-lifecycle.ts` listens for `pagehide` (not `beforeunload`, which is
unreliable and blocks bfcache, and not `visibilitychange`, so switching tabs on a phone never ends the line). It ends
the sender session and calls `RelayService.leave()`, an explicit socket disconnect that socket.io writes to the open
WebSocket synchronously, so the peer sees `peer_left` at once instead of after the 20 s grace. A page restored from
bfcache (`pageshow` with `persisted`) is ended again: its key and token are gone, so it shows the ended state.
The component-scoped `ReceiverSession` registers through `PageLifecycle.onHide()` and drops its key, text and timers
too: a restored receiver page says "Link already used", like a reload.
Cut the line: both views have a button (inline two-step confirm, `ui/cut-line/cut-line.ts`) that ends the session on
purpose. The sender goes through the idle-cut path (`SenderSession.cutLine()`: key, link and timers dropped, explicit
`leave()`), the receiver through the `pagehide` cleanup (`ReceiverSession.cutLine()`). While connected the peer sees
`peer_left` at once; while this side is reconnecting or offline the explicit disconnect cannot be delivered, so the cut
is local at once and the peer learns of it (`peer_timeout`) when the 20 s grace runs out. The side that cut says "You cut the line" and, like every ended state, keeps the last text readable.
Going home (T19): every page but home has a home link in the app shell (`nav/home-link.ts`). Leaving a view ends its
line through the same teardown as before: `SenderPage.ngOnDestroy` calls `SenderSession.end()` and the page-scoped
`ReceiverSession` runs `cleanup()` from its `ngOnDestroy`, each with one explicit `leave()`, so the peer sees the cut.
While the line is open (sender: waiting, connected, idle, reconnecting; receiver: after Pick up until ended) the
`confirmLeave` `canDeactivate` guard (`nav/leave-confirm.ts`) holds any in-app navigation until the user answers
"Leave and cut the line?"; otherwise it lets the navigation through at once. The question belongs to that one
navigation: if a newer navigation supersedes it (a hash change, Back), the question is withdrawn. While it is up the
held navigation keeps `ApplicationRef` unstable. Browser Back/Forward (`popstate`) is
not held and ends the line like closing the tab. After leaving, Back cannot restore anything: `/s` redirects home
(no session), and `/r/<id>` has no fragment left, so it says the link was used.
Network blips (WebSocket closed, relay unreachable) are the other path: both sides show "Line is slack,
reconnecting...", the client resumes with its token through socket.io's reconnection (500 ms to 3 s backoff, so no
extra reaction to the browser's `online` event is needed), and the sender resends its latest text.

Sender view: `client/src/app/sender/sender-session.ts` owns the sender's key, sealer and timers; components only
bind signals. Text goes out as full-state frames, debounced 300 ms with a 1 s max wait (`keepLatest`, so only the
newest state is kept across a resume), `typing` at most 1/s, `beat` every 5 s while connected. A receiver that joins
gets the current text immediately.

## Wire protocol (v1)
`shared/` is the authoritative contract: event names (`EVENTS`), payload and ack types, the socket.io event maps
(`ClientToServerEvents`, `ServerToClientEvents`), limits and strict runtime validators. Both sides validate every
inbound payload with those validators (the server distrusts sockets, the client distrusts the relay).

| Direction | Event | Payload | Ack |
|---|---|---|---|
| S→srv | `session:create` | — | `{ ok: true, sessionId, senderToken }` \| error `rate_limited`/`busy`/`internal` |
| R→srv | `session:join` | `{ sessionId }` | `{ ok: true, receiverToken }` \| error `bad_request`/`not_found`/`full`/`internal` |
| any→srv | `session:resume` | `{ sessionId, token }` | `{ ok: true }` \| error `bad_request`/`not_found`/`internal` |
| S→srv | `frame` | `{ v: 1, seq, iv, ct }` | `{ ok: true }` \| error `bad_request`/`unauthorized`/`rate_limited`/`internal` |
| srv→R | `frame` | `{ v: 1, seq, iv, ct }` | — |
| srv→any | `peer` | `{ state: 'waiting' \| 'connected' \| 'reconnecting' \| 'gone' }` | — |
| srv→any | `session:ended` | `{ reason: 'peer_left' \| 'peer_timeout' \| 'idle' \| 'shutdown' }` | — |

Rules:
- Error acks are `{ ok: false, error }`; the full code union is `ErrorCode` in `shared/`. Resume answers `not_found`
  for an unknown session, a wrong token and an expired grace period alike, so it reveals nothing about tokens.
- A resume with a valid token for a slot whose socket is still attached replaces that socket (the old one is
  disconnected by the server). This is the contract T05 implements.
- After a successful create, join or resume the server emits `peer` with the other party's current state, so acks
  carry no peer state. A `frame` ack means "accepted by the relay", not "delivered".
- A tab that leaves on purpose (close, reload) calls `socket.disconnect()`; the server sees
  `client namespace disconnect`, sends `peer: gone` and `session:ended { reason: 'peer_left' }` to the other party
  at once. Any other disconnect starts the reconnect grace (`peer: reconnecting`).
- Heartbeat: the relay sets socket.io's `pingInterval` to 10 s and `pingTimeout` to 5 s (defaults 25 s + 20 s), so a
  half-open connection (network lost, socket not closed) is cut within 15 s on both ends and the grace starts then.
  The receiver already turns stale after 15 s without a beat; this bounds how long the sender sees a vanished
  receiver as connected. Pings cost a few bytes next to the 5 s beat, and the client answers them from its message
  handler, so background timer throttling does not cause false timeouts.
- Validators are strict: plain objects only, exact key sets (no extra keys, `__proto__`/`constructor` rejected),
  own data properties only, exact types and ranges. Handlers must also treat the ack argument as untrusted (it may be
  missing or not a function).

Relay behaviour (`server/src/relay/`, T05) beyond the table:
- An event whose last argument is not a function is ignored entirely (nobody would learn the result); payload arity
  is exact, so extra arguments answer `bad_request`. `session:create` takes no payload.
- One session slot per socket: `session:create` on a bound socket answers `rate_limited`, `session:join` and
  `session:resume` on a bound socket answer `bad_request`. `busy` means the server's session cap (default 10 000).
- `frame` checks the sender first (`unauthorized`), then `isFrame` and a strictly increasing `seq` per session
  (`bad_request`). The relay forwards a fresh `{ v, seq, iv, ct }` object and never decrypts.
- Resume compares the token with both slot tokens in constant time, against a random stand-in when the session or the
  receiver slot does not exist, and answers `not_found` for every failure.
- Rate limit: every client event counts, 20 per 1 s window per socket. Above it a `frame` gets `rate_limited` and
  other events are dropped without an ack; at 60 events in one window the socket is disconnected and its session ends
  as an explicit leave (`peer_left`). Clients must not buffer frames while offline (socket.io's default send buffer
  would replay them as a burst).
- socket.io binary packets (types 5 and 6) and binary engine.io messages close the connection before they are decoded,
  also before the client has joined the namespace (a bound socket's session ends as `peer_left`). A message above `MAX_MESSAGE_BYTES` closes the transport, which the relay
  treats as a drop (grace).
- Slow receiver: when 40 packets are queued for a receiver that is not reading, the next frame drops the receiver's
  connection instead of being buffered (a drop: grace, `peer: reconnecting` to the sender; after a resume the sender
  resends its full state).
- Disconnect reasons: `client namespace disconnect` ends the session at once (`peer_left`); every other reason starts
  the grace (`peer: reconnecting` to the other party). A socket replaced by a takeover is unbound before the server
  disconnects it, so its disconnect changes nothing.
- A socket with no successful create, join or resume within 10 s of connecting is disconnected (`io server
  disconnect`); failed attempts do not count. Once bound, sockets stay connected after `session:ended`, unbound. On SIGINT/SIGTERM every session ends with `shutdown`.

Identifiers and encodings (all canonical unpadded base64url, `[A-Za-z0-9_-]`, never `.`):

| Value | Size | Encoded length |
|---|---|---|
| `sessionId` | 128 bit random | 22 |
| `senderToken`, `receiverToken` | 128 bit random | 22 |
| key (link fragment) | 256 bit | 43 |
| `iv` | 96 bit, fresh per frame | 16 |
| `ct` | padded plaintext (one bucket) + 128-bit GCM tag | 363 to 87 403, only the 9 bucket sizes |

`seq` is an integer from 1 to `Number.MAX_SAFE_INTEGER`; the sender starts at 1, the receiver at `lastSeq = 0`.

Frame encryption:
- `ct`: AES-256-GCM ciphertext + 128-bit tag. Its decoded length must be exactly a padding bucket + 16 bytes;
  anything else is rejected by `isFrame` before any crypto work, on the server and on the client.
- **AAD** = `tincan/v1|<sessionId>|<seq>` (`buildAad`, `seq` in plain decimal) — binds the frame to its session and
  position; the server can't move frames between sessions or renumber them without breaking the tag. Both fields are
  validated, so `|` can never appear inside one.
- Plaintext before padding: JSON `{ t: 'text', text, ts }`, `{ t: 'typing', ts }` or `{ t: 'beat', ts }`
  (`isPlaintextMessage`; `text` only on `text`, at most 10 000 UTF-16 units; `ts` integer ms since epoch).
- **Padding**: `[u32 big-endian length][utf-8 json][zero bytes]` up to the next bucket (256 B, 512 B, … max 64 KiB;
  `paddingBucket`). All frame types share the bucket scheme, so the relay can't tell typing/heartbeat from content.
  Any valid text message fits the largest bucket (worst case 6 bytes per UTF-16 unit as JSON). Padding
  encode/decode lives in the client crypto module (`client/src/app/crypto/padding.ts`): only browsers handle
  plaintext. The JSON is always `JSON.stringify` output. Decoding is canonical: the bucket must be the smallest that
  fits the length header, every padding byte must be zero, the UTF-8 must be valid (fatal decoder, BOM rejected)
  and the JSON must pass `isPlaintextMessage`.
- Receiver accepts only `seq > lastSeq`; anything else is a replay and is dropped. Gaps are fine (a dropped frame
  only delays; full-state frames). `lastSeq` advances only after a frame passes every check.
- Open order: shape (`isFrame`) → `seq > lastSeq` → GCM tag → padding → message. Errors: `malformed_frame`,
  `replay`, `auth_failed`, `bad_padding`, `bad_message` (integrity errors, surfaced in the UI) and `invalid_session`,
  `crypto_failure` (local faults). `FrameSealer` and `FrameOpener` process one frame at a time, so async WebCrypto
  cannot reorder frames on the sender or let two concurrent arrivals both pass the replay check on the receiver.

## Client relay service
`RelayService` (`client/src/app/relay/`) is transport only. It validates every inbound payload and ack with the
shared validators (invalid data is dropped and surfaced as a protocol error, never trusted), exposes
`status` (`connecting | connected | reconnecting | offline | ended`), `peer` and `ended` as signals plus observables,
and keeps tokens in memory only. It never lets socket.io buffer: frames sent while not connected are dropped, or
with `keepLatest` only the newest is sent after a successful `session:resume` (full-state frames make this
correct and keep a reconnect from hitting the server's rate limit). It also counts its own emits per connection
and refuses a frame locally (`rate_limited`) before the relay's limit is reached. Resume runs on every socket.io
reconnect within `RECONNECT_GRACE_MS`; a failed resume or an expired grace ends the session. `create()` and
`join()` return no tokens: only the service uses them, for `session:resume`.

## Sending model
- **Full state, not diffs**: every `text` frame carries the whole text. Lost/dropped frames only delay;
  reconnect = resend latest. No merge logic.
- Debounce 300 ms after the last keystroke; max wait 1 s while typing continuously.
- `typing` frame at most once per second; `beat` every 5 s. Receiver marks the view stale after 15 s silence.

## Limits (server-enforced)
Max socket.io message 96 KiB (`MAX_MESSAGE_BYTES`, the `maxHttpBufferSize`; the largest legitimate frame is about
87.5 KB because a 64 KiB bucket grows by a third as base64url, see ADR 0007), max 20 events/s per socket (frames above it are rejected, a flood of 60 in one window disconnects), at most
10 000 sessions, session
idle TTL 15 min without any frame, absolute session lifetime 2 h, reconnect grace 20 s. Idleness by text activity
(warn at 9 min, cut at 10 min) is enforced by the sender's client, not the server.
