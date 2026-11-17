# T12 — End-to-end test suite

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| qa-tester | T08, T09 (T10 for lifecycle specs) | in-review | `test/T12-e2e-suite` |

## Goal
Playwright with two browser contexts. Specs: golden path with ≥2 consecutive updates; second receiver refused;
tampered frame (intercept + flip a byte) → warning; replayed frame → ignored; key absent from all requests and
server-visible URLs; reconnect; reload ends session.

## Acceptance
- Runs headless in CI under 2 minutes; no fixed sleeps (wait on UI state).

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- qa-tester: implemented `e2e/tests/flow.spec.ts` (golden path with 5 updates, second receiver refused, tampered frame, replayed frame, key absent on both sides) plus helpers `ws-tap.ts` (WebSocket frame tamper/replay) and `two-party.ts`. Reconnect and reload specs are T10's `lifecycle.spec.ts`, not included. Stable over 50 repeated runs (`--repeat-each=10`, parallel) and 25 serial; about 4 s per run. No product bugs found. Docs in `docs/testing/README.md`.
