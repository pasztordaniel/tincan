---
name: security-audit
description: Local-only, attacker's-eye security audit of one or more repos (app + infra). Runs pinned scanners in network-isolated Docker (gitleaks, trivy, semgrep, checkov), then fans out parallel review agents (supply chain, app attack surface, secrets, infra, CI/CD + AI-agent config) and verifies findings into one ranked report. Use when the user invokes /security-audit, asks for a security scan/audit/pentest-style review, or asks about CVEs, leaked secrets, unprotected routes, weak passwords, or infra attack vectors.
argument-hint: "[extra paths…] [--update-db]"
---

# security-audit

Full static security audit. Assume a capable, AI-assisted attacker who already has the public internet,
one leaked credential, or one poisoned npm package. Find what they would use.

## Invocation

```
/security-audit                       # current repo (+ paths from CLAUDE.md, see below)
/security-audit ../sk-infra ../api    # current repo + extra paths
/security-audit --update-db           # refresh images, vuln DB, rules (only networked step), then stop
```

- The current working repo is **always** in scope. Extra args are more paths.
- If the project's `CLAUDE.md` has a line `security-audit: also scan <path> [<path>…]`, add those paths too.
- Detect each path's type from its files (`package.json`/lockfiles → app, `*.tf` → terraform,
  `kustomization.y*ml`/k8s YAML/Helm → kubernetes, `.github/workflows` → CI, `Dockerfile` → container).

## Hard rules: local only

1. **No network from the audit.** Scanners run with `docker run --network none`. Agents must NOT:
   curl/fetch staging or production hosts, use WebFetch or WebSearch, call `gh`, `kubectl`, `gcloud`, `aws`, `az`,
   `terraform plan/apply`, `npm`/`pnpm install` or `audit`, or anything else that leaves the machine.
   Static reading only. The only networked step is `scan.sh --update-db`.
2. **Never verify a secret by using it.** Never test a found key against its provider.
3. **Read-only.** Don't modify the audited repos (except adding `.security-audit/` to `.gitignore`).
   Don't decrypt SOPS or encrypted env files.
4. **Redact.** In any output, show a secret only as its first 4 chars + `…`, plus file:line and the type.

## Step 1: scanners

```bash
SKILL="$(git rev-parse --show-toplevel)/.claude/skills/security-audit"
OUT=<first repo>/.security-audit/$(date +%F)
[ -f ~/.cache/security-audit/updated-at ] || $SKILL/scan.sh --update-db   # tell the user: one-time download
$SKILL/scan.sh "$OUT" <repo> [<path>…]
```

If the cache is older than 7 days (`~/.cache/security-audit/updated-at`), ask whether to run `--update-db` first.
If Docker isn't running, say so and continue with agent review only, marking scanner coverage as missing.

Outputs land in `$OUT/raw/<name>/`:

| File | What it covers |
|---|---|
| `gitleaks-history.json` | Secrets in the full git history |
| `gitleaks-tree.json` | Secrets in the working tree |
| `trivy.json` | Dependency CVEs (lockfiles), IaC misconfigurations, secrets |
| `semgrep.json` | SAST |
| `checkov/results_json.json` | Terraform, Kubernetes, Dockerfile, GitHub Actions, OpenAPI |
| `agent-config.txt` | AI-agent/editor config inventory, plus hidden-Unicode hits |

`$OUT/src/<name>/` is the tracked-files snapshot the scanners saw. The raw JSON files are large, so agents
summarise them with `python3`/`jq` instead of reading them whole.

## Step 2: parallel review agents

Launch these in **one message** (parallel), `subagent_type: general-purpose`. Skip a lane whose target type
isn't present (e.g. no infra lane without terraform or k8s). For a large monorepo, split lane B by app.
Give each agent: the absolute repo paths, `$OUT/raw` path, its checklist below, the hard rules above verbatim,
and this output contract:

> Return findings as a markdown list. For each: `severity` (Critical/High/Medium/Low), `title`, `location`
> (abs path:line), `evidence` (short snippet, secrets redacted), `attack` (how it's exploited, concretely),
> `fix`, `confidence` (high/medium/low). Prefer few verified findings over many guesses. Mark scanner noise
> (test fixtures, dev-only, unreachable code) as dismissed, with the reason, in a short trailing list.

### A. Dependencies & supply chain
- trivy vulns: group by package, keep Critical/High, and say whether the vulnerable package is **reachable**
  (prod dependency? imported? server-side vs. build-only?). Fixed version available?
- Lockfiles: deps resolved from git/tarball URLs, recently added transitive deps, typosquat-looking names,
  packages named in code/skills that don't exist in the lockfile (slopsquatting).
- Install-time code: `preinstall`/`postinstall`/`prepare` scripts in root and workspace packages; pnpm
  `onlyBuiltDependencies`/`allowBuilds`/`strictDepBuilds`, `ignore-scripts`, `minimumReleaseAge`/`min-release-age`.
- Package manager config actually being applied (e.g. pnpm ≥10 ignores `pnpm.*` in package.json, so overrides and
  patches there are silently dropped). `.npmrc` registries, auth tokens.
- `patches/` contents, vendored/minified third-party code.

### B. Application attack surface
- Enumerate **every** route/handler/resolver/server action/RPC/webhook/cron/queue consumer. For each: is auth
  enforced, and is **authorization** (ownership, role, tenant) checked server-side? Flag IDOR, admin routes,
  debug/health/metrics/swagger/graphql-introspection endpoints exposed in prod.
- Auth: password hashing algorithm & cost, password policy, default/seeded/hardcoded credentials, brute-force
  and rate limiting, JWT (alg, secret strength, expiry, verification), session/cookie flags, OAuth
  redirect/state validation, password reset token entropy and expiry, account enumeration.
- Injection: SQL/NoSQL/raw queries, ORM raw escapes, command exec, path traversal, SSRF (user-controlled URLs,
  image proxies, webhooks), XXE, template injection, prototype pollution, unsafe deserialization, regex DoS.
- Web: XSS (`dangerouslySetInnerHTML`, unsanitised markdown/HTML), CORS (wildcard + credentials, reflected
  origin), CSRF, open redirects, security headers/CSP, file upload (type, size, storage location, served as HTML?).
- Data exposure: over-broad API responses (password hashes, emails, tokens), verbose errors/stack traces,
  logging of secrets/PII, client bundles containing server-only env vars (`NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, etc.).
- LLM/AI features: prompt injection paths into tools, tool permissions, user content reaching system prompts,
  unbounded token spend (cost DoS), model output rendered as HTML, retrieval leaking other users' data.
- Mobile apps: secrets in app config, cert pinning, deep-link handling, insecure storage.
- semgrep ERROR/WARNING results: triage each and keep the real ones.

### C. Secrets
- gitleaks history and tree results plus trivy secrets: classify each as live-looking / test / revoked-format. A
  secret in history is still leaked after deletion, so say it needs rotation.
- `.env*` files: which are tracked vs. ignored (`git ls-files`, `git check-ignore`), `.env.example` holding real
  values, encrypted env files (SOPS etc.) sitting next to plaintext copies, `.sops.yaml` key config.
- Hardcoded keys in source, CI files, Dockerfiles (`ARG`/`ENV`), k8s manifests, terraform vars/state
  (`*.tfstate` committed?), mobile config, test fixtures that use real keys.
- Weak or shared secrets: short JWT secrets, default DB passwords in compose/manifests, the same secret
  reused across environments.

### D. Infrastructure (terraform / k8s / gateway): read app + infra together
- Public exposure: which services, DBs, caches, search clusters, admin UIs, and dashboards are reachable from
  the internet (LoadBalancer/NodePort/Ingress, public IPs, firewall `0.0.0.0/0`, authorized networks)?
- Gateway (Kong/nginx/ingress): routes without auth plugins, admin API exposure, rate limiting, IP allowlists,
  TLS. **Cross-check with the app:** routes the app treats as internal but the gateway exposes.
- IAM: overly broad roles (owner/editor/`*`), long-lived service account keys, workload identity, CI deploy
  credentials' scope.
- k8s: privileged/root containers, missing securityContext/resources, hostPath, `automountServiceAccountToken`,
  RBAC wildcards, NetworkPolicies (none = flat network), secrets as plain ConfigMaps/env, image tags `latest`.
- Data: DB/bucket encryption, public buckets, backups, deletion protection, TLS to DB, logging/audit enabled.
- Terraform state backend security, providers/modules pinned, secrets in `*.tfvars`.
- checkov/trivy misconfigs: triage, keep the real ones.

### E. CI/CD & AI-agent config (2026 attacks)
- GitHub Actions: `pull_request_target`/`workflow_run` running untrusted code, script injection via
  `${{ github.event.* }}` in `run:`, actions pinned by tag instead of SHA (tags get hijacked; see the Trivy
  trivy-action compromise, Mar 2026), `permissions:` missing or write-all, secrets exposed to fork PRs,
  self-hosted runners, artifact/cache poisoning, OIDC trust conditions.
- Persistence IoCs (Mini Shai-Hulud, May 2026): `SessionStart`/`PreToolUse`/other hooks in `.claude/settings*.json`
  and `~/.claude/settings.json`, `folderOpen` tasks in `.vscode/tasks.json`, unknown MCP servers in `.mcp.json`,
  `.cursor/`, `~/.claude.json`, stray `.mjs/.js/.sh` under `.vscode/` or `.claude/`. Report every hook
  command verbatim and whether it looks legitimate.
- Instruction poisoning (TrapDoor): hidden/bidi Unicode hits from `agent-config.txt`; inspect each one
  (`sed -n 'Np' file | od -c`). Also instructions in CLAUDE.md/AGENTS.md/skills/commands that exfiltrate,
  disable checks, or run remote code (`curl | sh`, `npx <unknown>`).
- Agent permissions: `settings*.json` allow-lists that permit arbitrary Bash, network, or writes outside the repo.
- Third-party skills/commands in the repo: provenance, what they execute.

## Step 3: verify and report

1. Merge the lane outputs and dedupe (same root cause = one finding, multiple locations).
2. **Verify every Critical/High yourself** by reading the cited code: drop or downgrade anything that doesn't
   hold. If there are more than ~15, spawn one verifier agent with the list and the code paths, and tell it
   to try to *disprove* each one.
3. Write `$OUT/report.md` and make sure `.security-audit/` is in the first repo's `.gitignore`:

```markdown
# Security audit: <repos> (<date>)
Scope, scanner versions, cache date, coverage gaps (lanes skipped, scanners failed).

## Do first
Ordered actions. If any persistence IoC was found: remove the persistence BEFORE rotating credentials
(some 2026 payloads wipe the disk when their token is revoked).

## Findings
| # | Sev | Title | Location | Confidence |
then one section per finding: evidence (redacted), attack scenario, fix.

## Dismissed
Scanner noise and why (one line each).
```

4. In chat: totals by severity, the top 5 findings in one line each, the "do first" list, and the report path.
   Don't paste the whole report.
