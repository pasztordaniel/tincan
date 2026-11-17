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
    to match; ADR 0007 (proposed).
  - Contract refinements vs. the earlier doc: message limit 96 KiB instead of 70 KiB (a 64 KiB bucket is ~87.5 KB as
    base64url, see ADR 0007); `ct` must decode to exactly bucket + 16 B; every ack is `{ ok: true, ... }` or
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
    (3) `CIPHERTEXT_LENGTHS` / `isCiphertext` and the 96 KiB limit (ADR 0007), (4) `buildAad` input validation and
    field separation, (5) resume error collapsing, (6) `MAX_TEXT_LENGTH` worst-case byte math in `constants.ts`.
  - Open questions: idle TTL cannot tell beats from text (by design the relay can't), so a session with an open
    sender tab never idles out; do we want an absolute max session lifetime? Should resume replace a still-attached
    socket for the same slot (token proves identity) or answer `not_found`? Left to T05.
- senior-dev review (`/code-review` on `origin/main...HEAD`): approve.
  - Correctness: base64url encode/decode, `CIPHERTEXT_LENGTHS` (363 ... 87 403, all 9 distinct), `paddingBucket`,
    `buildAad` and every validator checked by hand and by a local differential fuzz against Node's `Buffer`
    (200 000 random strings, 0 mismatches). Validators are linear in input size; the only regex is the anchored
    character class `^[A-Za-z0-9_-]*$` (no backtracking), and `isCiphertext` checks the length before scanning.
  - Fixed: ADR renumbered 0006 -> 0007 (T06 owns 0006), all references updated; status stays Proposed until the
    maintainer accepts the 96 KiB limit. Added an exhaustive canonicality property test (every 2- and 3-char
    string), restored an index test (barrel exports, `*_LENGTH` vs `*_BYTES`, largest frame packet ~87.5 KB fits
    `MAX_MESSAGE_BYTES` with ~10.8 KB headroom), corrected a misleading proxy comment in `guards.spec.ts`.
  - Nits, not fixed: `hasExactKeys` could reject early on `keys.length > required + optional` (inputs are bounded by
    the message limit, so not needed); `isTimestamp(-0)` is accepted (harmless).
- security review (`/security-review` + `crypto-review` on `origin/main...HEAD`): approve, no exploitable finding.
  - (1) `hasExactKeys`: prototype must be `Object.prototype` or `null`; own `__proto__`/`constructor` from
    `JSON.parse` rejected; getters, symbols and non-enumerables rejected; values read via descriptors. A `Proxy`
    could still answer differently on later reads, but wire input is always `JSON.parse` output, never a proxy (info).
  - (2) base64url: padding, `+/`, whitespace, non-ASCII, `4n+1` lengths and non-zero trailing bits rejected; empty
    string is the valid encoding of 0 bytes and every fixed-length guard rejects it. One accepted string per byte
    string, so ids, tokens and ciphertexts have no look-alike variants.
  - (3) `ct` must be exactly bucket + 16 B; the relay cannot forward off-bucket sizes. 96 KiB limit: the worst-case
    `frame` packet is 87 486 B, so a smaller limit would break the top bucket and a larger one buys nothing (ADR 0007).
  - (4) AAD is injective: fixed prefix without `|`, session id exactly 22 chars of `[A-Za-z0-9_-]`, seq an integer in
    `[1, 2^53 - 1]` whose `String()` is plain decimal without leading zeros or exponent. No two (session, seq)
    pairs share an AAD.
  - (5) Resume: one `not_found` for unknown session, wrong token and expired grace removes the protocol-level
    token oracle (`bad_request` depends only on format). For T05: compare tokens in constant time, check both
    slots with the same work whether or not the session exists, and emit `peer` only after success. Recommend
    resume replaces a still-attached socket for the same slot (the token proves identity; answering `not_found`
    would break a reconnect that beats the server's ping timeout).
  - (6) `MAX_TEXT_LENGTH`: `JSON.stringify` emits at most 6 B per UTF-16 unit (`\uXXXX` for controls and lone
    surrogates, else <= 3 B), so 10 000 units + 44 B envelope + 4 B header = 60 048 B <= 65 536. Holds only if T04
    serialises with `JSON.stringify`.
  - Notes for T05: `JOIN_ERRORS`/`RESUME_ERRORS` have no `rate_limited`, so floods of join/resume are handled by
    dropping or disconnecting the socket; reject socket.io binary attachments (they decode to non-strings and fail
    `isFrame` anyway); treat the ack argument as untrusted.
  - crypto-review checklist: AAD format and shared builder PASS; replay range (`seq >= 1`, safe integer) PASS;
    decoded JSON validation (`isPlaintextMessage`, unknown types rejected) PASS; size limits defined PASS; IV
    length and key length guards PASS; key handling, IV generation, padding encode/decode, relay auth, headers N/A
    (T04/T05/T06). Negative tests present for every validator.
- maintainer decisions (2026-11-17), folded in by the reviewer:
  - ADR 0007 accepted (96 KiB message limit).
  - Idleness: the sender's client warns at `IDLE_WARNING_MS` (9 min) and cuts at `IDLE_CUT_MS` (10 min) after the last
    text change or "keep line open" action (local reason `idle`, explicit leave, receiver sees `peer_left`). Server
    backstops: `SESSION_IDLE_TTL_MS` lowered to 15 min (no frames at all), new `MAX_SESSION_LIFETIME_MS` = 2 h; both
    end with `idle`. Receiver logic unchanged.
  - Resume with a valid token replaces a socket still attached to the same slot; the server disconnects the old one
    (network switch). Contract for T05 in `events.ts` and `docs/architecture.md`; answers the open question above.
