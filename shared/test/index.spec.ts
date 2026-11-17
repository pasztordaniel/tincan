import { describe, expect, it } from 'vitest';
import * as shared from '../src/index.js';
import { base64UrlLength } from '../src/base64url.js';

describe('@tincan/shared', () => {
  it('exports the app name', () => {
    expect(shared.APP_NAME).toBe('tincan');
  });

  it('exports the contract both sides build on', () => {
    for (const name of [
      'EVENTS',
      'buildAad',
      'buildAadBytes',
      'paddingBucket',
      'base64UrlEncode',
      'base64UrlDecode',
      'isBase64Url',
      'isFrame',
      'isJoinRequest',
      'isResumeRequest',
      'isPlaintextMessage',
      'isCiphertext',
      'isKeyString',
      'isCreateResult',
      'isJoinResult',
      'isResumeResult',
      'isFrameResult',
      'isPeerEvent',
      'isSessionEndedEvent',
    ]) {
      expect(shared, name).toHaveProperty(name);
    }
  });

  it('keeps encoded lengths consistent with byte sizes', () => {
    expect(shared.SESSION_ID_LENGTH).toBe(base64UrlLength(shared.SESSION_ID_BYTES));
    expect(shared.TOKEN_LENGTH).toBe(base64UrlLength(shared.TOKEN_BYTES));
    expect(shared.KEY_LENGTH).toBe(base64UrlLength(shared.KEY_BYTES));
    expect(shared.IV_LENGTH).toBe(base64UrlLength(shared.IV_BYTES));
    expect(shared.MAX_PADDED_BYTES).toBe(shared.PADDING_BUCKETS.at(-1));
  });

  it('orders the idle timers: client warns, then cuts, before the server backstops fire', () => {
    expect(shared.IDLE_WARNING_MS).toBe(9 * 60_000);
    expect(shared.IDLE_CUT_MS).toBe(10 * 60_000);
    expect(shared.SESSION_IDLE_TTL_MS).toBe(15 * 60_000);
    expect(shared.MAX_SESSION_LIFETIME_MS).toBe(2 * 60 * 60_000);
    expect(shared.IDLE_WARNING_MS).toBeLessThan(shared.IDLE_CUT_MS);
    expect(shared.IDLE_CUT_MS).toBeLessThan(shared.SESSION_IDLE_TTL_MS);
    expect(shared.SESSION_IDLE_TTL_MS).toBeLessThan(shared.MAX_SESSION_LIFETIME_MS);
    // A live sender beats far more often than the server's no-frame TTL.
    expect(shared.BEAT_INTERVAL_MS * 3).toBeLessThan(shared.SESSION_IDLE_TTL_MS);
  });

  it('leaves room for the largest legitimate frame under the message limit', () => {
    const ctLength = base64UrlLength(shared.MAX_PADDED_BYTES + shared.GCM_TAG_BYTES);
    const frame = {
      v: shared.PROTOCOL_VERSION,
      seq: shared.MAX_SEQ,
      iv: 'A'.repeat(shared.IV_LENGTH),
      ct: 'A'.repeat(ctLength),
    };
    expect(shared.isFrame(frame)).toBe(true);
    // socket.io event packet with an ack id: 42<id>["frame",{...}]
    const packet = `42${String(Number.MAX_SAFE_INTEGER)}${JSON.stringify(['frame', frame])}`;
    expect(packet.length).toBeLessThan(shared.MAX_MESSAGE_BYTES);
  });
});
