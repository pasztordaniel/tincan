/**
 * Session key handling: generate (sender), import from the link fragment (receiver), clear the fragment.
 *
 * The only `CryptoKey` that ever exists is non-extractable: the sender draws 32 random bytes, encodes
 * them once for the link and imports them with `extractable: false`; the receiver imports the fragment
 * the same way. Raw bytes are zeroed after import. Nothing here logs, stores or sends the key; failures
 * carry a code only, never the key or the fragment.
 */

import { KEY_BYTES, base64UrlDecode, base64UrlEncode, isKeyString } from '@tincan/shared';

export type KeyError =
  /** WebCrypto is not available (e.g. an insecure, non-HTTPS origin). */
  | 'unsupported'
  /** The link has no fragment. */
  | 'missing_key'
  /** The fragment is not a canonical 43-character base64url 256-bit key. */
  | 'malformed_key'
  /** WebCrypto failed unexpectedly. */
  | 'crypto_failure';

export type KeyResult<T> = { ok: true; value: T } | { ok: false; error: KeyError };

export interface GeneratedKey {
  /** Non-extractable AES-256-GCM key for `encrypt`/`decrypt`. */
  key: CryptoKey;
  /** The same key as base64url, for the link fragment only. */
  keyString: string;
}

const AES_GCM = 'AES-GCM';
const USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

function subtle(): SubtleCrypto | undefined {
  return typeof crypto !== 'undefined' ? crypto.subtle : undefined;
}

/** Imports `raw` non-extractable and zeroes it on every path, including `unsupported`. */
async function importRaw(raw: Uint8Array<ArrayBuffer>): Promise<KeyResult<CryptoKey>> {
  try {
    const s = subtle();
    if (s === undefined) return { ok: false, error: 'unsupported' };
    return { ok: true, value: await s.importKey('raw', raw, AES_GCM, false, USAGES) };
  } catch {
    return { ok: false, error: 'crypto_failure' };
  } finally {
    raw.fill(0);
  }
}

/** Sender: a fresh 256-bit key, imported non-extractable, plus its one-time base64url encoding. */
export async function generateSessionKey(): Promise<KeyResult<GeneratedKey>> {
  if (subtle() === undefined) return { ok: false, error: 'unsupported' };
  const raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const keyString = base64UrlEncode(raw);
  const imported = await importRaw(raw); // zeroes `raw`
  if (!imported.ok) return imported;
  return { ok: true, value: { key: imported.value, keyString } };
}

/** Imports a key string (as found in the fragment) as a non-extractable key. Strictly validated. */
export async function importKeyString(keyString: unknown): Promise<KeyResult<CryptoKey>> {
  if (!isKeyString(keyString)) return { ok: false, error: 'malformed_key' };
  const raw = base64UrlDecode(keyString);
  return importRaw(new Uint8Array(raw.buffer as ArrayBuffer, raw.byteOffset, raw.byteLength));
}

/** The parts of `window.location` / `window.history` the fragment helpers need (injectable for tests). */
export type FragmentLocation = Pick<Location, 'hash' | 'pathname' | 'search'>;
export type FragmentHistory = Pick<History, 'replaceState' | 'state'>;

/**
 * Removes the fragment from the address bar and the current history entry, so the key does not stay
 * visible, in history, or in a later copy of the URL. Path and query are kept.
 */
export function clearFragment(location: FragmentLocation, history: FragmentHistory): void {
  history.replaceState(history.state, '', location.pathname + location.search);
}

/**
 * Receiver: reads the key from the fragment, clears the fragment at once (before validating, so a
 * malformed key is not left in the address bar either) and imports it non-extractable.
 */
export async function importKeyFromFragment(
  location: FragmentLocation,
  history: FragmentHistory,
): Promise<KeyResult<CryptoKey>> {
  const hash = location.hash;
  if (hash !== '') clearFragment(location, history);
  const keyString = hash.startsWith('#') ? hash.slice(1) : hash;
  if (keyString === '') return { ok: false, error: 'missing_key' };
  return importKeyString(keyString);
}
