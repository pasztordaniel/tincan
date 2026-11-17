# Test reports

Every task that passes QA leaves a report here, so anyone can see what was tested, how, and what it looked like.

| Task | Report | Result |
|---|---|---|
| T01 | [T01](T01.md) | PASS |
<!-- qa-tester appends one row per passed task, newest last -->

## Conventions
- **Report:** `docs/testing/<task-id>.md`, written by `qa-tester` on the task branch when the verdict is
  `QA PASS`, and committed as `docs: add <task-id> test report`. The QA commit only touches `docs/testing/`.
- **Screenshots:** `docs/testing/screenshots/<task-id>/NN-<step>.png`, numbered in walkthrough order.
  - Desktop: 1280x800. Mobile: 360x780 for any screen with UI changes.
  - Keep each file under about 300 KB: PNG, viewport-only unless the full page matters.
  - Never capture a real key. Screenshots may show the URL only after the fragment has been cleared, or with a
    throwaway session that is already ended.
- **Failures** stay out of `docs/`. Their screenshots go to `test-results/` (ignored), and the reproduction goes to the task Log.

## Report template
```markdown
# <task-id> test report: <title>

| Branch | Commit | Date | Tester | Result |
|---|---|---|---|---|
| `<branch>` | `<short sha>` | YYYY-MM-DD | qa-tester | PASS |

## Environment
Node x.y, Chromium x (Playwright x), `npm start` on :<port>, viewports tested.

## Flows
### 1. <flow name>
Steps: ...
Expected: ...  Actual: ...  Result: PASS
![<alt text>](screenshots/<task-id>/01-<step>.png)

## Edge and adversarial checks
| Check | Expected | Result |
|---|---|---|

## Automated
`npm run verify`: lint, unit (n tests), build, e2e (n specs). Result: green.

## Not covered / follow-ups
```
