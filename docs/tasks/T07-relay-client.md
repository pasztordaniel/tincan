# T07 — Client relay service

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T03 | backlog | — |

## Goal
`RelayService` wrapping socket.io-client: typed emit/ack helpers, connection state as a signal
(`connecting | connected | reconnecting | ended`), resume with token on reconnect, no frame logging.

## Acceptance
- Unit tests with a fake socket for state transitions and resume.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
