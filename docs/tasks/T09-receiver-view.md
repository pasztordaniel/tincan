# T09 — Receiver view

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T04, T07, T11 (visuals) | backlog | — |

## Goal
`/r/:id` shows an **Open** gate → reads + clears fragment → joins → decrypts frames → shows text via interpolation.
States: waiting for sender, live, typing…, stale (no frame for 15 s), integrity warning (keep last good text), ended,
invalid link.

## Acceptance
- Fragment removed from the URL after Open. Replayed/tampered frame → warning, text unchanged.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
