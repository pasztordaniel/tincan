# T09 — Receiver view

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T04, T07, T11 (visuals) | in-review | `feat/T09-receiver-view` |

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
