# T04 — Crypto core

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | T03 | backlog | — |

## Goal
Framework-free TS module in `client/`: generate key, export/import as base64url (import non-extractable),
`seal(message, seq)` / `open(frame)` with AES-256-GCM, fresh IV per frame, AAD from T03, size-bucket padding.

## Acceptance (tests)
- Round-trip; two seals of the same text differ (fresh IV); IVs never repeat across 10k frames.
- Any flipped bit in `iv`, `ct`, `seq` or a different `sessionId` → rejected.
- Padding: lengths land on bucket boundaries; oversize input rejected.
- Wrong key → rejected, no partial plaintext.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
