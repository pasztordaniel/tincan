/** Test-only helpers for the crypto specs. Not imported by application code. */

import {
  PADDING_HEADER_BYTES,
  SESSION_ID_BYTES,
  base64UrlDecode,
  base64UrlEncode,
  type Frame,
  type TextMessage,
} from '@tincan/shared';

export function randomSessionId(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(SESSION_ID_BYTES)));
}

export function newKey(usages: KeyUsage[] = ['encrypt', 'decrypt']): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    crypto.getRandomValues(new Uint8Array(32)),
    'AES-GCM',
    false,
    usages,
  );
}

const EMPTY_TEXT_JSON_BYTES = new TextEncoder().encode(
  JSON.stringify({ t: 'text', text: '', ts: 0 }),
).length;

/**
 * A text message whose header + JSON is exactly `size` bytes. Uses U+0001, which `JSON.stringify`
 * writes as the 6-byte escape `\u0001`, to reach large sizes within `MAX_TEXT_LENGTH`.
 */
export function textMessageOfPaddedSize(size: number): TextMessage {
  const textBytes = size - PADDING_HEADER_BYTES - EMPTY_TEXT_JSON_BYTES;
  if (textBytes < 0) throw new Error('size too small');
  const text = '\u0001'.repeat(Math.floor(textBytes / 6)) + 'a'.repeat(textBytes % 6);
  return { t: 'text', text, ts: 0 };
}

/** Flips one bit of a base64url field's decoded bytes and re-encodes it canonically. */
export function flipBit(field: string, byteIndex: number, bit = 0): string {
  const bytes = base64UrlDecode(field);
  const i = byteIndex < 0 ? bytes.length + byteIndex : byteIndex;
  bytes[i] = bytes[i]! ^ (1 << bit);
  return base64UrlEncode(bytes);
}

/** Encrypts arbitrary plaintext bytes with an arbitrary AAD string, bypassing `sealFrame`. */
export async function encryptRaw(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  aad: string,
  seq: number,
): Promise<Frame> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad), tagLength: 128 },
    key,
    plaintext,
  );
  return { v: 1, seq, iv: base64UrlEncode(iv), ct: base64UrlEncode(new Uint8Array(ct)) };
}

/** `[u32 length][bytes][zeros]` padded to `total`, with an optionally wrong header length. */
export function rawPadded(
  json: Uint8Array,
  total: number,
  headerLength = json.length,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, headerLength, false);
  out.set(json, PADDING_HEADER_BYTES);
  return out;
}
