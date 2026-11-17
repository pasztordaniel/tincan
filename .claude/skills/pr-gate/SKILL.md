---
name: pr-gate
description: Run every pre-PR gate for a tincan branch and open the pull request with the template filled in. Use only after the task has a QA PASS in its log; use when asked to "open a PR", "ship the branch" or "run the gates".
---
# pr-gate

Stop at the first failing gate, report it, and send the task back to `in-progress`.

1. **Preconditions** — on a task branch (not `main`), working tree clean, task Log contains `QA PASS` newer than the
   last code commit, and `docs/testing/<task-id>.md` exists (link it in the PR body and embed one or two of its screenshots). Rebase: `git fetch && git rebase origin/main`.
2. **Automated** — `npm run verify`.
3. **Hygiene scan** on the diff vs. `origin/main`:
   ```bash
   git diff origin/main...HEAD -U0 | grep -nE '^\+.*(innerHTML|bypassSecurityTrust|console\.(log|debug)\(|localStorage|sessionStorage|eval\(|new Function)' || true
   ```
   Every hit needs a justification in the PR or a fix. Also check no new dependency without a reason.
4. **Code review** — run `/code-review` on the branch. Blocking findings → back to the dev.
5. **Security** — if the diff touches the security surface (`docs/workflow.md`): `/security-review` and the
   `crypto-review` skill must be clean or findings answered.
6. **Docs** — behaviour or contract changed → `docs/architecture.md` / `docs/security.md` / ADR updated.
7. **Open the PR**:
   ```bash
   git push -u origin HEAD
   gh pr create --title "<type>(<scope>): <summary> (<ID>)" --body-file <filled template>
   ```
   Fill `.github/pull_request_template.md` truthfully (only tick what was actually done); end the body with the
   attribution line the session requires.
8. Task status `pr-open`, PR link in the Log. **Do not merge** — a human does.
