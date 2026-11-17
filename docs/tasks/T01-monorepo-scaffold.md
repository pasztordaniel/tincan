# T01 — Monorepo scaffold

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | — | in-review | `chore/T01-monorepo-scaffold` |

## Goal
npm workspaces with `client/` (Angular, latest stable, standalone + signals), `server/` (Express + socket.io, TS),
`shared/`, `e2e/` (Playwright). Root scripts: `dev`, `start`, `test`, `e2e`, `lint`, `verify`. ESLint + Prettier,
strict TS, `engines` + `.nvmrc`.

## Acceptance
- Fresh clone → `npm install && npm start` serves a placeholder page from one port.
- `npm run dev` runs client + server with a proxy for socket.io.
- `npm run verify` passes. Dependencies kept minimal and justified in the PR.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- senior-dev: claimed
- senior-dev: ready for review.
  - Changed: npm workspaces `shared`, `client`, `server`, `e2e`; root scripts `dev`, `build`, `start`, `test`, `e2e`,
    `lint`, `typecheck`, `format`, `verify`; flat ESLint (typescript-eslint + angular-eslint) and Prettier at the root;
    shared `tsconfig.base.json` (strict). Client: Angular 22.2 via CLI (standalone, routing, SCSS, no SSR, strict,
    Vitest), OnPush placeholder page rendering `APP_NAME` from `@tincan/shared`, `/socket.io` dev proxy with `ws`.
    Server: Express 5 + socket.io 4, `createTincanServer()` factory, static client + SPA fallback, `/healthz`, empty
    connection handler, `PORT` (default 3000), `tsx watch` / `tsc`. E2E: Playwright Chromium smoke test, `webServer`
    runs `npm start` on port 3100.
  - Shared package: compiled by `tsc` to `dist/` and consumed via package `exports`; root `prepare` builds it on
    install, `dev` watches it, `build`/`test`/`typecheck` rebuild it first. Chosen over source-only `.ts` exports
    because the server `tsc` build and plain `node dist/` cannot consume raw TS from another package reliably.
  - Tested: clean `npm install` then `npm run verify` green (shared 1, client 2, server 3 unit tests; e2e 1 passed).
    `npm start` with PORT=3210: `/` 200 with title tincan, `/r/abc` 200 (fallback), `/nope.js` 404, `/healthz` 200,
    socket.io polling handshake OK. `npm run dev`: `:4200` serves the app, `/socket.io` polling and WebSocket upgrade
    (101) pass through the proxy to `:3000`.
  - Open questions: npm 11 `allowScripts` skips install scripts of esbuild, @parcel/watcher, lmdb and
    msgpackr-extract, and everything still works without them. (The `engines` question is settled: `engines.node`
    is now `^22.22.3 || ^24.15.0 || >=26`, the range Angular 22 supports, and `.nvmrc` is `24.22`.)
