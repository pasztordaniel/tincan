# T19 — A way back to the home page

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| designer | T09, T10, T16 | in-review | feat/T19-home-link |

## Goal
Every page except home has a control that takes you back to the home page, without silently cutting an open line.

## Acceptance
- A small home control pinned top-left, mirroring the theme toggle (2.75rem pill, same border and shadow tokens),
  shown on every route except home; no overlap at 360 px, light and dark.
- A real link (`routerLink="/"`), keyboard reachable, visible focus ring, accessible name "tincan home".
- While the line is open (sender: waiting, connected, idle, reconnecting; receiver: after Pick up until ended) the
  link first asks "Leave and cut the line?" inline (Leave / Stay, focus on Stay, Escape backs out, focus returns to
  the link); no browser dialog. Otherwise it navigates at once.
- After leaving the key is gone: the sender session ended and Back cannot restore it (the guard redirects), the
  receiver key dropped and no fragment left. Leaving sends exactly one leave, so the peer sees the line cut.
- `/design` shows the control and the open question; unit and e2e tests; `docs/design.md` and
  `docs/architecture.md` updated.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- designer: claimed
- designer: implemented. `nav/home-link.ts` (`HomeLink`: the pill link plus the question), `nav/leave-confirm.ts`
  (`LeaveConfirm` root service: pages register a "line open" signal with `watch()`; `confirmLeave` `canDeactivate`
  guard on `s` and the receiver route holds an in-app navigation until Leave/Stay). `App` shows the control after the
  first `NavigationEnd` on any URL with a path. The question is the new `ui/inline-confirm` component, now also used
  by `CutLine` (same look and markup; CutLine keeps its trigger, Escape and focus return). No change to the sessions:
  the existing teardown (`SenderPage.ngOnDestroy` → `end()`, `ReceiverSession` destroy → `cleanup()`) already sends
  one leave; the guard only decides whether to ask first. If the line ends while the question is up, the question is
  withdrawn (Stay), so the user sees the ended state before going anywhere.
- designer: decisions. The guard sits in the router rather than in the link's click handler, because `RouterLink`
  navigates regardless of `preventDefault`; this keeps the element a plain `routerLink`. Browser Back/Forward
  (`popstate`) is not held: the URL has already moved, and undoing it fights the history stack; it ends the line like
  closing the tab, as before. "Start a new line" in the ended screens was not added: `LineCutScreen` already has
  "Start a new thread", and the home control now covers the ended live views. `/design` top padding grew so the
  pinned control does not cover its heading.
- designer: tests. Unit: `inline-confirm.spec.ts`, `leave-confirm.spec.ts` (watch/lineOpen, ask/answer, supersede,
  withdraw on end, guard: open/closed/popstate), `app.spec.ts` (hidden on home, link to `/` on `/design`, `/s`, `/r/..`;
  sender waiting/connected/idle/reconnecting asks and neither navigates nor ends; Stay and Escape keep the line and
  refocus the link; Leave navigates and calls `end()` once; ended goes straight home; question withdrawn on end),
  `receiver-page.spec.ts` (open only after Pick up until ended; destroying the live page sends one leave; the gate
  sends nothing), `design-page.spec.ts`. E2E `e2e/tests/home-link.spec.ts`: visibility, sender leaves mid-line (Stay,
  Enter, Escape, then Leave; receiver sees the cut; Back stays home), receiver leaves (sender sees the cut; Back says
  "Link already used", no fragment), no confirm after the line ended, gate goes straight home without joining.
- qa-tester: QA PASS, see [T19 report](../testing/T19.md). Home link verified on every state on both sides, races and reconnect cases, 360/1280/zoom, light and dark; verify green, home-link spec 50/50 with --repeat-each=10. No defects; observations in the report.
