# T10 — Disconnect, resume and staleness

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T05, T08, T09 | in-review | feat/T10-lifecycle |

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
