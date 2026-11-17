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
- Validators are strict: plain objects only, exact key sets (no extra keys, `__proto__`/`constructor` rejected),
  own data properties only, exact types and ranges. Handlers must also treat the ack argument as untrusted (it may be
  missing or not a function).

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

## Sending model
- **Full state, not diffs**: every `text` frame carries the whole text. Lost/dropped frames only delay;
  reconnect = resend latest. No merge logic.
- Debounce 300 ms after the last keystroke; max wait 1 s while typing continuously.
- `typing` frame at most once per second; `beat` every 5 s. Receiver marks the view stale after 15 s silence.

## Limits (server-enforced)
Max socket.io message 96 KiB (`MAX_MESSAGE_BYTES`, the `maxHttpBufferSize`; the largest legitimate frame is about
87.5 KB because a 64 KiB bucket grows by a third as base64url, see ADR 0007), max 20 frames/s per sender, session
idle TTL 15 min without any frame, absolute session lifetime 2 h, reconnect grace 20 s. Idleness by text activity
(warn at 9 min, cut at 10 min) is enforced by the sender's client, not the server.
