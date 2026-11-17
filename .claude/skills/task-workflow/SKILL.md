---
name: task-workflow
description: How to pick up, branch, commit and hand off a tincan task from docs/tasks. Use when starting, updating or finishing work on a board task (T01, T02, ...), or when unsure about branch names, commit format or task status.
---
# task-workflow

## Start
1. Read `docs/tasks/<ID>-*.md`. Status must be `ready` and every dependency `done`; otherwise stop and tell the PM.
2. Branch from fresh `main` (or use the worktree you were given):
   `git switch main && git pull --ff-only && git switch -c <type>/<ID>-<slug>` — type: feat | fix | test | refactor | docs | chore | ci | security.
3. In the task file set Status `in-progress`, Branch `<name>`, and append to Log: `- <role>: claimed`.

## While working
- Commit small, coherent steps: `type(scope): imperative summary` (≤72 chars), blank line, body with the *why*.
  Scopes: client, server, shared, crypto, e2e, ci, docs, deps, agents. End with the attribution trailer the session requires.
- Tests ship in the same commit as the behaviour they cover.
- Run `npm run verify` before handing off. Never `--no-verify`, never commit to `main`.
- Contract or doc wrong? Stop, write it in the Log, ask senior-dev/PM.

## Hand off
- Status `in-review`; Log: what changed, how it was tested, open questions.
- Reviews, security findings and QA verdicts are appended to the Log by whoever produced them.
- After `QA PASS` use the `pr-gate` skill. After a human merges, the PM sets `done`.
