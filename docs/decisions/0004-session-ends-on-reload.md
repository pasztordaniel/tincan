# 0004 — Keys are memory-only; reload ends the session

**Context.** If the sender reloads, the key is gone unless stored (e.g. `sessionStorage`). The receiver's fragment is
cleared after reading, so the same applies to them.

**Decision.** Keys are never persisted. A network drop gets a 20 s grace period in which the same tab can resume
(token kept in memory). A reload/close ends the session; the peer is told and the sender's input is disabled.

**Consequences.** Smaller exposure (no key at rest, nothing to clean up); explicit, symmetric rules for both sides.
Accidental reloads cost a new link.
