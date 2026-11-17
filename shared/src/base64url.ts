/**
 * Unpadded base64url (RFC 4648 section 5) for ids, tokens, the key, IVs and ciphertexts.
 *
 * Hand-written instead of `btoa`/`Buffer`/`Uint8Array.fromBase64` so the same strict code runs in the
 * browser and in Node with no platform types. Decoding is strict and canonical: padding, whitespace,
 * the standard `+/` alphabet and non-zero trailing bits are all rejected, so every byte string has
 * exactly one accepted encoding and an attacker cannot produce look-alike variants of an id or a
 * ciphertext.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Character value lookup; -1 marks a character outside the alphabet. */
const VALUES: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

const CHARSET = /^[A-Za-z0-9_-]*$/;

function valueAt(s: string, i: number): number {
  const code = s.charCodeAt(i);
  return code < 128 ? (VALUES[code] ?? -1) : -1;
}

/** Length of the unpadded base64url encoding of `byteLength` bytes. */
export function base64UrlLength(byteLength: number): number {
  const rem = byteLength % 3;
  return Math.floor(byteLength / 3) * 4 + (rem === 0 ? 0 : rem + 1);
}

/** Encodes bytes as unpadded base64url. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[n >>> 18]! + ALPHABET[(n >>> 12) & 63]! + ALPHABET[(n >>> 6) & 63]!;
    out += ALPHABET[n & 63]!;
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[n >>> 18]! + ALPHABET[(n >>> 12) & 63]!;
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[n >>> 18]! + ALPHABET[(n >>> 12) & 63]! + ALPHABET[(n >>> 6) & 63]!;
  }
  return out;
}

/**
 * True if `s` is a canonical unpadded base64url string. With `byteLength`, it must also decode to
 * exactly that many bytes. Never throws, whatever `s` is.
 */
export function isBase64Url(s: unknown, byteLength?: number): s is string {
  if (typeof s !== 'string') return false;
  if (byteLength !== undefined && s.length !== base64UrlLength(byteLength)) return false;
  const rem = s.length % 4;
  if (rem === 1) return false;
  if (!CHARSET.test(s)) return false;
  if (rem === 0) return true;
  // The last character carries 4 (rem 2) or 2 (rem 3) unused low bits; canonical encodings zero them.
  const last = valueAt(s, s.length - 1);
  return (last & (rem === 2 ? 0x0f : 0x03)) === 0;
}

/** Decodes canonical unpadded base64url. Throws `TypeError` on anything else. */
export function base64UrlDecode(s: string): Uint8Array {
  if (!isBase64Url(s)) throw new TypeError('invalid base64url');
  const rem = s.length % 4;
  const out = new Uint8Array(Math.floor(s.length / 4) * 3 + (rem === 0 ? 0 : rem - 1));
  let o = 0;
  let i = 0;
  for (; i + 3 < s.length; i += 4) {
    const n =
      (valueAt(s, i) << 18) |
      (valueAt(s, i + 1) << 12) |
      (valueAt(s, i + 2) << 6) |
      valueAt(s, i + 3);
    out[o++] = n >>> 16;
    out[o++] = (n >>> 8) & 255;
    out[o++] = n & 255;
  }
  if (rem === 2) {
    out[o] = (valueAt(s, i) << 2) | (valueAt(s, i + 1) >>> 4);
  } else if (rem === 3) {
    const n = (valueAt(s, i) << 18) | (valueAt(s, i + 1) << 12) | (valueAt(s, i + 2) << 6);
    out[o++] = n >>> 16;
    out[o] = (n >>> 8) & 255;
  }
  return out;
}
