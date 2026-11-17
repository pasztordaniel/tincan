import { describe, expect, it } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  base64UrlLength,
  isBase64Url,
} from '../src/base64url.js';

/** Deterministic pseudo-random bytes (no crypto needed for encoding tests). */
function bytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

/** Decodes 2 characters ignoring the canonicality rule, to show a rejected string is not canonical. */
function decodeLoose(s: string): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return [(alphabet.indexOf(s[0]!) << 2) | (alphabet.indexOf(s[1]!) >> 4)];
}

describe('base64url', () => {
  it('matches RFC 4648 test vectors (unpadded, url alphabet)', () => {
    const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
    expect(base64UrlEncode(ascii(''))).toBe('');
    expect(base64UrlEncode(ascii('f'))).toBe('Zg');
    expect(base64UrlEncode(ascii('fo'))).toBe('Zm8');
    expect(base64UrlEncode(ascii('foo'))).toBe('Zm9v');
    expect(base64UrlEncode(ascii('foob'))).toBe('Zm9vYg');
    expect(base64UrlEncode(ascii('fooba'))).toBe('Zm9vYmE');
    expect(base64UrlEncode(ascii('foobar'))).toBe('Zm9vYmFy');
    expect(base64UrlEncode(Uint8Array.of(0xfb, 0xff, 0xbf))).toBe('-_-_');
  });

  it('round-trips every length from 0 to 300 and every byte value', () => {
    for (let n = 0; n <= 300; n++) {
      const input = bytes(n, n + 7);
      const encoded = base64UrlEncode(input);
      expect(encoded).toHaveLength(base64UrlLength(n));
      expect(isBase64Url(encoded, n)).toBe(true);
      expect(base64UrlDecode(encoded)).toEqual(input);
    }
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64UrlDecode(base64UrlEncode(all))).toEqual(all);
  });

  it('round-trips the largest ciphertext size', () => {
    const input = bytes(65536 + 16);
    expect(base64UrlDecode(base64UrlEncode(input))).toEqual(input);
  });

  it('computes encoded lengths', () => {
    expect(base64UrlLength(16)).toBe(22);
    expect(base64UrlLength(12)).toBe(16);
    expect(base64UrlLength(32)).toBe(43);
    expect(base64UrlLength(65552)).toBe(87403);
  });

  it.each([
    ['standard alphabet +', 'ab+d'],
    ['standard alphabet /', 'ab/d'],
    ['padding', 'Zg=='],
    ['dot', 'ab.d'],
    ['space', 'ab d'],
    ['newline', 'abcd\n'],
    ['non-ASCII', 'abc' + String.fromCharCode(0xe9)],
    ['full-width letter', 'abc' + String.fromCharCode(0xff41)],
    ['NUL', 'abc\u0000'],
    ['impossible length (4n+1)', 'abcde'],
    ['non-canonical trailing bits (2 chars)', 'Zh'],
    ['non-canonical trailing bits (3 chars)', 'Zm9'],
  ])('rejects %s', (_name, input) => {
    expect(isBase64Url(input)).toBe(false);
    expect(() => base64UrlDecode(input)).toThrow(TypeError);
  });

  it('accepts the canonical neighbours of the non-canonical cases', () => {
    expect(base64UrlDecode('Zg')).toEqual(Uint8Array.of(0x66));
    expect(base64UrlDecode('Zm8')).toEqual(Uint8Array.of(0x66, 0x6f));
  });

  it('rejects non-strings without throwing', () => {
    for (const value of [undefined, null, 0, 12, {}, [], ['abcd'], new String('abcd')]) {
      expect(isBase64Url(value)).toBe(false);
    }
  });

  it('accepts a short string exactly when it is the encoding of its own decoding (exhaustive)', () => {
    // Every 2- and 3-character string over the alphabet: only canonical ones (zero trailing bits) pass,
    // and those are exactly the encodings of all 1- and 2-byte inputs.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let accepted2 = 0;
    let accepted3 = 0;
    for (const a of alphabet) {
      for (const b of alphabet) {
        const two = a + b;
        if (isBase64Url(two)) {
          accepted2++;
          expect(base64UrlEncode(base64UrlDecode(two))).toBe(two);
        } else {
          expect(base64UrlEncode(Uint8Array.of(...decodeLoose(two)))).not.toBe(two);
        }
        for (const c of alphabet) {
          const three = two + c;
          if (isBase64Url(three)) {
            accepted3++;
            expect(base64UrlEncode(base64UrlDecode(three))).toBe(three);
          }
        }
      }
    }
    expect(accepted2).toBe(256);
    expect(accepted3).toBe(65536);
  });

  it('enforces an exact byte length when given', () => {
    const id = base64UrlEncode(bytes(16));
    expect(isBase64Url(id, 16)).toBe(true);
    expect(isBase64Url(id, 15)).toBe(false);
    expect(isBase64Url(id + 'A', 16)).toBe(false);
    expect(isBase64Url(id.slice(1), 16)).toBe(false);
  });
});
