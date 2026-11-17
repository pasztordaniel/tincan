/**
 * Pure helpers the crypto layer (client, T04) builds on: the AAD and the padding bucket choice.
 *
 * Padding encode/decode itself lives with the crypto code in the client: only the browsers handle
 * plaintext, and keeping it out of `shared/` keeps it out of the server bundle. The bucket table is
 * shared because the server checks ciphertext lengths against it (`isCiphertext`).
 */

import { AAD_PREFIX, PADDING_BUCKETS } from './constants.js';
import { isSeq, isSessionId } from './guards.js';

/**
 * The AES-GCM additional authenticated data for a frame: `tincan/v1|<sessionId>|<seq>`, with `seq`
 * in plain decimal. It binds a frame to its session and position, so the relay cannot splice frames
 * across sessions or renumber them without breaking the tag.
 *
 * Throws `TypeError` on an invalid session id or seq: both are validated so the separator `|` can
 * never appear inside a field and the string has exactly one parse.
 */
export function buildAad(sessionId: string, seq: number): string {
  if (!isSessionId(sessionId)) throw new TypeError('invalid sessionId');
  if (!isSeq(seq)) throw new TypeError('invalid seq');
  return `${AAD_PREFIX}|${sessionId}|${String(seq)}`;
}

/** `buildAad` as bytes, ready for WebCrypto's `additionalData`. The AAD is ASCII by construction. */
export function buildAadBytes(sessionId: string, seq: number): Uint8Array {
  const aad = buildAad(sessionId, seq);
  const bytes = new Uint8Array(aad.length);
  for (let i = 0; i < aad.length; i++) bytes[i] = aad.charCodeAt(i);
  return bytes;
}

/**
 * The padded size for `byteLength` bytes of header + JSON: the smallest bucket that fits, or
 * `undefined` if it exceeds the largest bucket (the caller must reject the message).
 */
export function paddingBucket(byteLength: number): number | undefined {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) return undefined;
  return PADDING_BUCKETS.find((bucket) => bucket >= byteLength);
}
