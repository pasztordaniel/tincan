# CLAUDE.md

@AGENTS.md

## Claude Code specifics
- **Roles** are defined in `.claude/agents/`. The main session acts as orchestrator: it runs the PM agent for
  planning, then fans tasks out to `senior-dev` / `dev`, and routes finished branches through `qa-tester`
  and `security-pentester` before a PR is opened. Flow and hand-offs: `docs/workflow.md`.
- **Skills** in `.claude/skills/`:
  - `task-workflow` — claim a task, branch, commit, keep the board current.
  - `pr-gate` — run every pre-PR gate and open the PR with a filled template.
  - `crypto-review` — project-specific crypto/protocol checklist (complements `/security-review`).
  - `security-audit` — full local scanner + agent audit; run at milestones and before release.
- Built-in skills used in the gate: `/code-review` (correctness) and `/security-review` (security diff review).
- Parallel work uses git worktrees (`isolation: "worktree"`) so agents never share a working tree.
- Never use `--no-verify`, never force-push `main`, never merge a PR yourself — a human merges.
