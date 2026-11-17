/**
 * Plaintext framing inside the ciphertext: `[u32 big-endian length][utf-8 JSON][zero bytes]`, padded to
 * the smallest bucket from `PADDING_BUCKETS` that fits. Pure and synchronous; only browsers run it.
 *
 * Decoding is strict and canonical: the length must fit, the bucket must be the smallest one an honest
 * sender would pick, and every padding byte must be zero. Only authenticated plaintext ever reaches
 * `unpadMessage`, so a failure here means a buggy or malicious key holder, not a network error.
 */

import {
  PADDING_BUCKETS,
  PADDING_HEADER_BYTES,
  isPlaintextMessage,
  paddingBucket,
  type PlaintextMessage,
} from '@tincan/shared';

export type PadResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; error: 'invalid_message' | 'too_large' };

export type UnpadResult =
  { ok: true; message: PlaintextMessage } | { ok: false; error: 'bad_padding' | 'bad_message' };

const encoder = new TextEncoder();

/**
 * Serialises a message with `JSON.stringify` (the `MAX_TEXT_LENGTH` worst-case math in `shared/`
 * relies on its escaping) and pads it to its bucket. The message is validated first, so nothing that
 * the receiver would reject is ever encrypted.
 */
export function padMessage(message: PlaintextMessage): PadResult {
  if (!isPlaintextMessage(message)) return { ok: false, error: 'invalid_message' };
  const json = encoder.encode(JSON.stringify(message));
  const bucket = paddingBucket(PADDING_HEADER_BYTES + json.length);
  if (bucket === undefined) return { ok: false, error: 'too_large' };
  const bytes = new Uint8Array(bucket); // zero-filled: the padding
  new DataView(bytes.buffer).setUint32(0, json.length, false);
  bytes.set(json, PADDING_HEADER_BYTES);
  json.fill(0);
  return { ok: true, bytes };
}

/** Reverses `padMessage`. Never throws. */
export function unpadMessage(bytes: Uint8Array): UnpadResult {
  if (!PADDING_BUCKETS.includes(bytes.length)) return { ok: false, error: 'bad_padding' };
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  const end = PADDING_HEADER_BYTES + length;
  // Canonical bucket: an honest sender always picks the smallest one that fits.
  if (end > bytes.length || paddingBucket(end) !== bytes.length) {
    return { ok: false, error: 'bad_padding' };
  }
  for (let i = end; i < bytes.length; i++) {
    if (bytes[i] !== 0) return { ok: false, error: 'bad_padding' };
  }

  let value: unknown;
  try {
    const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(PADDING_HEADER_BYTES, end),
    );
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: 'bad_message' };
  }
  if (!isPlaintextMessage(value)) return { ok: false, error: 'bad_message' };
  return { ok: true, message: value };
}
