# Security model

## Assets
1. The plaintext the sender types.
2. The session key (256-bit AES-GCM), which is equivalent to the plaintext.
3. Integrity of what the receiver sees: it must be exactly what the sender sent, in order, and recent.

## Adversaries
| Adversary | Capabilities | In scope? |
|---|---|---|
| Network observer | Sees traffic between browsers and relay | Yes (TLS in deployment; ciphertext only regardless) |
| Honest-but-curious relay | Reads everything it handles, logs it | Yes — must learn nothing but metadata |
| Malicious relay | Modifies, drops, replays, reorders, injects, splices frames | Yes for integrity; see residual risk R-1 for code delivery |
| Holder of the session id only | Can connect sockets, guess events | Yes |
| Holder of the full link (leaked) | Has the key | Partially — see R-2 |
| Link scanner / previewer | Opens links automatically, may run JS | Yes (Open-click gate) |
| XSS / malicious dependency in the client | Runs code in the page | Mitigated (CSP, no HTML rendering, few deps), not eliminated |

## Controls
| Threat | Control | Where |
|---|---|---|
| Relay reads text | E2E AES-256-GCM in browser; key only in fragment + memory | `client` crypto |
| Key reaches server / logs / referrer | Fragment is never sent in HTTP; cleared via `history.replaceState`; `Referrer-Policy: no-referrer`; key imported non-extractable; never persisted | `client`, `server` headers |
| Ciphertext tampering | GCM tag check; failed frames dropped + UI warning, last good text kept | `client` |
| Replay / reorder | Monotonic `seq` in AAD; receiver accepts only `seq > lastSeq` | `shared`, `client` |
| Cross-session splicing | `sessionId` in AAD | `shared`, `client` |
| IV reuse | Fresh random 96-bit IV per frame (tested) | `client` |
| Withholding / freezing | Encrypted heartbeat with timestamp; stale indicator | `client` |
| Length / typing-rhythm leakage | Size-bucket padding; debounce; typing+heartbeat frames padded like content | `client` |
| Injection by id-holder | Only the socket authenticated with the sender token may publish; receiver socket is receive-only | `server` |
| Second receiver / scanner burns slot | Single receiver lock; receiver joins only after explicit **Open** click | `server`, `client` |
| XSS → key theft | Angular interpolation only, strict CSP (`default-src 'self'`, no inline script), no third-party scripts | `client`, `server` |
| Abuse / DoS | Frame size limit, rate limit, session TTL, bounded session count | `server` |
| Stale sessions | Session ends on reload/close; 20 s grace for network blips only | `server`, `client` |

## Residual risks (documented, accepted)
- **R-1 Code delivery.** The relay also serves the JavaScript. A malicious server can ship code that exfiltrates the
  key. Inherent to browser E2E crypto; mitigations would be a signed/installable client or subresource pinning.
- **R-2 Leaked link = leaked conversation.** Anyone with the full link can read; with a symmetric key they could
  also forge frames *if* they could publish (the sender token prevents that via the relay, not cryptographically).
  Future: ECDSA-signed frames (forgery) and ECDH + short authentication string or PAKE (no secret in the link,
  forward secrecy).
- **R-3 Metadata.** The relay sees who talks to whom, when, roughly how much (bucketed), and when the sender is
  active.
- **R-4 Endpoint compromise.** Malware, malicious extensions or screen capture on either device defeat everything.

## Review cadence
- Every PR touching `client/**/crypto*`, `shared/`, server event handlers or headers: `/security-review` +
  `crypto-review` skill by the `security-pentester` agent.
- Milestones and pre-release: `security-audit` skill (gitleaks, trivy, semgrep, checkov + agent lanes).
