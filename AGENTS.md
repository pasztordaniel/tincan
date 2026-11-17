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

## Commands
```bash
npm install          # once, installs every workspace and builds shared/ (prepare script)
npx playwright install chromium   # once, browser for the e2e tests
npm run dev          # shared (tsc watch) + server (tsx watch, :3000) + client (ng serve, :4200, proxies /socket.io)
npm run build        # shared, then client, then server
npm start            # build, then serve client + socket.io from one Node process (PORT, default 3000)
npm test             # unit tests (Vitest in shared, client, server)
npm run e2e          # build, then Playwright end-to-end tests (Chromium, server on E2E_PORT, default 3100)
npm run test:e2e     # Playwright only, against the existing build
npm run lint         # ESLint (incl. angular-eslint, type-aware promise rules) + Prettier check + typecheck
npm run format       # Prettier write + ESLint autofix
npm run verify       # lint, test, build, e2e (one build): everything CI runs, in CI order
npm run demo:gif     # build, then record docs/media/demo.gif (needs ffmpeg; not part of verify)
```
Dev uses fixed ports: do not set `PORT` for `npm run dev`, because `ng serve` reads it too.

Node version: `engines` allows `^22.22.3 || ^24.15.0 || >=26` (the range Angular 22 supports; Node 25 is not
supported). `.nvmrc` pins the version we develop on, Node 24 LTS (`24.22`).
`shared/` is consumed through its compiled `dist/`; `npm run dev` rebuilds it on change, and `build`, `test` and
`lint` rebuild it first.

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
