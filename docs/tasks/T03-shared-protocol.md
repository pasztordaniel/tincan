# T03 — Shared protocol contract

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | T01 | in-review | `feat/T03-shared-protocol` |

## Goal
`shared/`: event names, payload types, frame type `{ v, seq, iv, ct }`, plaintext message union
(`text | typing | beat`), limits (sizes, rates, timeouts), AAD builder, base64url helpers, padding bucket constants.
This is the contract that lets client and server lanes run in parallel — keep it small and documented.

## Acceptance
- Matches `docs/architecture.md` (update the doc if it changes).
- Unit tests for AAD format and base64url round-trips.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- senior-dev: claimed
- senior-dev: ready for review.
  - What: `shared/src/` = `constants.ts` (version, limits, timings, buckets, sizes), `base64url.ts` (strict, canonical
    only), `guards.ts` (exact-key object check, id/token/key/iv/ct/seq/ts guards), `events.ts` (event names, error
    codes, payload and ack types, socket.io event maps, validators), `message.ts` (plaintext union + validator),
    `framing.ts` (`buildAad`, `buildAadBytes`, `paddingBucket`). Protocol section of `docs/architecture.md` rewritten
    to match; ADR 0006 (proposed).
  - Contract refinements vs. the earlier doc: message limit 96 KiB instead of 70 KiB (a 64 KiB bucket is ~87.5 KB as
    base64url, see ADR 0006); `ct` must decode to exactly bucket + 16 B; every ack is `{ ok: true, ... }` or
    `{ ok: false, error }`; `frame` has an ack; acks carry no peer state, the server emits `peer` after every
    successful create/join/resume; resume has a single `not_found` error (no token oracle); `seq` starts at 1;
    explicit leave = `socket.disconnect()` (server reason `client namespace disconnect`) -> `peer_left` at once.
    Session ids are 22-char base64url, so they never contain a dot (T05 log note).
  - Padding encode/decode stays in T04 (client crypto): the server never handles plaintext, and the length header +
    zero fill is tested best next to seal/open. Shared only owns the bucket table and `paddingBucket`, because the
    server validates `ct` lengths against it.
  - Tests: 87 unit tests in `shared/test/` (RFC 4648 vectors, round-trips 0..300 bytes and the top bucket, canonical
    trailing bits, every guard with junk values, extra keys, own `__proto__`/`constructor` keys, prototype-carrying
    objects, getters, symbol keys, negative/float/NaN/unsafe seq, every ack shape, worst-case text vs. top bucket).
    `npm run verify` green.
  - For the security reviewer: (1) `hasExactKeys` in `guards.ts` (prototype check, own data properties only,
    descriptor reads), (2) canonical-only base64url decode and the trailing-bit check in `isBase64Url`,
    (3) `CIPHERTEXT_LENGTHS` / `isCiphertext` and the 96 KiB limit (ADR 0006), (4) `buildAad` input validation and
    field separation, (5) resume error collapsing, (6) `MAX_TEXT_LENGTH` worst-case byte math in `constants.ts`.
  - Open questions: idle TTL cannot tell beats from text (by design the relay can't), so a session with an open
    sender tab never idles out; do we want an absolute max session lifetime? Should resume replace a still-attached
    socket for the same slot (token proves identity) or answer `not_found`? Left to T05.
