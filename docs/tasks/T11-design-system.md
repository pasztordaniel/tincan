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
- designer: second review round. Headings and the wordmark now use Pacifico 400 (`@fontsource/pacifico`,
  OFL, latin woff2, `size-adjust: 84%`, display line height 1.3); Caveat stays on `/design` as the one
  alternative; Kalam and Patrick Hand removed. Bundle: Pacifico woff2 32.3 kB on every page, Caveat 51.2 kB
  only on `/design`; global CSS 7.08 kB (1.81 kB transfer); initial total 269.86 kB (70.66 kB transfer);
  design-page chunk 23.18 kB. Illustrations: the open end (rolled lip, dark inside) faces away from the
  string, the string leaves the closed bottom; string stroke halved to 1.5; the "e" loop shows only on a
  live line (`live` input on sender and receiver), every other state draws a plain arc, and the fray sits at
  the middle of the arc.
- designer: idle warning and motion round. Sender idle state (banner, `role="timer"` countdown, Keep the line
  open). Hero cans (full-bleed at 360 px, about 78vw on desktop), fluid type scale, soft tinted backdrop with
  a same-origin grain, button and dialog micro-interactions, trust cues on home. String redrawn to the
  maintainer's sketches: low and level from the can bottom into one big cursive "e" loop; the loop shows on
  every open line (dim while waiting), trouble states use a plain low sag; the idle sender keeps the
  one-can framing with scissors near the edge (`IlloLineSnip` folded into `IlloSender`). Motion (CSS and
  WAAPI only, all one-shot, none under reduced motion) listed in docs/design.md and replayable on
  `/design#motion`. Bundle against the previous round: initial 273.16 kB to 279.30 kB (70.75 kB to
  73.22 kB transfer), global CSS 7.08 kB to 11.69 kB (illustration motion lives there once instead of in
  every illustration component), design-page chunk 24.73 kB to 29.46 kB.
- designer: in-review, rebased onto main (T02, T03, T06); the stacked T01 commits are dropped. Runs under
  the T06 policy unchanged: no CSP adjustments were needed. The grain backdrop is a same-origin
  `url('/grain.svg')` (img-src 'self'), Pacifico and Caveat are bundled woff2 (font-src 'self'), motion uses
  classes, `[style.x]` bindings and the Web Animations API (CSSOM, not inline style attributes), and no
  `innerHTML` reaches a Trusted Types sink. `/design` added to `e2e/tests/csp.spec.ts`; a manual pass that
  also fires the frame pulse, the pill change and all seven replays showed no violations. One template fix
  for `noUncheckedIndexedAccess` (pill demo). `npm run verify` green; initial total 280.38 kB (73.63 kB
  transfer) with main's T03/T06 code included.
- qa-tester: QA PASS. Report: [docs/testing/T11.md](../testing/T11.md). Real Chromium on the production build (CSP active), 360 and 1280 px, light and dark: no overflow, console errors or CSP violations; Pacifico loads; theme toggle persists; dialog focus and Esc behave; `/design` states render; reduced motion runs no animations; manual contrast and landmark checks clean (no axe installed). Observation only: the writer caret blink is an infinite animation (docs say all one-shot).
- orchestrator: rebased onto `main` after T04 merged; `npm run verify` green; corrected the motion note in `docs/design.md` (caret blink). PR opened.
