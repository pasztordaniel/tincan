# T12 — End-to-end test suite

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| qa-tester | T08, T09 (T10 for lifecycle specs) | backlog | — |

## Goal
Playwright with two browser contexts. Specs: golden path with ≥2 consecutive updates; second receiver refused;
tampered frame (intercept + flip a byte) → warning; replayed frame → ignored; key absent from all requests and
server-visible URLs; reconnect; reload ends session.

## Acceptance
- Runs headless in CI under 2 minutes; no fixed sleeps (wait on UI state).

## Log
<!-- claim, review, security and QA notes go here, newest last -->
