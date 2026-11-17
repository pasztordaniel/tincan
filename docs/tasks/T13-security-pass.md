# T13 — Security review and audit

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| security-pentester | continuous; final after T12 | in-progress | `fix/T13-security-pass` |

## Goal
Review every security-surface PR (`/security-review`, `crypto-review`). At the end run `security-audit` and fix or
document every Critical/High. Keep `docs/security.md` current.

## Acceptance
- Audit report with no unaddressed Critical/High; residual risks documented.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- 2026-11-17 security-pentester: claimed the final audit on `fix/T13-security-pass` (from main b367ba2). Plan: security-audit skill end to end, live probing of the production build on :3240, fixes with tests, report in `docs/security/audit-T13.md`.
