# Workflow

## Roles
| Role | Agent | Owns |
|---|---|---|
| Product manager | `pm` | Task board, breakdown, priorities, routing work, acceptance |
| Senior developer | `senior-dev` | Architecture, crypto/protocol code, code review of others' branches |
| Developer | `dev` | Well-scoped tasks (UI, server handlers, CI) incl. their unit tests |
| QA tester | `qa-tester` | Clicks through the golden paths in a real browser (Playwright) before every PR; writes e2e specs |
| Security pentester | `security-pentester` | Threat model upkeep, attacks every branch touching security surface, final audit |
| Designer | `designer` | Visual language, logo integration, accessible UI states |
| Human maintainer | — | Approves and merges every PR |

PM, senior dev and pentester form the **core loop**: they discuss scope/risks before work is handed out and when a
finding changes the plan. The PM assigns tasks; developers don't pick work outside the board.

## Lifecycle of a task
```
 backlog ─▶ ready ─▶ in-progress ─▶ in-review ─▶ qa ─▶ pr-open ─▶ done
                         ▲               │          │
                         └── changes ◀───┴──────────┘   (review, security or QA findings bounce it back)
```
1. **PM** moves a task to `ready` when its dependencies are `done` and acceptance criteria are clear.
2. **Dev** claims it (`task-workflow` skill), works on `<type>/<task-id>-<slug>` in its own worktree, commits in small
   Conventional Commits, keeps tests green.
3. **In review**: `senior-dev` runs `/code-review`; if the task touches the security surface, `security-pentester`
   runs `/security-review` + `crypto-review`. Findings go back to the dev.
4. **QA**: `qa-tester` runs the golden paths in a browser on that branch. Any failure → back to `in-progress` with a
   reproduction. On a pass, QA commits a test report with screenshots to `docs/testing/` (see
   [`docs/testing/README.md`](testing/README.md)). Only a QA-passed branch may become a PR.
5. **PR**: `pr-gate` skill runs all automated gates and opens the PR with the template filled in.
6. **Human** reviews and merges. PM marks the task `done` and unblocks dependents.

## Security surface (always gets a security review)
`client/**/crypto*`, `client/**/relay*`, `shared/**`, `server/**/socket*`, `server/**/headers*`, CSP, dependency
additions, anything that reads/writes the URL, storage or clipboard.

## Pre-PR gates (`pr-gate`)
1. `npm run verify` — lint, format, typecheck, unit, build, e2e.
2. Guard: no secrets, no debug logging of frames/keys, no `innerHTML`/`bypassSecurityTrust*`.
3. `/code-review` clean (or findings answered).
4. `/security-review` + `crypto-review` for security-surface changes.
5. QA sign-off recorded in the task file, and the test report with screenshots is in `docs/testing/`.
6. Docs/ADR updated if behaviour or a decision changed.

## Git conventions
- `main` is protected: PR only, CI green, linear history (squash merge), human approval.
- Commit: `type(scope): imperative summary` (≤72 chars), body explains *why*. Types: feat, fix, test, refactor, docs,
  chore, ci, build, perf, security.
- One task = one branch = one PR. Rebase on `main` before opening the PR.

## Parallelism
Tasks declare dependencies on the board. Independent tasks run concurrently, each agent in its own git worktree.
The `shared/` protocol (T03) is the contract that lets client and server lanes proceed in parallel.
