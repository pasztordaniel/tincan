/**
 * Protocol constants for tincan wire protocol v1.
 *
 * Everything here is part of the contract between client and server: changing a value is a protocol
 * change and must be reflected in `docs/architecture.md`.
 */

/** Wire protocol version, carried in every frame as `v`. */
export const PROTOCOL_VERSION = 1;

/** Prefix of the AES-GCM additional authenticated data; see `buildAad`. */
export const AAD_PREFIX = 'tincan/v1';

// ---------------------------------------------------------------------------------------------
// Identifiers and secrets. All are random bytes encoded as unpadded base64url
// (`[A-Za-z0-9_-]`, never `.`, so a session id in `/r/<id>` never looks like a file extension).
// ---------------------------------------------------------------------------------------------

/** Session id: 128 random bits. */
export const SESSION_ID_BYTES = 16;
/** Sender and receiver tokens: 128 random bits each. */
export const TOKEN_BYTES = 16;
/** AES-256 key carried in the link fragment. */
export const KEY_BYTES = 32;
/** AES-GCM IV: 96 bits, fresh per frame. */
export const IV_BYTES = 12;
/** AES-GCM authentication tag appended to the ciphertext. */
export const GCM_TAG_BYTES = 16;

/** Base64url length of a session id (22). */
export const SESSION_ID_LENGTH = 22;
/** Base64url length of a sender or receiver token (22). */
export const TOKEN_LENGTH = 22;
/** Base64url length of the key in the link fragment (43). */
export const KEY_LENGTH = 43;
/** Base64url length of an IV (16). */
export const IV_LENGTH = 16;

// ---------------------------------------------------------------------------------------------
// Padding. Plaintext is `[u32 length][utf-8 json][zero bytes]`, padded up to the next bucket, so the
// relay only learns which bucket a frame falls in. Encoding/decoding the padding is client-only
// (T04): the server never sees plaintext.
// ---------------------------------------------------------------------------------------------

/** Size of the big-endian length header in front of the padded JSON. */
export const PADDING_HEADER_BYTES = 4;

/** Allowed padded plaintext sizes in bytes: 256 B, 512 B, ... 64 KiB (powers of two). */
export const PADDING_BUCKETS: readonly number[] = Object.freeze([
  256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536,
]);

/** Largest padded plaintext (64 KiB). */
export const MAX_PADDED_BYTES = 65536;

/** Largest UTF-8 JSON plaintext that fits the largest bucket together with its length header. */
export const MAX_PLAINTEXT_BYTES = MAX_PADDED_BYTES - PADDING_HEADER_BYTES;

/**
 * Maximum text length in UTF-16 code units (what `string.length` and a textarea `maxlength` count).
 *
 * Worst case: `JSON.stringify` writes at most 6 bytes per code unit (`\u0000`-style escapes for
 * control characters and lone surrogates; everything else is at most 3 UTF-8 bytes per code unit).
 * 10 000 * 6 + envelope (< 64 B) + 4 B header = ~60 KB, which always fits the 64 KiB bucket, so a
 * valid text message can never be too large to pad.
 */
export const MAX_TEXT_LENGTH = 10_000;

// ---------------------------------------------------------------------------------------------
// Limits (server-enforced).
// ---------------------------------------------------------------------------------------------

/**
 * Maximum size of one socket.io message in bytes (use as `maxHttpBufferSize`).
 *
 * The largest legitimate frame carries a 64 KiB bucket + 16 B tag as base64url (87 403 chars) plus
 * the IV and JSON envelope, about 87.5 KB. 96 KiB leaves headroom without letting a client push
 * arbitrarily large messages. Within that limit, `isFrame` only accepts ciphertexts whose length is
 * exactly one padding bucket plus the tag.
 */
export const MAX_MESSAGE_BYTES = 96 * 1024;

/** Maximum frames a sender may publish per `FRAME_RATE_WINDOW_MS`. */
export const MAX_FRAMES_PER_WINDOW = 20;
/** Window for `MAX_FRAMES_PER_WINDOW`. */
export const FRAME_RATE_WINDOW_MS = 1000;

/** A session with no frame and no join/resume for this long is ended. */
export const SESSION_IDLE_TTL_MS = 60 * 60 * 1000;

/** How long a disconnected sender or receiver may take to `session:resume` before the session ends. */
export const RECONNECT_GRACE_MS = 20_000;

// ---------------------------------------------------------------------------------------------
// Sending model (client-side timing).
// ---------------------------------------------------------------------------------------------

/** Send a text frame this long after the last keystroke. */
export const TEXT_DEBOUNCE_MS = 300;
/** While typing continuously, send at least this often. */
export const TEXT_MAX_WAIT_MS = 1000;
/** Send at most one `typing` frame per this interval. */
export const TYPING_MIN_INTERVAL_MS = 1000;
/** Send a `beat` frame this often while the session is live. */
export const BEAT_INTERVAL_MS = 5000;
/** The receiver marks the view stale after this long without any authenticated frame. */
export const STALE_AFTER_MS = 15_000;

// ---------------------------------------------------------------------------------------------
// Numeric ranges.
// ---------------------------------------------------------------------------------------------

/** First sequence number a sender uses; the receiver starts with `lastSeq = 0`. */
export const FIRST_SEQ = 1;
/** Largest sequence number (stays exact in a JS number and in the AAD's decimal form). */
export const MAX_SEQ = Number.MAX_SAFE_INTEGER;
/** Largest valid timestamp (ms since epoch), the maximum `Date` value. */
export const MAX_TIMESTAMP = 8.64e15;
