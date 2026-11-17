# T16 — Cut the line

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T08, T09, T10 | done | `feat/T16-cut-the-line` |

## Goal
A **Cut the line** button on the sender and receiver views that ends the session on purpose, guarded against
accidental taps by an inline two-step confirm (no browser dialog).

## Acceptance
- Visible while the line is waiting, live, idle or reconnecting (sender, also while waiting for the receiver; receiver
  after Pick up). Not shown once ended, and not on the receiver's gate.
- The button turns into "Cut the line? / Cut it / Keep talking". Escape or Keep talking backs out; focus moves to
  "Keep talking" when the question opens and back to the trigger on dismissal.
- Sender: key, link and timers wiped, explicit relay leave. Receiver: key wiped through the same cleanup as `pagehide`,
  explicit relay leave. While connected the peer gets `peer_left` at once and shows its existing ended state; while the
  cutting side is reconnecting or offline the cut is local at once and the peer learns of it when the 20 s grace runs out.
- After the cut, focus moves to the ended banner (or heading on the receiver's cut screen).
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
- security: reviewed `git diff origin/main...HEAD`. Pass, no blocking findings.
  - Key drop: sender `cut()` -> `stop()` nulls the sealer and the link, bumps `epoch`, clears all timers and
    subscriptions, then `relay.leave()` tears down the socket, token and kept frame. Receiver `cutLine()` -> `cleanup()`
    nulls the opener, unsubscribes, clears both timers and leaves. No other reference to either `CryptoKey`.
  - Races: an in-flight seal is discarded (`this.sealer !== sealer`); an in-flight open is discarded (`destroyed`
    check after the await); frames after the cut have no subscriber. Reconnect cannot resume: `teardown()` drops the
    session token and the socket, and the socket handlers check `this.socket !== socket`. `epoch` blocks a stale
    `start()`; `cutLine()` is a no-op unless the session is active and not ended.
  - Confirm: `confirmed` is only emitted by "Cut it", which exists only after the trigger was clicked; focus lands on
    "Keep talking", so a double Enter backs out. Each page binds the output to its own session.
  - Text: rendered by interpolation / `[value]` only, no `innerHTML`; the sender box is `readOnly` and `edit()` ignores
    input after the cut anyway. The kept text lives in memory only and is cleared on page leave and on `pagehide`
    (`PageLifecycle` calls the sender's `end()` and the receiver's `hangUp()`). No new URL, storage, log or CSP surface (component styles only, no inline handlers).
  - Low: cutting while `reconnecting`/`offline` cannot deliver the explicit disconnect, so the peer sees
    `peer_timeout` after the relay grace, not `peer_left` at once. Local wipe is still immediate. Doc wording only.
- dev: review fixes.
  - Focus moves to the ended banner (`tabindex="-1"`) after the user's own cut on both screens, and to the heading of
    the receiver's cut screen (`takeFocus`); only after a live to ended change, so `/design` never steals focus.
  - `peer_left` copy is now "The sender cut the line."; `ReceiverSession.cutByYou` is a computed.
  - New `danger` button variant (`--color-danger*` tokens, light and dark, AA) used for "Cut it"; shown on `/design`.
  - Known edge, accepted: the sender's idle countdown keeps ticking under an open confirm, so the line can be cut by
    the idle clock while the question is showing.
  - Doc wording: `peer_left` is immediate only while connected (see Acceptance and architecture.md).
- qa: behaviour PASS at 2d79617, report docs/testing/T16.md. `npm run verify` RED: e2e `cut-the-line.spec.ts` "Escape and Keep talking" fails (Escape sent before focus reaches "Keep talking" is lost, so the confirm stays open; 3 of 5 runs without a delay). Repro in the report, defect 1.
- dev: QA bounce fixed. `CutLine` handles Escape at document level while confirming (focus is on `body` until
  `afterNextRender`, and the user may have clicked elsewhere); `preventDefault` only when it acts. Unit tests: Escape
  before render, Escape with focus elsewhere. e2e stable with `--repeat-each=10`.
