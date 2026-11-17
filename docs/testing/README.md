# Test reports

Every task that passes QA leaves a report here, so anyone can see what was tested, how, and what it looked like.

| Task | Report | Result |
|---|---|---|
| T01 | [T01](T01.md) | PASS |
| T06 | [T06](T06.md) | PASS |
| T03 | [T03](T03.md) | PASS |
| T04 | [T04](T04.md) | PASS |
| T11 | [T11](T11.md) | PASS |
| T05 | [T05](T05.md) | PASS |
| T07 | [T07](T07.md) | PASS |
| T08 | [T08](T08.md) | PASS |
| T09 | [T09](T09.md) | PASS |
| T10 | [T10](T10.md) | PASS |
| T16 | [T16](T16.md) | PASS (Escape race found and fixed) |
| T17 | [T17](T17.md) | FAIL (D1: 3 px horizontal scroll in sender waiting) |
| T18 | [T18](T18.md) | PASS |
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

## End-to-end tests (T12)
The Playwright suite in `e2e/tests/` runs headless against the production server (`npm run e2e`, or
`E2E_PORT=3222 npm run test:e2e` against an existing build). `flow.spec.ts` drives the real sender UI and the
real receiver UI in separate browser contexts; the receiver's WebSocket goes through `page.routeWebSocket` and is
forwarded to the real relay (`helpers/ws-tap.ts`), which lets a spec corrupt or re-deliver frames.
No fixed sleeps: every step waits on UI state. Runtime: `flow.spec.ts` about 4 s in parallel; the whole suite is
well under a minute locally (CI budget: 2 minutes).

| Spec | What it proves |
|---|---|
| golden path | Sender creates a thread, receiver opens the link and picks up; 5 consecutive updates (multi-line, accents, CJK, emoji, HTML-looking text, edit, append, delete) arrive exactly (`textContent`, not whitespace-normalised) and in order (a MutationObserver records every rendered text); HTML is shown as text; no warning |
| second receiver refused | A third context gets "This line is busy"; the first receiver keeps receiving, with no warning |
| tampered frame | A byte of every sender frame's ciphertext is flipped in flight: the integrity warning shows, the last good text stays; once tampering stops, later frames update again |
| replayed frame | A genuine, earlier frame is re-delivered byte for byte: warning shown, text not rolled back, later frames still update |
| key absent | Across both parties: no request URL, header, body or WebSocket frame contains the key or the plaintext, no URL contains `#`, and the server sees `/r/<id>` only |

Reconnect and reload-ends-session specs live in `lifecycle.spec.ts` (T10).
