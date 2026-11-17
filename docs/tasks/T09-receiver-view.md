# T09 — Receiver view

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T04, T07, T11 (visuals) | done | `feat/T09-receiver-view` |

## Goal
`/r/:id` shows an **Open** gate → reads + clears fragment → joins → decrypts frames → shows text via interpolation.
States: waiting for sender, live, typing…, stale (no frame for 15 s), integrity warning (keep last good text), ended,
invalid link.

## Acceptance
- Fragment removed from the URL after Open. Replayed/tampered frame → warning, text unchanged.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- dev: claimed (stacked on `feat/T07-relay-client`).
- dev: implemented. `client/src/app/receiver/`: `ReceiverSession` (component-scoped service: fragment key, join on
  `open()`, serialized `FrameOpener`, liveness, integrity state; clock injectable via `RECEIVER_CLOCK`) and a thin
  OnPush `ReceiverPage` on route `r/:id` (one line in `app.routes.ts`, right after `design`).
  - The key is read and the fragment cleared in the page constructor (synchronously up to `importKeyFromFragment`),
    before anything can navigate, even when the id is invalid. Reload has no key: "Link already used". Bad id or
    key: "Invalid link". No relay traffic before the Pick up click; double clicks are ignored while joining.
  - Subscribes to `frames$`/`protocolErrors$` before `join`, so a frame right behind the ack is not lost.
  - `join`: `full` busy screen, `not_found` line-cut ("Nothing on this line"), network errors stay on the gate with a
    retry banner.
  - Any open failure (replay, auth, malformed, wrong session, padding) and any transport-level malformed frame sets a
    warning that stays for the rest of the visit; the last good text is kept. `typing` shows "They are typing..." for
    3 s; any valid frame (text, typing, beat) refreshes liveness; stale after `STALE_AFTER_MS` (1 s tick).
  - Ended: the relay reason maps to a message. With no text received yet the line-cut screen is shown; if text was
    received, the existing receiver screen's ended state is kept so the last text stays readable.
  - Presentational additions (defaults keep `/design` unchanged): `ReceiverScreen` `typing` input, `LineCutScreen`
    `heading`/`message` inputs.
  - Tests: unit `receiver-session.spec.ts` (gate, fragment, invalid links, join outcomes, tamper/replay/other
    session/malformed, stale, ended reasons, teardown), `receiver-page.spec.ts`, screen specs; e2e
    `e2e/tests/receiver.spec.ts` (gate, fragment cleared, reload, busy, invalid, unknown thread) using a minimal
    socket.io sender helper over Node's WebSocket (no new dependency). The full sender to receiver flow is T12.
  - Open: on ack timeout during join the slot may have been taken server-side, so a retry can show "busy".
- security-pentester: reviewed bc607d0..50e4a6c (`/security-review` + `crypto-review`, senior-dev hat on races).
  Fragment read and cleared synchronously in the page constructor, key non-extractable, not logged, stored, titled or
  sent; no relay traffic before Pick up (e2e); frames only through the one `FrameOpener`, serialized; decrypted text
  by interpolation only; no template `style=""`. Findings, all fixed with tests:
  - Medium: staleness used the arrival time, so a relay holding frames back and replaying them at the usual pace
    kept old text looking live forever. Freshness now comes from the encrypted `ts`, relative to the smallest
    `arrival - ts` seen (absorbs clock skew); an added delay of 15 s turns the view stale. A delay present from the
    very first frame cannot be told from skew (security.md, Withholding / freezing).
  - Low: a retried Open created a new `FrameOpener` (`lastSeq` back to 0), so a frame accepted during a failed
    attempt could be replayed after the retry. One opener per visit now.
  - Low: a page destroyed while the join was in flight never left, holding the receiver slot with nobody reading.
    It leaves as soon as that join resolves.
  - Low: `/r`, `/r/<id>/x` fell through to the `**` redirect, which keeps the fragment: the key landed in the home
    page's address bar. Every `/r` path now reaches the receiver page (matcher), which clears it.
  - Nit: after the line ended the tick kept running, "typing" could show under "line cut", and frames after a bare
    `peer: gone` could still replace the final text. All stopped.
  - Accepted, not cheaply fixable: after a join ack timeout `RelayService` disconnects explicitly. If the relay had
    bound the slot on a live socket, that ends the session (the sender sees `peer_left`, a retry shows "Nothing on
    this line"); if the connection had dropped, the slot sits in its 20 s grace and a retry shows "busy", then "Nothing
    on this line". The receiver token never arrived, so the slot cannot be resumed.
  - Accepted (R-5): the Angular router keeps the original URL, fragment included, in memory (`ActivatedRoute`
    snapshot); never written back to the address bar (e2e checks after navigation ends).
- qa-tester: QA PASS. Production build on :3219 in real Chromium, scripted sender (real sealed frames), MITM proxy for
  replay/malformed injection and TCP cuts. 110 checks: open gate and cleared fragment, mangled links, busy, unknown id,
  live text order, typing, beats, stale and recovery, tamper/replay/other key/other AAD/malformed all warn and keep the
  last text, ended reasons with and without text, receiver drop and resume, literal HTML, 10 000 chars, layouts at 360
  and 1280, no key leak, no CSP errors. Report: [docs/testing/T09.md](../testing/T09.md). Note for T10: a reloaded
  receiver tab leaves the sender at `reconnecting` for the 20 s grace, not `peer_left`.
