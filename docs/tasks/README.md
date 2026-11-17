# Task board

Status values: `backlog` → `ready` → `in-progress` → `in-review` → `qa` → `pr-open` → `done` (or `blocked`).
The PM owns this table; agents update their own task file's status/branch and log, then the PM syncs the table.

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| [T01](T01-monorepo-scaffold.md) | Monorepo scaffold | senior-dev | — | done |
| [T02](T02-ci-pipeline.md) | CI pipeline + branch protection | dev | T01 | done |
| [T03](T03-shared-protocol.md) | Shared protocol contract | senior-dev | T01 | done |
| [T04](T04-crypto-core.md) | Crypto core | senior-dev | T03 | done |
| [T05](T05-relay-server.md) | Relay server | dev | T03 | done |
| [T06](T06-security-headers.md) | Security headers + static serving | dev | T01 | done |
| [T07](T07-relay-client.md) | Client relay service | dev | T03 | done |
| [T08](T08-sender-view.md) | Sender view | dev | T04, T07, T11 | done |
| [T09](T09-receiver-view.md) | Receiver view | dev | T04, T07, T11 | done |
| [T10](T10-lifecycle-and-staleness.md) | Disconnect, resume, staleness | dev | T05, T08, T09 | done |
| [T11](T11-design-system.md) | Design system + logo | designer | T01 | done |
| [T12](T12-e2e-suite.md) | End-to-end suite | qa-tester | T08, T09 | done |
| [T13](T13-security-pass.md) | Security review + audit | security-pentester | continuous | done |
| [T14](T14-readme-final.md) | Final README | pm | all | backlog |
| [T15](T15-signed-frames.md) | Stretch: signed frames | senior-dev | T04 | won't do (see [ADR 0009](../decisions/0009-signed-frames.md)) |
| [T16](T16-cut-the-line.md) | Cut the line button | dev | T08, T09, T10 | done |
| [T17](T17-string-to-edge.md) | String to the viewport edge | designer | T11, T08, T09 | done |
| [T18](T18-qr-code.md) | Receiver link as a QR code | dev | T08 | done |
| [T19](T19-home-link.md) | A way back to the home page | designer | T09, T10, T16 | in-review |

## Parallel lanes
```
T01 ─┬─ T02 (CI)
     ├─ T06 (headers)
     ├─ T11 (design) ────────────────┐
     └─ T03 (protocol) ─┬─ T04 (crypto) ─┬─ T08 (sender) ─┬─ T10 ─ T12 ─ T13 ─ T14
                        ├─ T05 (server) ─┼───────────────┤
                        └─ T07 (client relay) ─ T09 (receiver)
```
After T01: up to four lanes at once (T02, T03, T06, T11). After T03: T04, T05, T07 in parallel.
