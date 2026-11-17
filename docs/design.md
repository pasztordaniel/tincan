# Design brief

tincan is "two cans, one string". The UI tells the security story through that metaphor, so every connection
state has its own illustration instead of a technical error message.

## Look
- A simple, clean, light pastel surface with lots of air. One primary action per screen.
- The illustrations are hand-made by the maintainer (inline SVG, served locally because of the CSP). Until they
  arrive, the designer ships simple placeholder SVGs with the same names and sizes.
- Tokens are CSS custom properties: color, type, spacing, radius. No remote fonts or assets.
- The cans are the hero: full-bleed on phones, about three quarters of the viewport on wide screens (capped by
  height so the action below stays in reach). Headings use the display face on a fluid type scale; body text
  stays on the system sans. A soft two-tint wash and a faint same-origin grain sit behind the page.

## Screens

| # | Screen | Illustration | Content |
|---|---|---|---|
| 1 | Home | Tin-can phone | One button: **New thread** ("thread" = a new string between two cans). |
| 2 | Thread created (dialog) | — | Read-only input holding the full link, a copy icon button, then a **Join** button that takes the sender to their can. |
| 3 | Sender | One can; the string leaves the screen on the **right** | A writing area showing a blinking cursor (ready to type) and a status pill. |
| 4 | Receiver | One can; the string comes in from the **left** | The live text (read-only, plain text) and a status pill. |
| 5 | Line busy | A second string knotted onto the line between the cans | Someone else already holds the receiving can; this link cannot be opened again. |
| 6 | Disconnected / ended | Scissors cutting the string | The peer left or the session ended; nothing more will be delivered. |
| 7 | Sender idle warning | The sender's own can only; a plain, sagging string (no loop) with open scissors closing in near the right edge | Shown on the sender screen after 9 minutes with no text change: a warning banner with a countdown to the cut at 10 minutes and a **Keep the line open** button. Typing also keeps the line open. |

Screens 3 and 4 mirror each other: together they form one picture of a string running from left to right.

### Status pill (sender and receiver)
| State | Sender text | Receiver text |
|---|---|---|
| waiting | Waiting for the other can... | — |
| connected | Connected: they can hear you | Connected |
| idle | Idle: the string will be cut soon | The sender went quiet (only if the relay tells the receiver) |
| reconnecting | Line is slack, reconnecting... | Line is slack, reconnecting... |
| ended | Line cut | Line cut |

States must be distinguishable without color alone: use text, an icon, and a subtle string animation
(the looped string when connected, slack when reconnecting). The idle pill uses the warning tone and an open-scissors
icon.

### The string
The string leaves the bottom of the can at mid-height and runs low, almost level. On an open line it curls up
into one big, round cursive "e" loop (top level with the top of the right can), comes back down through itself
and runs on: into the other can (home), level off the right edge just below the loop (sender), or, mirrored, in
from the left edge and low into the can's bottom (receiver). The loop shows while the line is open: dim and
still while waiting (sender waiting, receiver pick-up), full colour with draw-in, sway and pulses once live.
Every trouble state (idle, busy, cut, frayed, slack) uses a plain low sag between the can bottoms instead.

On the sender and receiver heroes the string is full-bleed: past the art's own edge a level tail carries it on to
the viewport edge (right for the sender, left for the receiver), at the same height in both (y 100 of the 160-high
art), so a sender window on the left and a receiver window on the right read as one continuous line at any width.
The tail is a decorative element sized from the gap between hero and viewport (zero on phones, where the hero is
already full-bleed) and clipped by `body { overflow-x: clip }`, so it never adds a sideways scroll; it dims with the
waiting string, draws in after the sender's string (before the receiver's) and sways and twangs with it. Trouble
states keep their plain sag between two cans and get no tail: the slack, cut, frayed and busy pictures have no
free end to extend, and the idle sender's sagging line ends at the scissors on purpose. The `/design` cards hide
the tail, since the art already spans its card there.

## Additions the security model requires
These screens or states don't appear in the original sketch, but the protocol needs them:

1. **Receiver "pick up" step.** Opening the link must not join the session by itself, because link scanners and
   preview bots would take the single receiver slot. The receiver screen first shows the can with a
   **Pick up** button; the decrypted view appears only after the click.
2. **Integrity warning.** A frame that fails authentication or arrives out of order is shown, never hidden
   (AGENTS.md, non-negotiable 4). Proposed illustration: a frayed or tangled string, with a warning banner:
   "Something tampered with the line. The last message was not shown."
3. **Stale typing.** If no heartbeat arrives for 15 s, the receiver's text dims with a "last update ..." hint.
4. **Sender after cut.** On the sender's screen the writing area becomes read-only once the line is cut, and
   the screen states that nothing typed now would be sent.
5. **Idle sender.** The relay cuts a line after 10 minutes with no text change. From minute 9 the sender
   sees "No typing for a while: the string will be cut in 1:00" with **Keep the line open**. The pill's
   status role announces the state once; the countdown is a `role="timer"` (live region off), visible and
   readable on demand but never read out every second.
6. **Copy feedback.** After copying the link, a short "Copied" confirmation and a reminder: "Anyone with this
   link can read along. Send it over a channel you trust."
7. **Cut the line.** While the line is open (sender: also while waiting; receiver: after Pick up) a quiet ghost
   button ends it on purpose. A tap only opens an inline question, "Cut the line?" with **Cut it** and **Keep
   talking** (focus lands on Keep talking; Escape backs out), never a browser dialog. Afterwards the side that cut
   shows the usual ended state titled "You cut the line", text still readable.

8. **QR code (sender, waiting).** Under the link card a **Show QR code** button (closed by default) with the hint
   "Anyone who scans this can read your messages.", because the code carries the key. Opened, it shows the receiver
   link as an inline-SVG QR code (about 224 px, at most the column width, so it fits 360 px) with a 4-module quiet
   zone, always black on white, also in dark mode. It disappears as soon as the line stops waiting (receiver
   connected, idle, reconnecting, ended) and starts closed again. Shown on `/design` under the sender states.

## Motion
Motion is CSS, SVG and the Web Animations API only: no animation library, no inline `style` attributes (the
CSP is `style-src 'self' 'nonce-...'`). Only transform, opacity and stroke-dashoffset on small paths are
animated. Every animation is a one-shot tied to an event and ends on the static pose; the few repeats are
short and finite, so nothing keeps moving while someone reads. The one exception is the empty writer's caret
blink (1.1 s steps), a fake caret shown only while the writer is empty and unfocused, and gone once it has focus or text. Under `prefers-reduced-motion: reduce` none of
it runs: CSS motion sits inside `@media (prefers-reduced-motion: no-preference)` and script-driven motion asks
`motionAllowed()` first (`client/src/app/ui/motion.ts`). Every animation can be replayed on `/design#motion`.

| Animation | Trigger | What moves | Reduced motion |
|---|---|---|---|
| String draws in | Home load; thread created (small picture in the dialog); the line goes live (sender, receiver) | stroke-dashoffset from can to can or edge, 1.3 s; the full-bleed tail scales in after it (sender) or before it (receiver), 0.35 s | The full string, drawn |
| Live sway | Right after the draw-in on a live line | The string drifts 2 px, two slow swings, then rests | Still string |
| Frame pulse | Every text change sent (sender) or received (receiver), at most one per 320 ms | A short bright dash runs along the string (WAAPI dashoffset) and the string twangs 1.5 px | None; the text itself is the signal |
| Pick-up wobble | The receiver picks up and the line goes live | The can rocks once on its base, 0.8 s | Still can |
| Scissors close | The line is cut | Blades snap shut once, the two ends spring apart | Open scissors over the cut ends |
| Knot ties | Line busy | The second string draws in, loops round the first, the knot pulls tight | The tied knot |
| Fray spreads | A frame fails its integrity check | The fibres spread out from the worn spot, then the warning sign pops | Frayed string and sign |
| Scissors warn | The sender goes idle | The open scissors snap twice near the string, then rest open | Open scissors |
| Slack sway | Reconnecting | The slack string sways twice, then hangs still | Slack string |
| Pill change | The line state changes | The pill pops (scale 0.92 to 1); the waiting dot beats four times; the slack wave swings four times | Instant change |
| Buttons | Hover, press | Lift 1 px on hover, scale 0.97 on press | Colour change only |
| Dialog | Thread created | The dialog rises and fades in, the backdrop fades and blurs | Appears at once |
| Copy | Link copied | The check mark draws itself, "Copied" slides up | Check and text appear |

## Accessibility
WCAG AA contrast, visible focus, works at 360 px width, live text announced politely (`aria-live="polite"`),
and illustrations carry `alt` text that describes the state.
