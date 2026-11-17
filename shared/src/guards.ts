/**
 * Building blocks for the runtime validators. Every inbound payload is untrusted (the server sees
 * arbitrary sockets, the client sees a possibly malicious relay), so the validators are strict: exact
 * key sets, own data properties only, exact types and ranges.
 */

import { base64UrlLength, isBase64Url } from './base64url.js';
import {
  FIRST_SEQ,
  GCM_TAG_BYTES,
  IV_BYTES,
  KEY_BYTES,
  MAX_SEQ,
  MAX_TIMESTAMP,
  PADDING_BUCKETS,
  SESSION_ID_BYTES,
  TOKEN_BYTES,
} from './constants.js';

/**
 * True if `value` is a plain object (prototype `Object.prototype` or `null`) whose own keys are
 * exactly `required` plus any subset of `optional`, all of them plain data properties (no getters, no
 * symbols). `__proto__`, `constructor` and other unexpected keys are rejected as extra keys.
 */
export function hasExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Reflect.ownKeys(value);
  let seenRequired = 0;
  for (const key of keys) {
    if (typeof key !== 'string') return false;
    const isRequired = required.includes(key);
    if (!isRequired && !optional.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) return false;
    if (isRequired) seenRequired++;
  }
  return seenRequired === required.length;
}

/** Reads an own property already vetted by `hasExactKeys`. */
export function prop(value: Record<string, unknown>, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/** A session id: 128 bits, canonical base64url, 22 characters. */
export function isSessionId(value: unknown): value is string {
  return isBase64Url(value, SESSION_ID_BYTES);
}

/** A sender or receiver token: 128 bits, canonical base64url, 22 characters. */
export function isToken(value: unknown): value is string {
  return isBase64Url(value, TOKEN_BYTES);
}

/** The AES-256 key from the link fragment: 256 bits, canonical base64url, 43 characters. */
export function isKeyString(value: unknown): value is string {
  return isBase64Url(value, KEY_BYTES);
}

/** An AES-GCM IV: 96 bits, canonical base64url, 16 characters. */
export function isIv(value: unknown): value is string {
  return isBase64Url(value, IV_BYTES);
}

/** Base64url lengths of every legal ciphertext: one padding bucket plus the GCM tag. */
export const CIPHERTEXT_LENGTHS: ReadonlySet<number> = new Set(
  PADDING_BUCKETS.map((bucket) => base64UrlLength(bucket + GCM_TAG_BYTES)),
);

/**
 * A ciphertext: canonical base64url whose decoded length is exactly a padding bucket plus the
 * 16-byte tag. Any other length cannot come from an honest sender, so it is rejected before any
 * crypto work and the relay never forwards frames that break the bucket scheme.
 */
export function isCiphertext(value: unknown): value is string {
  return typeof value === 'string' && CIPHERTEXT_LENGTHS.has(value.length) && isBase64Url(value);
}

/** A frame sequence number: an integer in `[FIRST_SEQ, MAX_SEQ]`. */
export function isSeq(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= FIRST_SEQ && (value as number) <= MAX_SEQ
  );
}

/** A timestamp in ms since the epoch: an integer in `[0, MAX_TIMESTAMP]`. */
export function isTimestamp(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TIMESTAMP
  );
}
