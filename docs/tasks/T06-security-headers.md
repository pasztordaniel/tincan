# T06 — Security headers and static serving

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T01 | backlog | — |

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
