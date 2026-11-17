# T15 — Stretch: ECDSA-signed frames

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | T04 (stretch) | backlog | — |

## Goal
Sender generates an ECDSA P-256 key pair; the public key goes into the link next to the AES key; every frame is signed.
A leaked link then allows reading but not forging, and the relay cannot forge either. ADR required.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
