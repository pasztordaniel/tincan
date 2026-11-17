# T06 — Security headers and static serving

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T01 | in-review | feat/T06-security-headers |

## Goal
Express serves the built client with: strict CSP (`default-src 'self'`, `connect-src 'self'`, no inline script,
`frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options`, `Cross-Origin-Opener-Policy`,
`Permissions-Policy`, no `X-Powered-By`. SPA fallback for `/r/:id`. Prefer hand-set headers over adding helmet unless justified.

## Acceptance
- Test asserts every header on `/` and `/r/abc`.
- Angular production build runs under the CSP with no console violations.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- senior-dev (from T01 review): disable `inlineCritical` in the Angular build; its beasties output adds an `onload`
  handler that violates `script-src 'self'`. Plan the `style-src` policy for Angular component styles.
- T01 review: the origin check compares host:port only and ignores the scheme (no impact today: no credentials, ciphertext only). Document that a reverse proxy must preserve `Host` (e.g. nginx `proxy_set_header Host $host`), or every browser handshake gets 403.
- dev: claimed
- dev: done. `server/src/headers.ts` (middleware, CSP builder, nonce injection, caching rules), wiring in `app.ts`,
  `ngCspNonce` placeholder + `inlineCritical: false` in the client, ADR 0006. Tests: `server/test/headers.spec.ts`
  (every header on `/`, `/index.html`, `/r/abc`, hashed and unhashed assets, 404/400, socket.io polling, HSTS,
  dotfiles) and `e2e/tests/csp.spec.ts` (no `securitypolicyviolation`, console error or page error on `/` and a deep
  link; also checked by hand with a component that has styles). Deviation from the brief: `base-uri 'self'` because
  `<base href="/">` is blocked by `'none'`. Open: socket.io polling responses get the base headers but no CSP.
- senior-dev review: solid design (nonce from `randomBytes(16)`, only server data in the template, every response
  `no-store` except hashed assets, headers mounted first). Fixed on the branch: (1) other spellings of index.html
  (`/%69ndex.html`, `//index.html`) reached `express.static` and served the raw template, placeholder and no nonce
  (low, fail-closed); (2) the hashed-asset regex matched any `-XXXXXXXX.ext`, so a `public/` file like
  `logo-DARKMODE.svg` became immutable for a year (low); now only Angular's own bundles and `media/` with the esbuild
  base32 alphabet; (3) tests: all three placeholders replaced, regex negatives, more dotfile vectors, and an e2e check
  that the HTML nonce equals the header and that only nonced styles apply (the old spec passed with no styles at all).
- security review (/security-review on the diff + probing a built server): no medium or higher finding. Dotfile guard
  holds for `%2e`, `%2E`, encoded `/` and `\`, `..`, trailing dot, `//`; double encoding is decoded once only (by us
  and by `send`), so it only reaches the SPA. SPA fallback answers extension-less paths only, assets 404 as text/plain
  and `nosniff` stops HTML being run as script. Fixed: engine.io's own 400/403 responses (unknown transport, rejected
  origin) skip its `headers` event and had no base headers (low); now set by a request listener prepended after
  socket.io attaches. Accepted: `base-uri 'self'` (needed for `<base href="/">`; an injected same-origin `<base>` needs
  HTML injection first, which Angular interpolation and Trusted Types prevent), `img-src data:`, no CSP on socket.io
  responses (not documents), HSTS trusts any `X-Forwarded-Proto` (harmless over HTTP). Verdict: approve.
- qa-tester: QA PASS. Production build in a real browser: `/` and `/r/abc` with no CSP violations or console errors,
  per-response nonce, `no-store`, hashed assets immutable, dotfiles and 404s correct, cross-origin iframe blocked.
  Report: [docs/testing/T06.md](../testing/T06.md).
