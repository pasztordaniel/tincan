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
- **`shared/`** — protocol types, event names, limits, frame (de)serialisation. No crypto, no I/O.
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
Socket events (names in `shared/`):

| Direction | Event | Payload |
|---|---|---|
| S→srv | `session:create` | — → `{ sessionId, senderToken }` |
| R→srv | `session:join` | `{ sessionId }` → `{ receiverToken }` \| error `not_found`/`full` |
| any→srv | `session:resume` | `{ sessionId, token }` |
| S→srv→R | `frame` | `{ v: 1, seq, iv, ct }` |
| srv→any | `peer` | `{ state: 'waiting' \| 'connected' \| 'reconnecting' \| 'gone' }` |
| srv→any | `session:ended` | `{ reason }` |

Frame encryption:
- `iv`: 96-bit random, fresh per frame. `ct`: AES-256-GCM ciphertext + 128-bit tag. Both base64url.
- **AAD** = `tincan/v1|<sessionId>|<seq>` — binds the frame to its session and position; the server can't
  move frames between sessions or renumber them without breaking the tag.
- Plaintext before padding: JSON `{ t: 'text' | 'typing' | 'beat', text?, ts }`.
- **Padding**: `[u32 length][utf-8 json][zero bytes]` up to the next bucket (256 B, 512 B, … max 64 KiB).
  All frame types share the bucket scheme, so the relay can't tell typing/heartbeat from content.
- Receiver accepts only `seq > lastSeq`; anything else is a replay and is dropped.

## Sending model
- **Full state, not diffs**: every `text` frame carries the whole text. Lost/dropped frames only delay;
  reconnect = resend latest. No merge logic.
- Debounce 300 ms after the last keystroke; max wait 1 s while typing continuously.
- `typing` frame at most once per second; `beat` every 5 s. Receiver marks the view stale after 15 s silence.

## Limits (server-enforced)
Max frame 70 KiB, max 20 frames/s per sender, session idle TTL 1 h, reconnect grace 20 s.
