# T11 — Design system and logo

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| designer | T01 | in-review | `feat/T11-design-system` |

## Goal
Visual language from the maintainer's logo and UI ideas: tokens (color, type, spacing) as CSS custom properties,
light/dark, the tin-can motif, accessible status components (connection pill, warning banner, link card).
No remote fonts or assets (CSP). Screens, states and illustrations: [`docs/design.md`](../design.md).

## Acceptance
- Every screen and state in `docs/design.md` exists, with placeholder SVGs where the maintainer's illustrations
  have not landed yet.
- WCAG AA contrast; states distinguishable without color alone; works at 360 px width.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- designer: claimed (stacked on the unmerged T01 scaffold, by request of the orchestrator)
- designer: in-review. Tokens (light + dark) in `client/src/styles.scss`; `appButton` directive, status pill,
  warning banner and link card in `client/src/app/ui/`; seven placeholder illustrations in
  `client/src/app/illustrations/` (same `label`/`width` API, colors from `--illo-*` tokens); presentational
  sender, receiver, line busy and line cut screens in `client/src/app/screens/`; home with the thread dialog
  (mock link) and a lazy `/design` preview of every screen and state. Tested with unit tests for the pill
  mapping, link copy feedback, screens and illustrations; `npm run lint`, `npm test`, `npm run e2e` green;
  screenshots checked at 360 and 1280 px, light and dark, no horizontal overflow. Animations (caret, pill,
  slack string, button transitions) run only under `prefers-reduced-motion: no-preference`.
  Open questions for the maintainer: receiver "waiting" pill copy (brief has none, using "Picking up...");
  whether `/design` ships in production; Join currently goes to `/design#sender` until T08 adds the sender
  route; link path shape `/t/<id>#k=<key>` is a mock for T04/T07 to replace.
- designer: review changes from the maintainer. Headings and the wordmark use Caveat 600 (self-hosted
  `@fontsource`, OFL, latin woff2 only, `size-adjust` keeps heading sizes); body, pill, buttons and live text
  stay in the system sans; Kalam and Patrick Hand are shown on `/design` and swap in with one `--font-display`
  line. Two-state light/dark toggle starting from the system theme (`ThemeService`, applied in an app
  initializer, CSP-safe, only the UI preference in `localStorage` under `tincan.theme`). Illustrations redrawn
  to the maintainer's sketch: left can on its side, right can upright and tilted, string from each closed
  bottom with one cursive "e" loop, shared poses in `can-pose.ts`. Lint and unit tests green.
