# T14 — Final README

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| pm | all | in-review | `docs/T14-readme-final` |

## Goal
README: what/why, quick start, architecture summary (link docs), security assumptions, tests and how to run them,
known limitations & future work, AI usage (models/tools, skills, one validated contribution).

## Acceptance
- A newcomer can run, test and understand the security model from the README alone in 5 minutes.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- pm: claimed on `docs/T14-readme-final` from `main` at `b367ba2`. Plan: reproducible demo GIF recorder
  (`e2e/demo/record-demo.ts`, `npm run demo:gif`) and the final README. T13, T15 and T19 land later; their spots in
  the README carry `<!-- TODO(T13/T15/T19) -->` markers.
- pm: demo recorder `e2e/demo/record-demo.ts` (`npm run demo:gif`): production server, sender (light) and receiver
  (dark) contexts at 640x900 recorded with Playwright video, every step waits on UI state (only typing and pauses are
  timed); ffmpeg stacks them side by side, trims and writes `docs/media/demo.gif` (1000x704, 10 fps, 14.7 s, 3.7 MB,
  palettegen/paletteuse, falls back to a narrower width above 4 MB). Frames reviewed: the strings meet at the seam, the
  cut confirm stays in view. Not part of the e2e run (`testDir` is `tests/`), linted and typechecked with `e2e/`.
- pm: README rewritten: what/why, demo, quick start, how it works (Mermaid diagram), security model, tests (counts
  from `main`: unit 93 + 283 + 110, e2e 32), limitations, project workflow, AI usage with three validated
  contributions (T16 Escape race, T17 3 px overflow, T18 circular QR test). `<!-- TODO(T13/T15/T19) -->` markers
  sit where the audit summary, signed frames and updated counts go. Board: T17 synced to done (merged in #21).
  `E2E_PORT=3244 npm run verify` green.
- pm: rebased on `main` 227cc6e (T13 merged, T15 won't do). README: T13 audit summary with a link to
  `docs/security/audit-T13.md`, R-6 in the limitations, signed frames declined (ADR 0009, a leaked link can read but
  not forge), counts from `main` (unit 93 + 297 + 112, e2e 33). Only the `<!-- TODO(T19) -->` markers remain (home
  control and its test counts); the GIF gets re-recorded after T19 merges. `E2E_PORT=3244 npm run verify` green.
- pm: rebased on `main` ba6065f (T19 merged). README: home control in the flow and lifecycle ("Leave and cut the
  line?", Leave sends exactly one leave), counts from `main` (unit 93 + 327 + 112, e2e 41), every TODO marker
  removed, links checked. Demo GIF re-recorded with the home pill (1000x704, 10 fps, 14.7 s, 3.8 MB); the pill covers
  nothing. `E2E_PORT=3244 npm run verify` green.
