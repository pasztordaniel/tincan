# Design brief

tincan is "two cans, one string". The UI tells the security story through that metaphor, so every connection
state has its own illustration instead of a technical error message.

## Look
- A simple, clean, light pastel surface with lots of air. One primary action per screen.
- The illustrations are hand-made by the maintainer (inline SVG, served locally because of the CSP). Until they
  arrive, the designer ships simple placeholder SVGs with the same names and sizes.
- Tokens are CSS custom properties: color, type, spacing, radius. No remote fonts or assets.

## Screens

| # | Screen | Illustration | Content |
|---|---|---|---|
| 1 | Home | Tin-can phone | One button: **New thread** ("thread" = a new string between two cans). |
| 2 | Thread created (dialog) | — | Read-only input holding the full link, a copy icon button, then a **Join** button that takes the sender to their can. |
| 3 | Sender | One can; the string leaves the screen on the **right** | A writing area showing a blinking cursor (ready to type) and a status pill. |
| 4 | Receiver | One can; the string comes in from the **left** | The live text (read-only, plain text) and a status pill. |
| 5 | Line busy | A second string knotted onto the line between the cans | Someone else already holds the receiving can; this link cannot be opened again. |
| 6 | Disconnected / ended | Scissors cutting the string | The peer left or the session ended; nothing more will be delivered. |

Screens 3 and 4 mirror each other: together they form one picture of a string running from left to right.

### Status pill (sender and receiver)
| State | Sender text | Receiver text |
|---|---|---|
| waiting | Waiting for the other can... | — |
| connected | Connected: they can hear you | Connected |
| reconnecting | Line is slack, reconnecting... | Line is slack, reconnecting... |
| ended | Line cut | Line cut |

States must be distinguishable without color alone: use text, an icon, and a subtle string animation
(straight when connected, slack when reconnecting).

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
5. **Copy feedback.** After copying the link, a short "Copied" confirmation and a reminder: "Anyone with this
   link can read along. Send it over a channel you trust."

## Accessibility
WCAG AA contrast, visible focus, works at 360 px width, live text announced politely (`aria-live="polite"`),
and illustrations carry `alt` text that describes the state.
