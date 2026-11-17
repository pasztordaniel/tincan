# T02 — CI pipeline and branch protection

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T01 | in-review | ci/T02-ci-pipeline |

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
- dev: claimed
- dev: implemented `.github/workflows/ci.yml` (single job `verify`: checkout, setup-node from `.nvmrc` with npm
  cache, `npm ci`, cached Playwright Chromium + system deps, `npm run verify`, Playwright report uploaded on failure)
  and `.github/dependabot.yml` (npm + github-actions, weekly, minor and patch grouped). Permissions are
  `contents: read`; concurrency cancels superseded runs per PR or ref.
- dev: decision, action pinning: actions are pinned to major versions (`@v5`, `@v4`) on the PM's instruction, not to
  commit SHAs as the Goal above says. Dependabot's github-actions ecosystem keeps them current. Switching to SHAs
  later is a small change per action.
- dev: decision, `prepare`: it runs `tsc` to build `shared/`, so it needs dev dependencies. CI uses `npm ci`, which
  installs them, so it works. `npm ci --omit=dev` is not supported and must not be used; production should build
  first (`npm ci && npm run build`) and ship the result.
- dev: decision, `allowScripts`: not configured. npm 11 skips the install scripts of esbuild, @parcel/watcher, lmdb,
  msgpackr-extract (and fsevents) and warns. `npm run verify` passes with them skipped, because esbuild and lmdb
  ship prebuilt binaries as optional platform packages and the others are optional accelerators. CI therefore does
  not need them, and leaving them off keeps install-time code execution minimal. Revisit if a build fails with a
  missing native binding.
- dev: tested: `npm run verify` green locally on Node 24.22.3 with scripts skipped; workflow validated with
  `@action-validator/cli` (no errors). The workflow has not run on GitHub yet.
- dev: branch protection NOT applied. A human runs this after merge (replace OWNER/REPO, needs admin rights):

  ```bash
  gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
  {
    "required_status_checks": { "strict": true, "contexts": ["verify"] },
    "enforce_admins": true,
    "required_pull_request_reviews": { "required_approving_review_count": 1, "dismiss_stale_reviews": true },
    "restrictions": null,
    "required_linear_history": true,
    "allow_force_pushes": false,
    "allow_deletions": false
  }
  JSON
  gh api -X PATCH repos/OWNER/REPO -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true
  ```
