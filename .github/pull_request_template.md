## What
<!-- One or two sentences. Link the task: Closes T0x -->

## Why
<!-- The decision behind it; link an ADR if one was added -->

## How it was verified
- [ ] `npm run verify` green locally
- [ ] Unit tests added/updated for new behaviour
- [ ] QA walkthrough in a real browser (golden paths) — notes in the task log
- [ ] `/code-review` findings addressed

## Security
- [ ] Touches security surface (crypto, protocol, socket handlers, headers, URL/storage, deps)? If yes:
  - [ ] `/security-review` + `crypto-review` run, findings addressed
  - [ ] `docs/security.md` still accurate
- [ ] No key material, plaintext or frames logged; no `innerHTML` / `bypassSecurityTrust*`

## Notes for the reviewer
<!-- Trade-offs, follow-ups, screenshots -->
