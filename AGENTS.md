# AGENTS.md

Guide for anyone — human or AI agent — working on **tincan**. Read this first, then the doc relevant to your task.

## What this is
tincan shares a live-updating text from **one sender to one receiver** through a single link. Text is
end-to-end encrypted in the browser (AES-256-GCM, WebCrypto); the server is a dumb relay that never
sees the key or the plaintext. See [`docs/scope.md`](docs/scope.md).

## Map
| Path | What |
|---|---|
| `client/` | Angular app (sender + receiver views) |
| `server/` | Express + socket.io relay, also serves the built client |
| `shared/` | Wire protocol types and constants used by both sides |
| `e2e/` | Playwright end-to-end tests |
| `docs/` | Scope, architecture, security model, decisions (ADRs), task board, workflow |
| `.claude/agents/` | Agent role definitions (PM, senior dev, dev, QA, security, designer) |
| `.claude/skills/` | Project skills (task workflow, PR gate, crypto review, security audit) |

> Until task T01 lands, `client/`, `server/`, `shared/` and `e2e/` do not exist yet.

## Commands
```bash
npm install          # once, installs every workspace
npm run dev          # client (ng serve) + server (watch), proxied
npm start            # build client, serve everything from one Node process
npm test             # unit tests (all workspaces)
npm run e2e          # Playwright end-to-end tests
npm run lint         # lint + format check + typecheck
npm run verify       # everything CI runs, in CI order
```
Node version: see `.nvmrc` (Node 24 LTS).

## Non-negotiables
1. **The server never gets key material or plaintext.** The key lives only in the URL fragment and in
   browser memory as a non-extractable `CryptoKey`. Never log, persist or send it anywhere.
2. **Never render decrypted text as HTML.** Angular text interpolation only; no `innerHTML`, no
   `bypassSecurityTrust*`.
3. **No third-party runtime scripts** (no CDN, analytics, fonts from remote origins). The CSP enforces this.
4. **Integrity failures are visible, never silent.** A frame that fails authentication, replays an old
   sequence number, or belongs to another session is dropped and surfaced in the UI.
5. Every change to `shared/` protocol or crypto code needs tests and a security review (see `docs/workflow.md`).

## How we work
- Tasks live in [`docs/tasks/`](docs/tasks/README.md). Claim one, branch, implement, test, open a PR.
- Branches: `<type>/<task-id>-<slug>`, e.g. `feat/T04-crypto-core`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) — `feat(crypto): add frame padding`.
  Scopes: `client`, `server`, `shared`, `crypto`, `e2e`, `ci`, `docs`, `deps`, `agents`.
- PRs: use the template; every gate in [`docs/workflow.md`](docs/workflow.md) must pass; a human approves every merge.
- Decisions that change architecture or security get an ADR in `docs/decisions/`.

## Style
- TypeScript strict everywhere. Prefer small pure functions for crypto/protocol code — they are the most tested part.
- Angular: standalone components, signals, `OnPush`. Keep crypto and transport in services, not components.
- Comments explain *why*, not *what*. Language for code, docs and commits: English.
