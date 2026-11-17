# T16 — Cut the line

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T08, T09, T10 | in-review | `feat/T16-cut-the-line` |

## Goal
A **Cut the line** button on the sender and receiver views that ends the session on purpose, guarded against
accidental taps by an inline two-step confirm (no browser dialog).

## Acceptance
- Visible while the line is waiting, live, idle or reconnecting (sender, also while waiting for the receiver; receiver
  after Pick up). Not shown once ended, and not on the receiver's gate.
- The button turns into "Cut the line? / Cut it / Keep talking". Escape or Keep talking backs out; focus moves to
  "Keep talking" when the question opens and back to the trigger on dismissal.
- Sender: key, link and timers wiped, explicit relay leave. Receiver: key wiped through the same cleanup as `pagehide`,
  explicit relay leave. The peer gets `peer_left` at once and shows its existing ended state.
- The side that cut shows "You cut the line"; both keep the last text readable (the sender's box read-only).
- Unit tests for both screens, pages and sessions; e2e with two contexts; `/design` lists the new states.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- dev: claimed
- dev: implemented and tested.
  - `client/src/app/ui/cut-line/cut-line.ts`: shared `CutLine` component (trigger button, `role="group"` confirm
    labelled by the question, described by the consequence). No `window.confirm`, no inline styles.
  - `SenderSession.cutLine()` reuses the idle-cut path (`cut()`), so the key, link and timers go and the relay is left;
    the text stays on screen (the plain `end()` would clear it). `cutByYou` selects the "You cut the line" copy.
  - `ReceiverSession.cutLine()` calls the same `cleanup()` as the `pagehide` handler (key, listeners, timers, leave) but
    stays on the live stage and keeps the last text readable, like every other ended state (T09). `cutByYou` is
    derived from the relay's `left` end reason.
  - Both screens take `cutByYou` and emit `cutLine`; `/design` shows the two "cut by you" states.
  - e2e `e2e/tests/cut-the-line.spec.ts`: sender cuts, receiver cuts, Escape / Keep talking back out.
