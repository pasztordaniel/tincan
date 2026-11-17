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
  unit-testable without Angular.
- **`server/`** — Express serves the built client and security headers; socket.io relays frames. In-memory
  `SessionRegistry`; nothing persisted, ciphertext not logged.
- **`e2e/`** — Playwright drives two browser contexts (sender + receiver) against `npm start`.

## Session lifecycle
1. Sender page generates a 256-bit key (`crypto.getRandomValues`) and emits `session:create`.
   Server answers `{ sessionId, senderToken }` (both 128-bit random, base64url).
2. Link = `/r/<sessionId>#<base64url(key)>`. The sender token is never part of the link.
3. Receiver opens the link → **Open** button → reads the fragment, imports it as a non-extractable key,
   clears it with `history.replaceState`, emits `session:join`. The first join locks the session.
4. Sender emits `frame`s; server forwards them to the receiver socket only.
5. Disconnect → peer sees `reconnecting`; within the grace period the same tab may resume
   (`session:resume` with its token/receiver token). After the grace period, or on reload, the session ends.

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
  encode/decode lives in the client crypto module (T04): only browsers handle plaintext.
- Receiver accepts only `seq > lastSeq`; anything else is a replay and is dropped.

## Sending model
- **Full state, not diffs**: every `text` frame carries the whole text. Lost/dropped frames only delay;
  reconnect = resend latest. No merge logic.
- Debounce 300 ms after the last keystroke; max wait 1 s while typing continuously.
- `typing` frame at most once per second; `beat` every 5 s. Receiver marks the view stale after 15 s silence.

## Limits (server-enforced)
Max socket.io message 96 KiB (`MAX_MESSAGE_BYTES`, the `maxHttpBufferSize`; the largest legitimate frame is about
87.5 KB because a 64 KiB bucket grows by a third as base64url, see ADR 0007), max 20 frames/s per sender, session
idle TTL 1 h, reconnect grace 20 s.
