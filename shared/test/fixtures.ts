import { base64UrlEncode } from '../src/base64url.js';
import { GCM_TAG_BYTES } from '../src/constants.js';

/** Bytes filled with a repeating pattern, so encodings are valid and canonical. */
export function filled(length: number, start = 0): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (start + i * 37) & 255);
}

export const SESSION_ID = base64UrlEncode(filled(16, 1));
export const OTHER_SESSION_ID = base64UrlEncode(filled(16, 2));
export const TOKEN = base64UrlEncode(filled(16, 3));
export const IV = base64UrlEncode(filled(12, 4));

/** A ciphertext for a padded plaintext of `bucket` bytes. */
export function ciphertext(bucket = 256): string {
  return base64UrlEncode(filled(bucket + GCM_TAG_BYTES, 5));
}

/** Values of the wrong type for almost any field. */
export const JUNK: readonly unknown[] = [
  undefined,
  null,
  true,
  0,
  -1,
  1.5,
  NaN,
  Infinity,
  '',
  'x',
  {},
  [],
  () => 1,
  Symbol('s'),
  10n,
];

/**
 * Same object with a polluting key added as an own property, the way `JSON.parse` produces it.
 * Plain object-literal `__proto__` would set the prototype instead, which is a different attack.
 */
export function withOwnKey(base: object, key: string, value: unknown = 1): unknown {
  const parsed = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  Object.defineProperty(parsed, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return parsed;
}
