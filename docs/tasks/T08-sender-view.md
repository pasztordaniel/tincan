# T08 — Sender view

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T04, T07, T11 (visuals) | in-review | feat/T08-sender-view |

## Goal
Create session → show link with copy button (and a hint to share it privately) → textarea (10k char limit) →
debounced `text` frames (300 ms, max wait 1 s), throttled `typing`, `beat` every 5 s. Shows receiver status;
input disabled once the session ends.

## Acceptance
- Link contains `#<key>`; the key never appears in any network request (checked in e2e).
- Typing bursts produce bounded frame counts.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- dev: claimed
- dev: implemented. `client/src/app/sender/sender-session.ts` (root service) orchestrates key generation (CryptoService),
  `RelayService.create()`, the receiver link `<origin>/r/<id>#<key>`, full-state `text` frames (300 ms debounce, 1 s max
  wait, `keepLatest`), `typing` (1/s), `beat` (5 s while connected), the peer-joined resend, and the idle clock
  (warn at 9 min, cut at 10 min via `relay.leave()`). `sender-page.ts` binds it to `SenderScreen` and shows the link card
  while waiting; route `s` (guarded: no live session redirects home, ADR 0004). Home "New thread" creates the real session;
  "Join" opens `/s`, "Not now"/Escape ends it. Leaving the sender page ends the session.
- dev: decisions. A fresh message object is built per seal. A text frame the relay did not take (dropped, rate
  limited) is resent on the next beat; a receiver (re)joining gets the current text at once. State priority: ended,
  idle, reconnecting, connected/waiting. The sender cannot be "busy"; a busy relay at create shows a banner on home.
  Textarea gets `maxlength` = `MAX_TEXT_LENGTH`, the service clamps too.
- dev: tests. Unit: `sender-session.spec.ts` (bounded frames for bursts, max wait, typing throttle, beats, fresh objects,
  idle warn/cut/reset/keep-open, ended ignores edits and stops timers, resend), `sender-page.spec.ts`, `home-page.spec.ts`.
  E2E `e2e/tests/sender.spec.ts`: no request URL/header/body, websocket frame, URL or storage contains the key.
- dev: open questions. No `pagehide` explicit leave: a reload leaves via the 20 s grace, not at once (ADR 0004 says the
  peer is told; consider for T10). Full sender-to-receiver e2e is T12.
