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
| Key reaches server / logs / referrer | Fragment is never sent in HTTP; cleared via `history.replaceState` before it is even validated, on every `/r` path (a mangled link is cleared too, never redirected with its fragment); `Referrer-Policy: no-referrer`; key imported non-extractable on both sides (the sender never holds an extractable `CryptoKey`), raw bytes zeroed after import; never persisted; crypto code never logs and its errors carry codes only | `client`, `server` headers |
| Ciphertext tampering | GCM tag check; then canonical padding (smallest bucket, zero bytes) and strict message validation; every failure is a typed integrity error, never a raw exception; failed frames dropped + UI warning, last good text kept | `client` |
| Replay / reorder | Monotonic `seq` in AAD; receiver accepts only `seq > lastSeq`, checked before decryption and advanced only after a fully valid frame; frames are opened one at a time so concurrent arrivals cannot race the check | `shared`, `client` |
| Cross-session splicing | `sessionId` in AAD | `shared`, `client` |
| IV reuse | Fresh random 96-bit IV per frame (tested) | `client` |
| Withholding / freezing | Encrypted heartbeat every 5 s; the receiver judges freshness by the encrypted sender timestamp (relative to the smallest `arrival - ts` seen, which absorbs clock skew), not by arrival, so frames the relay holds back and replays at the usual pace still turn the view stale after 15 s. A delay present from the first frame on is indistinguishable from skew | `client/src/app/receiver` |
| Length / typing-rhythm leakage | Size-bucket padding; debounce; typing+heartbeat frames padded like content | `client` |
| Injection by id-holder | Only the socket authenticated with the sender token may publish; receiver socket is receive-only | `server` |
| Second receiver / scanner burns slot | Single receiver lock; receiver joins only after explicit **Open** click | `server`, `client` |
| XSS → key theft | Angular interpolation only; strict CSP (`default-src 'none'`, `script-src 'self'`, style nonce per response, no `'unsafe-inline'`, Trusted Types required, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'none'`); no third-party scripts ([ADR 0006](decisions/0006-csp-style-nonce.md)) | `client`, `server/src/headers.ts` |
| Clickjacking, MIME sniffing, cross-origin leaks | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy` denying camera, microphone, geolocation and more; no `X-Powered-By` | `server/src/headers.ts` |
| Stale or cached shell / downgrade | `Cache-Control: no-store` on everything except hashed assets (immutable); `Strict-Transport-Security` (1 year, includeSubDomains) only on requests seen as HTTPS (TLS or `X-Forwarded-Proto: https`; forging it over HTTP is harmless, browsers ignore HSTS there) | `server` |
| Dotfile / source disclosure | Any path with a dot-segment (`/.env`, `/.git/...`, also percent-encoded) answers 404; never served and never answered with the SPA | `server` |
| Abuse / DoS | Message size limit (`maxHttpBufferSize`), 20 events/s per socket with disconnect on a flood, binary packets refused before decoding, a receiver that stops reading is dropped (grace) once 40 packets queue for it instead of the relay buffering frames without bound, session TTL (15 min without frames), 2 h absolute session lifetime, session cap (`busy`), one session per socket, a socket that has not created, joined or resumed within 10 s is disconnected (also socket.io's `connectTimeout` for a connection that never joins the namespace) | `server` |
| Relay forwarding junk | Every handler argument untrusted: strict validators, exact arity, ack must be a function; `isFrame` and strictly increasing `seq` before forwarding a freshly built frame object | `server` |
| Relay logs leak metadata | The relay logs no ids, tokens, payloads or per-event lines; only an error class when a handler throws | `server` |
| Stale sessions | Session ends on reload/close (`pagehide` leaves explicitly, the peer is told at once); 20 s grace for network blips only | `server`, `client` |
| Forgotten open line | Sender's client warns after 9 min without a text change and cuts the session at 10 min (explicit leave); the relay never learns text-vs-beat, so it only enforces the frame TTL and the lifetime cap | `client`, `server` |
| Malformed or hostile relay messages | Client validates every relay event and ack with the strict shared validators; invalid data is dropped and counted, never logged or trusted; tokens stay in `RelayService` memory (not in outcomes, signals, storage or logs) | `shared`, `client/src/app/relay` |
| Client gets its own session cut | No offline buffering (socket.io's send buffer is emptied on disconnect, nothing is emitted while disconnected, only one kept frame after a resume); local cap below the relay's per-connection rate limit | `client/src/app/relay` |
| Orphaned or crossed sender session | The sender's key is generated non-extractable, its string exists only in the in-memory link (never in the sender's URL, title, history, storage, console or any request; checked in e2e); a `start()` cancelled mid-create leaves the session it got; home ends a session it still owns when the dialog closes or the page goes away (a modified Join click does not hand it over); a frame sealed for a session that ended is never sent; bounded traffic (text 300 ms debounce / 1 s max wait, typing 1/s, beat 5 s) stays far below the relay rate limit | `client/src/app/sender`, `client/src/app/home` |
| Hijacked slot on resume | Resume needs the slot's 128-bit token, compared in constant time against both slots (a random stand-in when a slot or session is absent); a valid resume replaces a still-attached socket (network switch), every failure is one `not_found` | `server` |

### Deployment notes
- **Reverse proxy must preserve `Host`** (nginx: `proxy_set_header Host $host;`). The socket.io origin check compares
  the browser's `Origin` host:port with `Host` (scheme is not compared), so a rewritten `Host` makes every handshake 403.
- Terminate TLS at the proxy and send `X-Forwarded-Proto: https` so HSTS is emitted; also forward WebSocket upgrades.

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
- **R-5 The link outlives the page.** Clearing the fragment hides the key from the address bar and the session
  history entry only. The receiver's browser still records the link as opened, key included, in its global history
  (and in history sync, if enabled), and the sender's link exists wherever it was pasted. JS strings (the key
  string, decrypted text) cannot be zeroed. A session ends on reload or close, so an old link only reads frames if
  that session is still live and its receiver slot is free.

## Review cadence
- Every PR touching `client/**/crypto*`, `shared/`, server event handlers or headers: `/security-review` +
  `crypto-review` skill by the `security-pentester` agent.
- Milestones and pre-release: `security-audit` skill (gitleaks, trivy, semgrep, checkov + agent lanes).
