import { randomBytes, timingSafeEqual } from 'node:crypto';
import { base64UrlEncode, SESSION_ID_BYTES, TOKEN_BYTES } from '@tincan/shared';

/** A fresh 128-bit session id, canonical base64url (22 chars). */
export function newSessionId(): string {
  return base64UrlEncode(randomBytes(SESSION_ID_BYTES));
}

/** A fresh 128-bit sender or receiver token, canonical base64url (22 chars). */
export function newToken(): string {
  return base64UrlEncode(randomBytes(TOKEN_BYTES));
}

/**
 * Constant-time token comparison. Callers pass validated tokens of one fixed length, so the length
 * check never depends on a secret; it only keeps `timingSafeEqual` from throwing.
 */
export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
