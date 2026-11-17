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
- security-pentester: reviewed T08 (`/security-review` + `crypto-review`). Key handling, fresh message per seal,
  frame sizes (10k UTF-16 units worst case ~60 KB plaintext, ~87.5 KB frame < 96 KiB), no HTML sinks, CSP-safe
  templates, and traffic bounds (< 6 events/s vs. 20/s cap) pass. Fixed (Low): `start()` raced by `end()` or a newer
  `start()` could leave an unowned live session; a frame sealed during `end()` could still be sent (on a new session's
  socket it would fail auth and could poison the relay's seq check); a late ack of an older text could clear the
  resend flag of a newer refused one; a modified Join click (new tab) marked the session as handed over, so "Not now"
  left it open. Also: home ends an owned session on destroy, closes the dialog when the session ends under it; e2e
  also checks title, history state and console for the key. Accepted: `slice` at `MAX_TEXT_LENGTH` may split a
  surrogate pair (escaped by `JSON.stringify`, fits the bucket math; cosmetic only); typing frames reach the relay
  while no receiver is attached (padded like content, R-3 metadata).
- qa-tester: QA PASS. Real Chromium against the production build with a Node receiver decrypting frames: link format, key never leaked, debounce/typing/beat bounds, late join, reconnect (only latest text), ended, idle (clock override), 10k clamp, 360/1280, light/dark, no CSP or console errors. Report: [docs/testing/T08.md](../testing/T08.md). Note: latest text is sent twice after a resume (harmless).
