import { describe, expect, it } from 'vitest';
import {
  AAD_PREFIX,
  MAX_PADDED_BYTES,
  MAX_SEQ,
  PADDING_BUCKETS,
  SESSION_ID_LENGTH,
} from '../src/constants.js';
import { buildAad, buildAadBytes, paddingBucket } from '../src/framing.js';
import { OTHER_SESSION_ID, SESSION_ID } from './fixtures.js';

describe('buildAad', () => {
  it('is tincan/v1|<sessionId>|<seq>', () => {
    expect(AAD_PREFIX).toBe('tincan/v1');
    expect(buildAad(SESSION_ID, 1)).toBe(`tincan/v1|${SESSION_ID}|1`);
    expect(buildAad(SESSION_ID, 42)).toBe(`tincan/v1|${SESSION_ID}|42`);
    expect(buildAad(SESSION_ID, MAX_SEQ)).toBe(`tincan/v1|${SESSION_ID}|9007199254740991`);
  });

  it('differs per session and per seq', () => {
    expect(buildAad(SESSION_ID, 1)).not.toBe(buildAad(OTHER_SESSION_ID, 1));
    expect(buildAad(SESSION_ID, 1)).not.toBe(buildAad(SESSION_ID, 2));
    // No ambiguity between seq 1 and seq 11 etc.: the seq is the last field.
    expect(buildAad(SESSION_ID, 11)).not.toBe(buildAad(SESSION_ID, 1));
  });

  it('parses back unambiguously', () => {
    const [prefix, id, seq, ...rest] = buildAad(SESSION_ID, 7).split('|');
    expect([prefix, id, seq, rest]).toEqual(['tincan/v1', SESSION_ID, '7', []]);
    expect(id).toHaveLength(SESSION_ID_LENGTH);
  });

  it('never uses exponent or fraction notation', () => {
    expect(buildAad(SESSION_ID, 1e15)).toBe(`tincan/v1|${SESSION_ID}|1000000000000000`);
  });

  it.each([
    ['injected separator', `${SESSION_ID.slice(0, 21)}|`],
    ['wrong length', SESSION_ID.slice(1)],
    ['empty', ''],
  ])('throws on a session id with %s', (_name, id) => {
    expect(() => buildAad(id, 1)).toThrow(TypeError);
  });

  it('throws on an invalid seq', () => {
    for (const seq of [0, -1, 1.5, NaN, Infinity, MAX_SEQ + 1]) {
      expect(() => buildAad(SESSION_ID, seq)).toThrow(TypeError);
    }
    expect(() => buildAad(SESSION_ID, '1' as unknown as number)).toThrow(TypeError);
  });

  it('as bytes is the ASCII encoding of the string', () => {
    const aad = buildAad(SESSION_ID, 123);
    const bytes = buildAadBytes(SESSION_ID, 123);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toEqual(Uint8Array.from(aad, (c) => c.charCodeAt(0)));
    expect(() => buildAadBytes(SESSION_ID, 0)).toThrow(TypeError);
  });
});

describe('paddingBucket', () => {
  it('has power-of-two buckets from 256 B to 64 KiB', () => {
    expect(PADDING_BUCKETS[0]).toBe(256);
    expect(PADDING_BUCKETS.at(-1)).toBe(MAX_PADDED_BYTES);
    for (let i = 1; i < PADDING_BUCKETS.length; i++) {
      expect(PADDING_BUCKETS[i]).toBe(PADDING_BUCKETS[i - 1]! * 2);
    }
    expect(Object.isFrozen(PADDING_BUCKETS)).toBe(true);
  });

  it('picks the smallest bucket that fits', () => {
    expect(paddingBucket(0)).toBe(256);
    expect(paddingBucket(1)).toBe(256);
    expect(paddingBucket(256)).toBe(256);
    expect(paddingBucket(257)).toBe(512);
    expect(paddingBucket(1000)).toBe(1024);
    expect(paddingBucket(32769)).toBe(65536);
    expect(paddingBucket(65536)).toBe(65536);
  });

  it('returns undefined for oversize or invalid lengths', () => {
    for (const n of [65537, 1e9, -1, 1.5, NaN, Infinity]) expect(paddingBucket(n)).toBeUndefined();
  });
});
