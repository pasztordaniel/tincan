# T17 — String to the viewport edge

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| designer | T11, T08, T09 | pr-open | `feat/T17-string-to-edge` |

## Goal
Product owner request: with a sender window on the left and a receiver window on the right, the two strings should
read as one continuous line. The sender's string runs all the way to the right edge of the viewport and the
receiver's string starts at the left edge, instead of stopping mid-air at the illustration's edge on wide screens.
The big "e" loop and the cans stay as they are.

## Acceptance
- Sender (waiting and connected) and receiver (pick-up and connected) heroes: the string reaches the viewport edge
  at every width from 360 px to wide desktop, at the same height in both views, with no horizontal scroll
  (`document.documentElement.scrollWidth <= innerWidth`).
- Draw-in, sway and pulse motion still read as one string; reduced motion shows the full static string.
- Light and dark themes; CSP (no inline `style`) and Trusted Types untouched.
- Broken-string states (slack, cut, frayed, busy, idle scissors) unchanged, with the reason documented in
  `docs/design.md`.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- designer: in-review. Technique: a decorative `aria-hidden` tail `<span>` next to the SVG in `IlloSender`
  (unless `snip`) and `IlloReceiver`, shown only on `.hero` hosts (hidden in the `/design` cards via
  `:host-context(.guide)`). The hero host becomes a size container; the tail sits at `y 100/160` of the art with
  the string's thickness (`100cqi * 1.5 / 320`) and is `(100vw - 100%) / 2` wide, i.e. exactly the gap between the
  hero and the viewport edge (zero on phones, where the hero is already full-bleed); `body { overflow-x: clip }`
  already absorbs the scrollbar's pixels. The sender's path now ends level at `(320, 100)` and the receiver's
  starts level at `(0, 100)` so the joins are seamless; the loop and cans are untouched. Motion: the sender tail
  scales in right after its string has drawn; the receiver tail scales in from the viewport edge first and the
  string inside the art waits for it (`string--after-tail`); both sway with the string and twang with each frame
  pulse (`StringPulse.fire` takes the tail, translate in container units). The dimmed waiting tail abuts the
  round cap instead of overlapping it, so no darker dot shows. Slack (reconnecting) is not extended: it draws two
  cans with the slack line tied between them, so there is no free end to carry to an edge; cut, frayed, busy and
  the idle scissors keep their broken string by design. Verified with Playwright at 360, 768 and 1440 px in light
  and dark (sender waiting and connected, receiver pick-up and connected), a 930 + 930 px side-by-side composite,
  the draw-in sequence and `/design`; no horizontal overflow anywhere, no console errors. Unit tests cover the
  tail's presence, side, `aria-hidden` and the snip case.
- qa: FAIL, see [docs/testing/T17.md](../testing/T17.md). D1: sender waiting (dimmed tail) overshoots the viewport by 3 px at all widths, so `scrollWidth = innerWidth + 3` and the page scrolls sideways (repro: new thread, load `/s` at 1280 x 800, `scrollWidth` vs `innerWidth`, `scrollTo(200, 0)`). Everything else passed (edges, joins at 930/1280, motion, reduced motion, slack/cut unchanged, /design, resize, `npm run verify` green).
- designer: QA fixes. D1: the dimmed tail no longer shifts past the round cap; every state uses the same 2px overlap and
  a width that ends exactly at the viewport edge. As a guard, `html { overflow-x: clip }` keeps body's clip on body (a
  visible root hands it to the viewport, which treats clip as hidden, so anything past the edge still widened
  `scrollWidth`). Clipping the hero host was not an option: the tail lives outside the host's box. D2: the waiting
  string and tail are dimmed with an opaque `color-mix` (`--illo-string-dim`) instead of opacity, so they overlap
  without a dot or a seam (checked at 8x in light and dark). Receiver twang: confirmed, the receiver tail gets its WAAPI
  twang when the text arrives, about 280 ms after the sender types (relay plus decrypt), so an 80 ms sample misses it.
  New `e2e/tests/string-edge.spec.ts`: sender waiting and connected, receiver pick-up and live, at 360 and 1280 px,
  tail at the edge and `scrollWidth <= innerWidth`. `E2E_PORT=3228 npm run verify` green. Status pr-open.
