/**
 * Frame encryption: `sealFrame` / `openFrame` (pure, stateless) and `FrameSealer` / `FrameOpener`
 * (per-session state: next seq, last accepted seq, and serialisation of the async WebCrypto calls).
 *
 * - AES-256-GCM, 128-bit tag, fresh random 96-bit IV per frame (never derived from seq or time).
 * - AAD = `buildAadBytes(sessionId, seq)`, so a frame cannot be moved to another session or renumbered.
 * - Plaintext = `padMessage(message)`, so every frame type lands on the same bucket sizes.
 *
 * Every failure is a typed result; no `DOMException` or other raw error reaches the caller. Nothing is
 * logged: keys, plaintext and frames must never reach a console or telemetry.
 */

import {
  FIRST_SEQ,
  IV_BYTES,
  PROTOCOL_VERSION,
  base64UrlDecode,
  base64UrlEncode,
  buildAadBytes,
  isFrame,
  isSeq,
  isSessionId,
  type Frame,
  type PlaintextMessage,
} from '@tincan/shared';
import { padMessage, unpadMessage } from './padding';

export type SealError =
  /** The message fails `isPlaintextMessage`. */
  | 'invalid_message'
  /** The padded message exceeds the largest bucket (impossible for a valid message, kept as a guard). */
  | 'too_large'
  /** `sessionId` is not a valid session id. */
  | 'invalid_session'
  /** `seq` is outside `[FIRST_SEQ, MAX_SEQ]` (a sealer that ran out of sequence numbers). */
  | 'invalid_seq'
  /** WebCrypto failed unexpectedly. */
  | 'crypto_failure';

export type OpenError =
  /** Not a well-formed `{ v: 1, seq, iv, ct }` frame (shape, version, lengths, encoding). */
  | 'malformed_frame'
  /** `seq <= lastSeq`: a replayed, duplicated or reordered frame. */
  | 'replay'
  /** GCM authentication failed: tampered `iv`/`ct`/`seq`, another session, or the wrong key. */
  | 'auth_failed'
  /** Authentic plaintext with a broken length header or non-zero padding. */
  | 'bad_padding'
  /** Authentic plaintext that is not valid UTF-8 JSON or not a valid message. */
  | 'bad_message'
  /** `sessionId` given to the opener is not a valid session id (a local bug, not the relay's doing). */
  | 'invalid_session'
  /** WebCrypto failed for a reason other than authentication. */
  | 'crypto_failure';

/**
 * Open errors that mean "the relay or a key holder sent something we must not show". The UI drops the
 * frame, keeps the last good text and shows an integrity warning (AGENTS.md non-negotiable 4).
 */
export const INTEGRITY_ERRORS: ReadonlySet<OpenError> = new Set<OpenError>([
  'malformed_frame',
  'replay',
  'auth_failed',
  'bad_padding',
  'bad_message',
]);

export function isIntegrityError(error: OpenError): boolean {
  return INTEGRITY_ERRORS.has(error);
}

export type SealResult = { ok: true; frame: Frame } | { ok: false; error: SealError };
export type OpenResult =
  { ok: true; seq: number; message: PlaintextMessage } | { ok: false; error: OpenError };

const TAG_BITS = 128;

function gcmParams(iv: Uint8Array<ArrayBuffer>, sessionId: string, seq: number): AesGcmParams {
  return {
    name: 'AES-GCM',
    iv,
    additionalData: buildAadBytes(sessionId, seq) as Uint8Array<ArrayBuffer>,
    tagLength: TAG_BITS,
  };
}

function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
}

/** Encrypts one message as frame `seq` of `sessionId`. Stateless: the caller owns seq. */
export async function sealFrame(
  key: CryptoKey,
  sessionId: string,
  seq: number,
  message: PlaintextMessage,
): Promise<SealResult> {
  if (!isSessionId(sessionId)) return { ok: false, error: 'invalid_session' };
  if (!isSeq(seq)) return { ok: false, error: 'invalid_seq' };
  const padded = padMessage(message);
  if (!padded.ok) return padded;

  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await crypto.subtle.encrypt(gcmParams(iv, sessionId, seq), key, padded.bytes);
    return {
      ok: true,
      frame: {
        v: PROTOCOL_VERSION,
        seq,
        iv: base64UrlEncode(iv),
        ct: base64UrlEncode(new Uint8Array(ct)),
      },
    };
  } catch {
    return { ok: false, error: 'crypto_failure' };
  } finally {
    padded.bytes.fill(0);
  }
}

/**
 * Validates, authenticates and decodes one untrusted frame. Checks run cheapest first: shape, then
 * `seq > lastSeq`, then GCM, then padding and message. Stateless: the caller advances `lastSeq` on
 * success only.
 */
export async function openFrame(
  key: CryptoKey,
  sessionId: string,
  lastSeq: number,
  frame: unknown,
): Promise<OpenResult> {
  if (!isSessionId(sessionId)) return { ok: false, error: 'invalid_session' };
  if (!isFrame(frame)) return { ok: false, error: 'malformed_frame' };
  if (frame.seq <= lastSeq) return { ok: false, error: 'replay' };

  let plain: Uint8Array;
  try {
    const iv = toArrayBufferView(base64UrlDecode(frame.iv));
    const ct = toArrayBufferView(base64UrlDecode(frame.ct));
    plain = new Uint8Array(
      await crypto.subtle.decrypt(gcmParams(iv, sessionId, frame.seq), key, ct),
    );
  } catch (e) {
    // WebCrypto reports a failed tag check (and only that, for valid inputs) as `OperationError`.
    const auth =
      typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'OperationError';
    return { ok: false, error: auth ? 'auth_failed' : 'crypto_failure' };
  }

  const unpadded = unpadMessage(plain);
  plain.fill(0);
  if (!unpadded.ok) return unpadded;
  return { ok: true, seq: frame.seq, message: unpadded.message };
}

/**
 * Sender side of one session: assigns seq 1, 2, 3, ... and seals strictly one frame at a time, so
 * frames resolve in seq order even though WebCrypto is async (a large frame finishing after a small
 * later one would otherwise reach the receiver out of order and be dropped as a replay).
 */
export class FrameSealer {
  private nextSeq = FIRST_SEQ;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly key: CryptoKey,
    private readonly sessionId: string,
  ) {}

  /** Seals `message` as the next frame. A failed seal does not consume a seq. */
  seal(message: PlaintextMessage): Promise<SealResult> {
    const run = async (): Promise<SealResult> => {
      const result = await sealFrame(this.key, this.sessionId, this.nextSeq, message);
      if (result.ok) this.nextSeq++;
      return result;
    };
    const result = this.tail.then(run);
    // Keep the chain alive even if a step ever rejected (none is expected to).
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/**
 * Receiver side of one session: accepts only frames with `seq > lastSeq` and opens strictly one frame
 * at a time, so two frames arriving together cannot both pass the seq check (or be accepted out of
 * order) while their decryptions are in flight. `lastSeq` advances only on a fully valid frame.
 */
export class FrameOpener {
  private last = FIRST_SEQ - 1;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly key: CryptoKey,
    private readonly sessionId: string,
  ) {}

  /** The seq of the last accepted frame (0 before the first). */
  get lastSeq(): number {
    return this.last;
  }

  open(frame: unknown): Promise<OpenResult> {
    const run = async (): Promise<OpenResult> => {
      const result = await openFrame(this.key, this.sessionId, this.last, frame);
      if (result.ok) this.last = result.seq;
      return result;
    };
    const result = this.tail.then(run);
    // Keep the chain alive even if a step ever rejected (none is expected to).
    this.tail = result.catch(() => undefined);
    return result;
  }
}
