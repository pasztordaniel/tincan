# T13 — Security review and audit

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| security-pentester | continuous; final after T12 | in-review | `fix/T13-security-pass` |

## Goal
Review every security-surface PR (`/security-review`, `crypto-review`). At the end run `security-audit` and fix or
document every Critical/High. Keep `docs/security.md` current.

## Acceptance
- Audit report with no unaddressed Critical/High; residual risks documented.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- 2026-11-17 security-pentester: claimed the final audit on `fix/T13-security-pass` (from main b367ba2). Plan: security-audit skill end to end, live probing of the production build on :3240, fixes with tests, report in `docs/security/audit-T13.md`.
- 2026-11-17 security-pentester: final audit done, report in `docs/security/audit-T13.md`. No Critical or High. Fixed: server accepts WebSocket handshakes only (Medium), key fragment dropped on paths outside `/r` and on in-place navigations (Low), dependabot cooldown (Low). Accepted: session-table exhaustion by one client as R-6, with a proxy connection-limit deployment note. `E2E_PORT=3241 npm run verify` exits 0. In review.
