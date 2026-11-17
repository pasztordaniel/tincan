import { describe, expect, it } from 'vitest';
import { base64UrlEncode, base64UrlLength } from '../src/base64url.js';
import { MAX_SEQ, MAX_TIMESTAMP, PADDING_BUCKETS } from '../src/constants.js';
import {
  CIPHERTEXT_LENGTHS,
  hasExactKeys,
  isCiphertext,
  isIv,
  isKeyString,
  isSeq,
  isSessionId,
  isTimestamp,
  isToken,
} from '../src/guards.js';
import { ciphertext, filled, IV, JUNK, SESSION_ID, TOKEN, withOwnKey } from './fixtures.js';

describe('hasExactKeys', () => {
  it('accepts exactly the required keys, plus optional ones', () => {
    expect(hasExactKeys({ a: 1 }, ['a'])).toBe(true);
    expect(hasExactKeys({ a: 1, b: 2 }, ['a'], ['b'])).toBe(true);
    expect(hasExactKeys({ a: 1 }, ['a'], ['b'])).toBe(true);
    expect(hasExactKeys(Object.assign(Object.create(null) as object, { a: 1 }), ['a'])).toBe(true);
    expect(hasExactKeys(JSON.parse('{"a":1}'), ['a'])).toBe(true);
  });

  it('rejects missing and extra keys', () => {
    expect(hasExactKeys({}, ['a'])).toBe(false);
    expect(hasExactKeys({ b: 1 }, ['a'])).toBe(false);
    expect(hasExactKeys({ a: 1, b: 2 }, ['a'])).toBe(false);
    expect(hasExactKeys({ b: 1 }, ['a'], ['b'])).toBe(false);
  });

  it.each(['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'])(
    'rejects an own %s key',
    (key) => {
      expect(hasExactKeys(withOwnKey({ a: 1 }, key), ['a'])).toBe(false);
    },
  );

  it('rejects objects with a non-plain prototype', () => {
    // An object literal with __proto__ sets the prototype; inherited keys must not count.
    const polluted = { __proto__: { a: 1 } } as unknown;
    expect(hasExactKeys(polluted, ['a'])).toBe(false);
    expect(hasExactKeys(Object.create({ evil: true }) as unknown, [])).toBe(false);
    class Payload {
      a = 1;
    }
    expect(hasExactKeys(new Payload(), ['a'])).toBe(false);
    expect(hasExactKeys(new Date(), [])).toBe(false);
    expect(hasExactKeys(new Map(), [])).toBe(false);
  });

  it('rejects arrays, primitives and functions', () => {
    expect(hasExactKeys([], [])).toBe(false);
    expect(hasExactKeys(['a'], ['0'])).toBe(false);
    for (const value of JUNK) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) continue;
      expect(hasExactKeys(value, [])).toBe(false);
    }
  });

  it('rejects symbol keys, accessors and non-enumerable tricks', () => {
    expect(hasExactKeys({ a: 1, [Symbol('x')]: 2 }, ['a'])).toBe(false);
    const getter = {};
    Object.defineProperty(getter, 'a', { get: () => 1, enumerable: true });
    expect(hasExactKeys(getter, ['a'])).toBe(false);
    const hidden = { a: 1 };
    Object.defineProperty(hidden, 'b', { value: 2, enumerable: false });
    expect(hasExactKeys(hidden, ['a'])).toBe(false);
  });

  it('inspects property descriptors, never get traps', () => {
    // Validators read values through descriptors (see `prop`), so a get trap is never consulted
    // during validation. This does not make a proxy safe: callers read fields with normal property
    // access afterwards. Wire data comes from JSON.parse and is never a proxy, so that is out of scope.
    let reads = 0;
    const proxy = new Proxy(
      { a: 1 },
      {
        get: () => (reads++ === 0 ? 1 : 'changed'),
      },
    );
    expect(hasExactKeys(proxy, ['a'])).toBe(true);
    expect(reads).toBe(0);
  });
});

describe('identifier guards', () => {
  it('accepts canonical values of the right length', () => {
    expect(isSessionId(SESSION_ID)).toBe(true);
    expect(SESSION_ID).toHaveLength(22);
    expect(isToken(TOKEN)).toBe(true);
    expect(isIv(IV)).toBe(true);
    expect(IV).toHaveLength(16);
    const key = base64UrlEncode(filled(32));
    expect(key).toHaveLength(43);
    expect(isKeyString(key)).toBe(true);
  });

  it.each([
    ['too short', SESSION_ID.slice(1)],
    ['too long', SESSION_ID + 'A'],
    ['dot', SESSION_ID.slice(0, 10) + '.' + SESSION_ID.slice(11)],
    ['plus', SESSION_ID.slice(0, 10) + '+' + SESSION_ID.slice(11)],
    ['slash', SESSION_ID.slice(0, 10) + '/' + SESSION_ID.slice(11)],
    ['pipe (AAD separator)', SESSION_ID.slice(0, 10) + '|' + SESSION_ID.slice(11)],
    ['padding', SESSION_ID.slice(0, 20) + '=='],
    ['non-canonical last char', SESSION_ID.slice(0, 21) + 'B'],
    ['empty', ''],
  ])('rejects a session id with %s', (_name, value) => {
    expect(isSessionId(value)).toBe(false);
    expect(isToken(value)).toBe(false);
  });

  it('rejects non-strings', () => {
    for (const value of JUNK) {
      expect(isSessionId(value)).toBe(false);
      expect(isToken(value)).toBe(false);
      expect(isIv(value)).toBe(false);
      expect(isKeyString(value)).toBe(false);
      expect(isCiphertext(value)).toBe(false);
    }
  });

  it('rejects an IV of the wrong length', () => {
    expect(isIv(base64UrlEncode(filled(16)))).toBe(false);
    expect(isIv(base64UrlEncode(filled(11)))).toBe(false);
  });
});

describe('isCiphertext', () => {
  it('accepts exactly bucket + tag for every bucket', () => {
    expect(CIPHERTEXT_LENGTHS.size).toBe(PADDING_BUCKETS.length);
    for (const bucket of PADDING_BUCKETS) {
      const ct = ciphertext(bucket);
      expect(ct).toHaveLength(base64UrlLength(bucket + 16));
      expect(isCiphertext(ct)).toBe(true);
    }
  });

  it('rejects sizes between, below and above the buckets', () => {
    for (const bytes of [0, 16, 255, 256, 271, 273, 300, 1041, 65536, 65551, 65553, 131088]) {
      expect(isCiphertext(base64UrlEncode(filled(bytes)))).toBe(false);
    }
  });

  it('rejects a bucket-length string with a bad character anywhere', () => {
    const ct = ciphertext(512);
    for (const index of [0, 100, ct.length - 1]) {
      expect(isCiphertext(ct.slice(0, index) + '+' + ct.slice(index + 1))).toBe(false);
      expect(isCiphertext(ct.slice(0, index) + '=' + ct.slice(index + 1))).toBe(false);
    }
  });

  it('rejects a non-canonical final character', () => {
    // 272 bytes -> 363 chars, last char carries 2 unused bits.
    const ct = ciphertext(256);
    expect(isCiphertext(ct.slice(0, -1) + 'B')).toBe(false);
  });
});

describe('isSeq', () => {
  it('accepts integers from 1 to MAX_SAFE_INTEGER', () => {
    for (const value of [1, 2, 1000, MAX_SEQ]) expect(isSeq(value)).toBe(true);
  });

  it('rejects zero, negatives, floats, NaN, infinities, unsafe integers and non-numbers', () => {
    for (const value of [0, -0, -1, 1.5, 0.1, NaN, Infinity, -Infinity, MAX_SEQ + 1, 2 ** 60]) {
      expect(isSeq(value)).toBe(false);
    }
    for (const value of ['1', '01', 1n, [1], { valueOf: () => 1 }, null, undefined, true]) {
      expect(isSeq(value)).toBe(false);
    }
  });
});

describe('isTimestamp', () => {
  it('accepts integers from 0 to the max Date value', () => {
    for (const value of [0, 1, 1_763_000_000_000, MAX_TIMESTAMP]) {
      expect(isTimestamp(value)).toBe(true);
    }
  });

  it('rejects out-of-range and non-integer values', () => {
    for (const value of [-1, 1.5, NaN, Infinity, MAX_TIMESTAMP + 1, '0', null]) {
      expect(isTimestamp(value)).toBe(false);
    }
  });
});
