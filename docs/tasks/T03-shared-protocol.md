# T03 — Shared protocol contract

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | T01 | backlog | — |

## Goal
`shared/`: event names, payload types, frame type `{ v, seq, iv, ct }`, plaintext message union
(`text | typing | beat`), limits (sizes, rates, timeouts), AAD builder, base64url helpers, padding bucket constants.
This is the contract that lets client and server lanes run in parallel — keep it small and documented.

## Acceptance
- Matches `docs/architecture.md` (update the doc if it changes).
- Unit tests for AAD format and base64url round-trips.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
