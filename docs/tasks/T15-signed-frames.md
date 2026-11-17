# T15 — Stretch: ECDSA-signed frames

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | T04 (stretch) | won't do (see [ADR 0009](../decisions/0009-signed-frames.md)) | `feat/T15-signed-frames` |

## Goal
Sender generates an ECDSA P-256 key pair; the public key goes into the link next to the AES key; every frame is signed.
A leaked link then allows reading but not forging, and the relay cannot forge either. ADR required.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- senior-dev: claimed (in-progress), branch `feat/T15-signed-frames` from main `b367ba2`.
- senior-dev: threat analysis first ([ADR 0009](../decisions/0009-signed-frames.md)). The relay already cannot forge
  (no AES key; session and seq in the AAD; `seq > lastSeq`). A leaked-link holder cannot publish: frames are
  forwarded only from the sender slot, bound by a 128-bit token that is never in the link (server role check is
  unit-tested). Signatures would only stop a leaked link *plus* a malicious relay, and that relay serves the client
  code (R-1), so it can read both keys anyway. Costs: +88 link characters (about 90 -> 180), QR from about version 6
  to 9-10 (module about 4 px -> 3 px at 200 px), a second sender secret, protocol v2, new validators and failure
  class. Decision: won't do; ECDH + SAS / PAKE remains the real upgrade for R-2. `docs/security.md` R-2 updated.
  No code changed, so no crypto-review run is needed; revisit conditions are in the ADR.
