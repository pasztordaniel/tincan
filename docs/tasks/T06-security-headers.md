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
