# 0007 - Strict wire validation and a 96 KiB message limit

**Context.** Both ends of the socket are untrusted: the server sees arbitrary sockets, and the client must not trust
the relay. The first draft also set a 70 KiB frame limit next to a 64 KiB largest padding bucket, but `ct` is
base64url, which grows by a third: the largest legitimate frame is 65 552 bytes of ciphertext = 87 403 characters,
about 87.5 KB on the wire. A 70 KiB limit would reject every text in the top bucket.

**Decision.**
- Hand-written validators in `shared/` (no schema library) check every inbound payload and ack: plain objects with an
  exact key set of own data properties, exact types, integer ranges, canonical unpadded base64url with exact lengths.
- A ciphertext is accepted only if it decodes to exactly one padding bucket plus the 16-byte tag. The server rejects
  any other size, so the relay never forwards frames outside the bucket scheme.
- The socket.io message limit (`maxHttpBufferSize`) is 96 KiB instead of 70 KiB. Bucket sizes and the 10 000-character
  text limit stay as they were; every valid text message fits the 64 KiB bucket.

**Consequences.** No extra dependency and one shared definition of "valid" for both sides. Malformed or oversized
input is rejected before any lookup or crypto work. The size limit is ~26 KiB looser per message than planned, still
bounded and rate limited. Alternatives rejected: binary `ct` (changes the base64url contract, socket.io binary
attachments complicate validation) and a 32 KiB top bucket (would need a byte-based text limit).
