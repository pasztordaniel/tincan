# 0009 — No ECDSA-signed frames (for now)

**Status.** Accepted (2026-11-17). T15 closed as "won't do".

**Context.** T15 proposed that the sender generate an ECDSA P-256 key pair, put the public key into the link next to
the AES key, and sign every frame, so that "a leaked link allows reading but not forging, and the relay cannot forge
either". Before building it we asked what a signature adds to *this* protocol, against *these* adversaries
(`docs/security.md`).

What already holds today:
- **The relay cannot forge, splice, replay or reorder.** It never has the AES key (fragment only, ADR 0001), so it
  cannot produce a valid GCM tag. `tincan/v1|<sessionId>|<seq>` in the AAD binds every frame to its session and
  position; the receiver accepts only `seq > lastSeq`. A signature adds nothing here: the relay is already outside
  the key holders.
- **A holder of the leaked link cannot publish.** The link carries `sessionId` and the AES key, never a token.
  The relay forwards frames only from the socket bound to the sender slot (`onFrame` refuses any other role), and
  binding to that slot needs the sender's 128-bit token, which exists only in the sender tab's memory and is
  compared in constant time on resume. A link holder can at most take the single receiver slot, and then they are
  the receiver: there is nobody downstream of them to forge to. If the real receiver is already in, the link holder
  cannot join at all.
- **The harm of a leaked link is reading** (R-2). A signature does not change that: the link still carries the AES
  key.

So the only case a signature closes is **a party that has both the AES key and the ability to inject on the
receiver's socket**, i.e. a leaked link *plus* a malicious or compromised relay (or a bug in the relay's slot check).
In our deployment the relay also serves the JavaScript (R-1): a malicious relay does not need to forge frames, it
can ship code that reads the key (both keys, if there were two) out of either page. Signatures do not survive the
adversary they would be built for. What remains is defence in depth against a relay *bug* that lets a non-sender
socket publish, combined with that socket's owner holding the leaked link. That path is already covered by
server unit tests on the role check and by the strict wire validation (ADR 0007).

What signing would cost:
- **Link and QR.** The raw (uncompressed) P-256 public key is 65 bytes = 87 base64url characters (WebCrypto's `raw`
  import is only reliably the uncompressed point across browsers). A link like
  `https://host/r/<22>#<43>` (about 90 characters) grows to about 180 with a version marker and separator. For the
  QR (byte mode, error correction M) that is roughly version 6 (41×41 modules) to version 9–10 (53–57 modules):
  at the 200 px rendering each module drops from about 4 px to about 3 px, which makes phone scanning off a screen
  noticeably less forgiving. The link is also harder to read back or retype.
- **A second secret on the sender.** A non-extractable `CryptoKey` private key, its lifetime tied to the session,
  wiped with the AES key on every exit path (cut, idle, `pagehide`, bfcache).
- **Protocol v2.** A 64-byte signature per frame, either inside the ciphertext (sign-then-encrypt: changes the
  padded message layout and bucket fit) or beside it (encrypt-then-sign: a new wire field, new strict validators on
  both server and client, a new `v`). Every frame, including typing and heartbeat frames, so the padding scheme
  stays uniform.
- **Work per frame.** ECDSA sign on the sender and verify on the receiver for every frame (at most ~4/s with the
  300 ms debounce, plus typing and beats). Sub-millisecond in practice; not the deciding cost, but it is
  another async step in the ordered receive pipeline, and another failure class to surface (non-negotiable 4).
- **Review surface.** New crypto code, new negative tests, a new fragment parser on the security surface, all for a
  threat that the code-delivery risk already dominates.

**Decision.** Do not sign frames. Keep the protocol at `v1` and the link at `/r/<sessionId>#<key>`.

The real upgrade for R-2 is the one ADR 0001 names: **no secret in the link at all** (ephemeral ECDH with a short
authentication string, or a PAKE). That fixes reading *and* forging for a leaked link and adds forward secrecy,
whereas signatures fix only forging, only for an adversary who can already replace the client code.

**When to revisit.** Signatures become worth their cost if the client code stops being delivered by the relay
(an installable or signed client, or pinned subresources from a separate origin, i.e. R-1 is mitigated), or if the
protocol grows more than one publisher (a group, or a receiver that can reply), so that holding the AES key no
longer implies being the only one who can write. If that happens: encrypt-then-sign over
`v | seq | iv | ct` with the session-bound AAD unchanged, so the receiver can reject a forged frame before
decrypting; ECDSA P-256 / SHA-256 in WebCrypto, IEEE P1363 encoding (64 bytes), public key in the fragment
behind an explicit format version.

**Consequences.** No link, QR, wire or crypto change. `docs/security.md` R-2 states plainly that forging needs the
sender token (or a compromised relay, which already falls under R-1) and records signed frames as conditional
future work.
