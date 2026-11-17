# T04 — Crypto core

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| senior-dev | T03 | in-review | `feat/T04-crypto-core` |

## Goal
Framework-free TS module in `client/`: generate key, export/import as base64url (import non-extractable),
`seal(message, seq)` / `open(frame)` with AES-256-GCM, fresh IV per frame, AAD from T03, size-bucket padding.

## Acceptance (tests)
- Round-trip; two seals of the same text differ (fresh IV); IVs never repeat across 10k frames.
- Any flipped bit in `iv`, `ct`, `seq` or a different `sessionId` → rejected.
- Padding: lengths land on bucket boundaries; oversize input rejected.
- Wrong key → rejected, no partial plaintext.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- senior-dev: claimed. Stacked on `feat/T03-shared-protocol` (PR #10, not merged yet); rebase on `main` once T03 lands.
- senior-dev: implemented, ready for review.
  - What: `client/src/app/crypto/` = `padding.ts` (`padMessage`/`unpadMessage`), `frame-crypto.ts` (`sealFrame`,
    `openFrame`, `FrameSealer`, `FrameOpener`, `INTEGRITY_ERRORS`), `key.ts` (`generateSessionKey`,
    `importKeyString`, `importKeyFromFragment`, `clearFragment`), `crypto.service.ts` (thin root injectable).
    Uses only `@tincan/shared` exports (`buildAadBytes`, `paddingBucket`, `PADDING_BUCKETS`, `isFrame`,
    `isKeyString`, `isPlaintextMessage`, base64url); `shared/` unchanged.
  - Results, not exceptions: every function returns `{ ok: true, ... } | { ok: false, error }`. Seal errors
    `invalid_message`, `too_large`, `invalid_session`, `invalid_seq`, `crypto_failure`; open errors
    `malformed_frame`, `replay`, `auth_failed`, `bad_padding`, `bad_message` (= `INTEGRITY_ERRORS`, for the UI
    warning) plus `invalid_session`, `crypto_failure`; key errors `unsupported`, `missing_key`, `malformed_key`,
    `crypto_failure`. A GCM tag failure (`OperationError`) is `auth_failed`; any other WebCrypto exception is
    `crypto_failure`. Nothing logs.
  - Decisions:
    - Key generation uses `crypto.getRandomValues` + `importKey(extractable: false)` instead of
      `generateKey(extractable: true)` + `exportKey`: same 256 bits from the CSPRNG, but no extractable
      `CryptoKey` ever exists. The bytes are base64url-encoded once for the link, then zeroed.
    - Padding is zero bytes (as documented), not random: it is inside the ciphertext, so its content does not
      leak, and zeros let the receiver check canonicality. Unpadding requires the smallest bucket that fits the
      header length, all-zero padding, fatal UTF-8 (BOM kept and rejected by `JSON.parse`) and
      `isPlaintextMessage`. Seal validates the message with `isPlaintextMessage` first, so a sender never
      encrypts what the receiver would reject. JSON is `JSON.stringify` output (T03's byte math).
    - Open order: `isFrame` -> `seq > lastSeq` -> decrypt -> unpad -> validate. Replay and malformed frames cost no
      crypto work (tested with a `decrypt` spy). `lastSeq` advances only after every check passes.
    - `FrameSealer`/`FrameOpener` serialise calls through a promise chain: a big frame sealed before a small one
      cannot resolve after it (the receiver would drop it as a replay), and two frames arriving together cannot
      both pass the replay check. A failed seal does not consume a seq.
    - The fragment is cleared with `history.replaceState(state, '', pathname + search)` before validation, so a
      malformed key is not left in the address bar either.
  - Tests (`client/src/app/crypto/*.spec.ts`, 49 in the client): round trip of every type; both sides of every
    reachable bucket edge (256 ... 32 768 exactly and +1 byte), ct = bucket + 16; worst-case 10 000-char text in the
    top bucket; typing/beat/short text same size; two seals differ; 10 000 seals, 10 000 distinct IVs; bit flips
    in ct body and tag, iv; renumbered seq; other session; five wrong AADs (+ control); wrong key with no partial
    plaintext; replay/older seq/equal seq without decryption; 16 malformed frames without decryption; authentic
    frames with bad padding/message; usage-restricted keys -> `crypto_failure`; non-extractable keys (`exportKey`
    raw and jwk rejected) on both sides; 14 malformed key strings; missing/malformed fragment cleared; real
    `history`/`location` cleared; WebCrypto absent -> `unsupported`; raw key bytes zeroed; sealer ordering under
    concurrency; opener concurrency and duplicate; console spies assert nothing is logged.
    `E2E_PORT=3197 npm run verify` green.
  - For the security reviewer: (1) `openFrame` error mapping in `frame-crypto.ts` (only `OperationError` counts as
    `auth_failed`; all checks before decrypt), (2) canonical unpadding in `padding.ts`, (3) the promise-chain
    serialisation in `FrameSealer`/`FrameOpener` (`run` is not expected to throw, and the chain swallows a rejection so one failure cannot block later frames), (4)
    key generation without an extractable key and fragment clearing order in `key.ts`, (5) `test-helpers.ts`
    lives in `src/` but is only imported by specs.
  - Residual (not fixable in JS): the base64url key string (sender's link, receiver's `location.hash` copy) and
    decrypted strings are immutable JS strings and cannot be zeroed; only byte buffers are zeroed. The sender
    must keep `keyString` only as long as it shows the link (T08).
  - For T08/T09: create one `FrameSealer`/`FrameOpener` per session via `CryptoService`; show the UI warning for
    `isIntegrityError(error)`; `crypto_failure`/`invalid_session` are local bugs. Call `importKeyFromFragment`
    only after the Open click.
  - Open question: none blocking. `isTimestamp` (T03) accepts any `ts`; staleness/clock-skew policy is T10's.
