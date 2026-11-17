# Architecture Decision Records

Short records of decisions that shape architecture or security. Format: context → decision → consequences.
Add one when a choice would surprise a new contributor. Number sequentially; never rewrite an accepted ADR — supersede it.

| # | Decision | Status |
|---|---|---|
| [0001](0001-key-in-url-fragment.md) | Key travels in the URL fragment | Accepted |
| [0002](0002-full-state-frames.md) | Send full text state, not diffs | Accepted |
| [0003](0003-express-socketio-relay.md) | Minimal Express + socket.io relay | Accepted |
| [0004](0004-session-ends-on-reload.md) | Keys are memory-only; reload ends the session | Accepted |
| [0005](0005-no-decoy-traffic.md) | Padding instead of decoy messages | Accepted |
| [0006](0006-csp-style-nonce.md) | Per-response style nonce instead of `'unsafe-inline'` | Accepted |
