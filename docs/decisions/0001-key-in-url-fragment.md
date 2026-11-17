# 0001 — Key travels in the URL fragment

**Context.** The receiver needs the key; the server must never have it. Options considered: key in fragment;
fragment + passphrase (PBKDF2); ephemeral ECDH + short authentication string; PAKE (CPace/SPAKE2).

**Decision.** A random 256-bit key in the fragment (`#…`), hardened: cleared from the address bar after reading,
`Referrer-Policy: no-referrer`, strict CSP, single receiver, explicit Open click, non-extractable `CryptoKey`.

**Consequences.** One-click UX, zero extra dependencies, everything in WebCrypto. A leaked link discloses the
session (R-2 in `docs/security.md`) and there is no forward secrecy. ECDH+SAS and PAKE are the documented upgrade path.
