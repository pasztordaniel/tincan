# T01 — Monorepo scaffold

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | — | in-progress | `chore/T01-monorepo-scaffold` |

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
