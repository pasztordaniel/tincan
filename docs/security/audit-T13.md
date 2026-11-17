# Security audit T13 (final pass)

- **Date:** 2026-11-17
- **Base:** `main` at b367ba2 (T18 QR code and T17 merged), branch `fix/T13-security-pass`
- **Role:** security-pentester, `security-audit` and `crypto-review` skills
- **Result:** no Critical or High findings. Two Medium and two Low findings fixed with tests; one Medium accepted as
  a deployment-level residual risk (R-6); the rest are informational.

## Scope
- Whole repository: `shared/`, `client/`, `server/`, `e2e/`, `.github/`, agent and skill configuration.
- The production build served by one Node process (`npm run build`, then `PORT=3240 npm run serve -w @tincan/server`),
  probed live on localhost only.
- Out of scope: hosting, TLS and reverse-proxy configuration (none in the repo; see the deployment notes in
  [`docs/security.md`](../security.md)), browser and OS security, work on other open branches (T14, T15, T19).

## Method and tools
| Step | Tool / version | Notes |
|---|---|---|
| Secrets, working tree | gitleaks v8.30.1 (Docker, `--network none`) | 2 hits, both false positives (prose in task files) |
| Secrets, history (43 commits) | gitleaks v8.30.1 `dir` mode over an exported `log -p --all` patch | Same 2 false positives; no other hit |
| Dependency CVEs | trivy 0.76.1 (offline DB 2026-11-17), `npm audit` (npm 11.19.1, Node 24.22.3) | 0 vulnerabilities, full tree and `--omit=dev` |
| SAST | semgrep 1.181.0 (auto rules, offline cache) | 2 Medium: dependabot without cooldown (fixed) |
| CI / IaC | checkov 3.3.29 (`github_actions`) | 44 passed, 0 failed; actions pinned by SHA, `contents: read`, `persist-credentials: false` |
| Supply chain review | lockfile inspection | Every package resolves from registry.npmjs.org (plus the local workspaces); install scripts only in build/dev tools (esbuild, @parcel/watcher, lmdb, msgpackr-extract, fsevents) |
| Hygiene | grep for hidden / bidi Unicode, agent and editor config | None found; no `.mcp.json`, no project `settings*.json` with hooks |
| Headers / CSP | node `http` probe script against :3240 | Every route, incl. socket.io responses and errors |
| Relay abuse | raw socket.io v4 wire client (37 checks) | Hijack, token reuse, replay, flood, size, binary, origin, session cap |
| Browser | Playwright (Chromium, from `e2e/`) | Fragment handling on 12 path shapes, live sender/receiver flow, XSS payload, key exposure, history |
| Crypto | `crypto-review` checklist, manual reading of `shared/src` and `client/src/app/crypto` | All items pass (below) |

## Findings
| ID | Severity | Status | Finding | Evidence | Fix |
|---|---|---|---|---|---|
| T13-1 | Medium | Accepted (R-6) | One client can fill the global session table. There is no per-address limit on connections or sessions, so a script can hold sessions until `create` answers `busy` for everyone. Availability only. | Live probe: one client held 300 of 300 sessions; `MAX_SESSIONS` 10 000, 15 min idle TTL | Deployment note: per-address `limit_conn` / `limit_req` at the reverse proxy. Doing it in the relay needs a trusted-proxy setting for `X-Forwarded-For` (decision below). |
| T13-2 | Medium | Fixed | The server accepted the long-polling transport, which the client never uses. A polling handshake is a plain GET that cross-site pages can send without an `Origin` header (image, no-cors fetch), so each one opened an engine.io session the origin check could not see. | `GET /socket.io/?EIO=4&transport=polling` without Origin answered 200 with a `sid` | `fix(server): accept WebSocket handshakes only`: `transports: ['websocket']`; tests use raw WebSocket upgrades for the origin check and assert polling opens nothing |
| T13-3 | Low | Fixed | A key in a link mangled outside `/r` stayed in the address bar and the session-history entry: `/R/<id>#k`, `/rr/<id>#k`, `/r%2F<id>#k`, `/#k`, `/x#k`, `/design#k`, `/index.html#k`. No request carried it, but it remained visible and came back on Back. | Playwright: `page.url()` still ended in `#<key>` after the `**` redirect on 7 of 12 path shapes | `fix(client): drop a key fragment that arrives outside /r`: an app initializer clears the fragment before the first navigation unless the path is a literal `/r` path; unit test over the path shapes, e2e test on the production build |
| T13-4 | Low | Fixed | Dependabot had no cooldown, so a freshly published (possibly malicious) version could be proposed the same day. | semgrep `dependabot-missing-cooldown` at `.github/dependabot.yml` lines 3 and 14 | `fix(ci): add a seven-day cooldown to dependabot updates` |
| T13-5 | Low | Accepted (part of R-6) | A socket whose session ended stays connected and the unbound timer is not re-armed; it can idle until the client closes it. It holds no session and can only create a new one under the normal limits. | Live probe `endedSocketLingers` | None; covered by the proxy connection limit |
| T13-6 | Info | Accepted (documented) | A non-browser client without `Origin` passes the origin check. Only browsers are the threat the check addresses; authorization is by 128-bit tokens. | Live probe: no-Origin WebSocket accepted | Comment in `isAllowedOrigin` updated |
| T13-7 | Info | Not a security issue | Hashed lazy chunks (`chunk-<mixed case>.js`) do not match the immutable-asset pattern and are served `no-store`. Only a cache-efficiency cost. | Header probe on built chunks | None |
| T13-8 | Info | Accepted (R-5) | The copied link, key included, stays on the clipboard and in the receiver's global browser history. | Code reading (`link-card`, receiver page) | Already documented |

## Verified controls (no finding)
- **Headers**, on every route including 404s, socket.io responses and engine.io errors: CSP
  `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-…'; img-src 'self' data:; font-src 'self';
  connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none';
  require-trusted-types-for 'script'; trusted-types angular angular#bundler`, a fresh nonce on every spelling of the
  index; `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `nosniff`, COOP and CORP `same-origin`,
  `Permissions-Policy`, `Cache-Control: no-store`, no `X-Powered-By`; HSTS only with `X-Forwarded-Proto: https`.
- **Paths:** dotfiles, `.git`, percent-encoded and double-encoded traversal answer 404; POST, PUT, DELETE, OPTIONS
  and TRACE answer 404 without CORS headers; a CRLF in the path is not reflected into headers.
- **Slot hijack and token reuse:** a second receiver gets `full`; receiver and unbound sockets get `unauthorized` on
  publish; a wrong token or another session's token gets `not_found`; a valid resume replaces the old socket; after
  the session ends, both tokens and the id get `not_found`.
- **Replay, reorder, malformed frames:** equal or lower `seq`, `seq` of 2^53, off-bucket ciphertext, extra keys,
  `__proto__`, and extra arguments all answer `bad_request`; forwarded frames carry exactly `v, seq, iv, ct`.
- **Flooding and size:** 70 frames at once disconnect the sender (the receiver gets `peer_left` and at most 19
  frames); a 100 KiB message closes the transport with 1009 before parsing; binary packets are kicked, also before
  the namespace join; an unbound socket is cut after 10 s; a bound socket cannot create, join or resume again.
- **Origin:** cross-site and `null` origins are refused for WebSocket upgrades (and now there is no polling path).
- **Fragment leakage:** no request, WebSocket frame, console message or storage entry contained the key on either side
  during a full live session; `document.referrer` is empty; the receiver's URL has no fragment after load, and Back
  then Forward shows "Link already used" without the key.
- **XSS:** `<img onerror>`, `<script>` and an Angular template expression sent as text render literally on the
  receiver; no element is created and nothing executes; no CSP violation.
- **QR, Cut the line, pagehide:** reviewed in code and covered by the existing e2e suites (`qr-code`, `cut-the-line`,
  `lifecycle` incl. bfcache); in the live run the sender showed "Line cut" right after the receiver navigated away.

## Crypto-review checklist
| Item | Result |
|---|---|
| 256-bit key from WebCrypto, non-extractable on both sides | Pass (`client/src/app/crypto/key.ts`) |
| Key only in fragment and memory; never in path, query, payloads, logs, storage, errors | Pass (code, and the live probe above) |
| Fragment cleared with `replaceState` before validation | Pass, now also outside `/r` (T13-3) |
| AES-GCM, fresh random 96-bit IV per frame | Pass (`frame-crypto.ts`, tested) |
| AAD `tincan/v1\|<sessionId>\|<seq>` from the shared helper | Pass (`shared/src/framing.ts`) |
| Padding on every frame type, canonical unpad (zero bytes, smallest bucket) | Pass (`padding.ts`) |
| Decrypt failure drops the frame, warns, keeps the last good text | Pass |
| `seq` strictly increasing, checked before and advanced after a valid open, serialized | Pass |
| Decoded messages strictly validated; unknown types ignored | Pass (`shared/src/message.ts`, `guards.ts`) |
| Text rendered by interpolation only | Pass (no `innerHTML`, no `bypassSecurityTrust*` in the client) |
| Staleness from the encrypted timestamp | Pass |
| Sender-only publish, one receiver, 128-bit tokens compared in constant time, never logged | Pass |
| Size and rate limits before forwarding; TTL and cap | Pass; per-address limit missing (T13-1) |
| Server never parses or logs frame content | Pass |
| CSP without `unsafe-inline` / `unsafe-eval`, `connect-src 'self'`, `frame-ancestors 'none'` | Pass (stricter: `default-src 'none'`) |
| No new dependencies, no new install scripts | Pass (none added in this pass) |

No change in this pass touches `shared/` or `client/src/app/crypto`, so nothing overlaps the ECDSA frame-signing
work (T15). Forgery by a link holder stays R-2 until then.

## Residual risks
Unchanged R-1 to R-5, plus **R-6 session-table exhaustion by one client** (T13-1, T13-5), all in
[`docs/security.md`](../security.md).

## Decision needed
- **Per-address limits in the relay (T13-1).** The current choice puts the limit at the reverse proxy. Enforcing it
  in the relay would need a trusted-proxy setting (Express `trust proxy` plus reading `X-Forwarded-For` in the
  socket.io handshake); otherwise every client behind the proxy shares one address. Worth a task if the app is
  deployed without a proxy that can limit connections.
