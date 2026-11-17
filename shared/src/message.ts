/**
 * Plaintext messages: what the sender encrypts and the receiver gets back after decryption and
 * unpadding. Only the two browsers ever see these; the relay sees only padded ciphertext.
 */

import { MAX_TEXT_LENGTH } from './constants.js';
import { hasExactKeys, isTimestamp, prop } from './guards.js';

/** The full current text (full-state frames, ADR 0002). An empty string means the text was cleared. */
export interface TextMessage {
  t: 'text';
  text: string;
  /** Sender clock, ms since the epoch. */
  ts: number;
}

/** "Sender is typing", at most once per `TYPING_MIN_INTERVAL_MS`. */
export interface TypingMessage {
  t: 'typing';
  ts: number;
}

/** Heartbeat every `BEAT_INTERVAL_MS`, so the receiver can detect a relay withholding frames. */
export interface BeatMessage {
  t: 'beat';
  ts: number;
}

export type PlaintextMessage = TextMessage | TypingMessage | BeatMessage;
export type MessageType = PlaintextMessage['t'];

/** A text that a `text` message may carry: a string of at most `MAX_TEXT_LENGTH` UTF-16 units. */
export function isMessageText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;
}

/**
 * Validates a decrypted, `JSON.parse`d message. `text` is required for `text` messages and forbidden
 * for the others; no other keys are allowed.
 */
export function isPlaintextMessage(value: unknown): value is PlaintextMessage {
  if (hasExactKeys(value, ['t', 'text', 'ts'])) {
    return (
      prop(value, 't') === 'text' &&
      isMessageText(prop(value, 'text')) &&
      isTimestamp(prop(value, 'ts'))
    );
  }
  if (hasExactKeys(value, ['t', 'ts'])) {
    const t = prop(value, 't');
    return (t === 'typing' || t === 'beat') && isTimestamp(prop(value, 'ts'));
  }
  return false;
}
