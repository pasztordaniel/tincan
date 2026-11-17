# T02 — CI pipeline and branch protection

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T01 | backlog | — |

## Goal
GitHub Actions on PR + push to `main`: install (cached), lint, typecheck, unit, build, e2e (Playwright, Chromium).
Actions pinned by commit SHA, `permissions: contents: read`. Then protect `main` (required checks, PR only, linear history).

## Acceptance
- A PR shows the required checks; a failing test blocks merge.
- Playwright report uploaded as an artifact on failure.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- senior-dev (from T01 review): the root `prepare` script needs `tsc`, so `npm ci --omit=dev` fails. Decide how
  install scripts run in CI and production, including npm 11 `allowScripts` (it currently skips the install scripts
  of esbuild, @parcel/watcher, lmdb and msgpackr-extract).
