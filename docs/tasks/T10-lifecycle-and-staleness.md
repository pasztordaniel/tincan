# T10 — Disconnect, resume and staleness

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T05, T08, T09 | backlog | — |

## Goal
End-to-end handling of network blips (grace + resume, resend latest text) vs. reload/close (session ends, peer notified),
plus heartbeat-driven stale indicator.

## Acceptance
- Covered by e2e: offline/online on either side resumes; reload ends the session for both.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
