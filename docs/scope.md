# Scope

## Product in one sentence
A sender opens tincan, gets a link, and whatever they type appears live on exactly one receiver's
screen — encrypted end to end, with the server unable to read or forge it.

## Must have
| # | Requirement | Acceptance |
|---|---|---|
| R1 | Sender creates a session and gets a unique share link | Link opens the receiver view of that session only |
| R2 | Text is encrypted in the sender's browser, decrypted in the receiver's | Server and network only ever see ciphertext; key never leaves the browsers (URL fragment + memory) |
| R3 | Live updates without manual refresh | Receiver shows the latest text within ~0.5 s of the sender pausing typing |
| R4 | Tampered ciphertext is never shown as valid plaintext | Modified, replayed, reordered or cross-session frames are rejected and the UI says so |
| R5 | One sender, one receiver per session | A second receiver is refused; only the sender can publish |
| R6 | Clear connection and session states | Both sides see: waiting, live, peer reconnecting, session ended |
| R7 | Automated tests | Sender→receiver flow with ≥2 consecutive updates; security-sensitive and async behaviour |
| R8 | Docs | README: architecture, security assumptions, tests, limitations, AI usage |

## Should have (planned, cheap, security-relevant)
- Length hiding: padding plaintext to size buckets.
- Debounced sends; encrypted, throttled "typing…" indicator (indistinguishable from content for the server).
- Encrypted heartbeat + "last update N s ago" / stale warning (detects a relay withholding frames).
- Receiver must click **Open** before joining (link scanners/previewers can't burn the single receiver slot).
- Session ends when either side reloads/closes (key is memory-only); short grace period for network blips.

## Could have (stretch)
- ECDSA-signed frames so a leaked link lets you read but not forge (see ADR backlog in `docs/security.md`).

## Out of scope
Accounts, persistence, file transfer, multiple receivers, message history, mobile apps, key exchange (ECDH/PAKE —
documented as future work).
