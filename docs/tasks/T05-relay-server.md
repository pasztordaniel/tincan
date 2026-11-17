# T05 — Relay server

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T03 | backlog | — |

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
