---
name: crypto-review
description: tincan-specific checklist for reviewing crypto, protocol, transport and key-handling code. Use alongside /security-review on any change to client crypto/relay code, shared/, server socket handlers, headers, or anything touching the URL, storage or clipboard.
---
# crypto-review

Check each item against the diff and the code it touches; report `PASS`, `FAIL (file:line, why, fix)` or `N/A`.

## Key handling
- [ ] Key generated with `crypto.getRandomValues` / `generateKey`, 256 bits.
- [ ] Imported with `extractable: false` on the receiver; sender exports only once to build the link.
- [ ] Key only in the URL fragment and memory: never in path/query, socket payloads, logs, storage, error messages, analytics.
- [ ] Receiver clears the fragment (`history.replaceState`) immediately after reading it.

## Encryption
- [ ] AES-GCM, 96-bit IV from CSPRNG, **new IV per frame**, never derived from seq/time.
- [ ] AAD = `tincan/v1|<sessionId>|<seq>`, built by the shared helper on both sides.
- [ ] Padding applied before encryption to all frame types; length prefix validated on open; zero padding checked.

## Receiving
- [ ] Decrypt failure → frame dropped, UI warning, last good text kept; no partial/unauthenticated data used.
- [ ] `seq` must be strictly greater than last accepted; equal/lower dropped (replay/reorder).
- [ ] Decoded JSON validated (type, field types, sizes) before use; unknown types ignored.
- [ ] Text rendered by interpolation only.
- [ ] Stale detection relies on encrypted timestamps, not server-provided ones.

## Relay / server
- [ ] Only the sender-token socket can publish; receiver socket is receive-only; one receiver per session.
- [ ] Tokens/ids are 128-bit random, compared in constant time, never logged.
- [ ] Size and rate limits enforced before forwarding; session TTL and cap present.
- [ ] Server never parses or logs frame contents.

## Web platform
- [ ] CSP `default-src 'self'` without `unsafe-inline`/`unsafe-eval`; `connect-src` limited to self; `frame-ancestors 'none'`.
- [ ] `Referrer-Policy: no-referrer`; no third-party requests (check the network tab in e2e).
- [ ] New dependencies justified; no install scripts unless reviewed.

## Tests
- [ ] Each control above that changed has a negative test (tamper, replay, wrong session, publish-as-receiver, oversize).
