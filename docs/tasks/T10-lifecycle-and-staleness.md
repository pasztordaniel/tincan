# T10 — Disconnect, resume and staleness

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T05, T08, T09 | pr-open | `feat/T10-lifecycle` |

## Goal
End-to-end handling of network blips (grace + resume, resend latest text) vs. reload/close (session ends, peer notified),
plus heartbeat-driven stale indicator.

## Acceptance
- Covered by e2e: offline/online on either side resumes; reload ends the session for both.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- dev: claimed
- dev: implemented and tested.
  - `client/src/app/lifecycle/page-lifecycle.ts` (root service, started by an app initializer): on `pagehide` it ends the
    sender session and calls `relay.leave()`; on `pageshow` with `persisted` it ends again, so a bfcache-restored page
    shows `Line cut` instead of a dead live view. Not `beforeunload`, not `visibilitychange`. Unit-tested with a fake
    window event target.
  - Network blips: no RelayService change. socket.io's backoff is at most 3 s, so nudging on the browser's `online`
    event gains little; calling `manager.open()` during the backoff would also leave socket.io's internal
    `_reconnecting` flag stuck and block later reconnects. Both sides already show "Line is slack, reconnecting..."
    (own status or `peer: reconnecting`) and return to live. Sender staleness needed no change: the sender has no
    heartbeat from the receiver, it relies on the relay's `peer` state.
  - e2e `e2e/tests/lifecycle.spec.ts` (real UIs, two contexts): sender drop and resume (text typed offline arrives),
    receiver drop and resume (text typed meanwhile arrives), sender reload, receiver close, receiver reload (peer sees
    `Line cut` within 5 s, far below the 20 s grace). Drops use `helpers/flaky-link.ts` (`page.routeWebSocket`, closes
    the live sockets and refuses new ones until restored), since `setOffline` does not close an open WebSocket. The
    leave tests deliberately do not use it: the proxy hop loses the disconnect packet on page teardown.
  - Open: a browser that loses the network without closing the socket only notices after socket.io's ping timeout
    (about 45 s), longer than the grace for the peer; that is the relay's `peer_timeout` path, unchanged.
- security-pentester: reviewed pagehide/bfcache, races, half-open links and the e2e helpers.
  - Fixed (medium): the receiver kept its key and decrypted text on `pagehide`. `PageLifecycle` only ended the root
    `SenderSession` and the transport; the component-scoped `ReceiverSession` kept its opener (`CryptoKey`) and text,
    so a page restored from bfcache still showed the old plaintext, and a receiver at the gate could press Open and
    join with a key it should no longer hold. `PageLifecycle.onHide()` lets the receiver wipe key, text and timers
    and show "Link already used". Each hide step is isolated, so a throwing handler never skips the explicit leave.
    Unit tests (receiver: live, gate, join in flight, idempotent; lifecycle: handlers, throwing steps) and an e2e
    (navigate away and back). Headless Chromium did not put the page in bfcache in that e2e, so it guards the
    reload path; the bfcache path is covered by the unit tests.
  - Fixed (low): half-open connections. The relay now pings every 10 s with a 5 s timeout (socket.io default
    25 s + 20 s), so a silently vanished peer is noticed within 15 s and the sender stops claiming "they can hear
    you" after at most 15 s + 20 s grace instead of 65 s. Timings are relay options; tests simulate a half-open
    sender and receiver (pongs suppressed) and pin the defaults.
  - Checked, no change: `pagehide` during create (epoch cancels, the late session is left) and during join (the
    teardown cancels the open; an acked join is left), double `pagehide` and leave after the end are no-ops, nothing
    reacts to `visibilitychange`; the e2e helpers use no fixed sleeps and route only the test pages' sockets.
- qa-tester: QA PASS, see [T10 test report](../testing/T10.md). Reload, close and navigate-away end the peer in under 50 ms; drops resume and typed text arrives; half-open peers noticed in about 14 s, ended after about 34 s; bfcache could not be triggered (unit-tested only); minor fragment-in-history race noted in the report.
