import { describe, expect, it } from 'vitest';
import {
  MAX_PLAINTEXT_BYTES,
  MAX_TEXT_LENGTH,
  MAX_TIMESTAMP,
  PADDING_HEADER_BYTES,
} from '../src/constants.js';
import { paddingBucket } from '../src/framing.js';
import { isMessageText, isPlaintextMessage } from '../src/message.js';
import { JUNK, withOwnKey } from './fixtures.js';

const TS = 1_763_000_000_000;

/** UTF-8 byte length, via the runtime's TextEncoder (present in Node and browsers). */
function utf8Length(s: string): number {
  const { TextEncoder } = globalThis as unknown as {
    TextEncoder: new () => { encode(input: string): Uint8Array };
  };
  return new TextEncoder().encode(s).length;
}

describe('isPlaintextMessage', () => {
  it('accepts the three message types', () => {
    expect(isPlaintextMessage({ t: 'text', text: 'hello', ts: TS })).toBe(true);
    expect(isPlaintextMessage({ t: 'text', text: '', ts: TS })).toBe(true);
    expect(isPlaintextMessage({ t: 'typing', ts: TS })).toBe(true);
    expect(isPlaintextMessage({ t: 'beat', ts: 0 })).toBe(true);
    expect(isPlaintextMessage(JSON.parse('{"t":"text","text":"a\\nb","ts":1}'))).toBe(true);
  });

  it('requires text on text messages and forbids it elsewhere', () => {
    expect(isPlaintextMessage({ t: 'text', ts: TS })).toBe(false);
    expect(isPlaintextMessage({ t: 'typing', text: 'x', ts: TS })).toBe(false);
    expect(isPlaintextMessage({ t: 'beat', text: '', ts: TS })).toBe(false);
  });

  it('rejects unknown types and bad timestamps', () => {
    for (const t of ['TEXT', 'html', 'ping', '', 1, null]) {
      expect(isPlaintextMessage({ t, ts: TS })).toBe(false);
      expect(isPlaintextMessage({ t, text: 'x', ts: TS })).toBe(false);
    }
    for (const ts of [-1, 1.5, NaN, Infinity, MAX_TIMESTAMP + 1, '1', null, undefined]) {
      expect(isPlaintextMessage({ t: 'beat', ts })).toBe(false);
      expect(isPlaintextMessage({ t: 'text', text: 'x', ts })).toBe(false);
    }
  });

  it('rejects non-string text', () => {
    for (const text of JUNK) {
      if (typeof text === 'string') continue;
      expect(isPlaintextMessage({ t: 'text', text, ts: TS })).toBe(false);
    }
    expect(isPlaintextMessage({ t: 'text', text: ['a'], ts: TS })).toBe(false);
    expect(isPlaintextMessage({ t: 'text', text: { toString: () => 'a' }, ts: TS })).toBe(false);
  });

  it('enforces the text length limit', () => {
    expect(isPlaintextMessage({ t: 'text', text: 'a'.repeat(MAX_TEXT_LENGTH), ts: TS })).toBe(true);
    expect(isPlaintextMessage({ t: 'text', text: 'a'.repeat(MAX_TEXT_LENGTH + 1), ts: TS })).toBe(
      false,
    );
    expect(isMessageText('\u{1F600}'.repeat(MAX_TEXT_LENGTH / 2))).toBe(true);
    expect(isMessageText('\u{1F600}'.repeat(MAX_TEXT_LENGTH / 2) + 'a')).toBe(false);
  });

  it('rejects extra and polluting keys', () => {
    for (const base of [
      { t: 'text', text: 'x', ts: TS },
      { t: 'typing', ts: TS },
    ]) {
      for (const key of ['extra', '__proto__', 'constructor', 'html']) {
        expect(isPlaintextMessage(withOwnKey(base, key))).toBe(false);
      }
    }
    expect(isPlaintextMessage(JSON.parse('{"t":"beat","ts":1,"__proto__":{"t":"x"}}'))).toBe(false);
  });

  it('rejects non-objects', () => {
    for (const value of JUNK) expect(isPlaintextMessage(value)).toBe(false);
    expect(isPlaintextMessage([{ t: 'beat', ts: TS }])).toBe(false);
  });
});

describe('text limit vs. padding', () => {
  it('any valid text message, JSON-encoded, fits the largest bucket', () => {
    // Worst cases per UTF-16 unit: control chars and lone surrogates become 6-byte \\u escapes,
    // BMP characters are up to 3 UTF-8 bytes.
    const worstCases = [
      '\u0001',
      '\ud800',
      String.fromCharCode(0x20ac),
      '"',
      '\\',
      '\n',
      '\u{1F600}',
    ];
    for (const ch of worstCases) {
      const text = ch.repeat(Math.floor(MAX_TEXT_LENGTH / ch.length));
      const message = { t: 'text', text, ts: MAX_TIMESTAMP };
      expect(isPlaintextMessage(message)).toBe(true);
      const bytes = utf8Length(JSON.stringify(message));
      expect(bytes).toBeLessThanOrEqual(MAX_PLAINTEXT_BYTES);
      expect(paddingBucket(PADDING_HEADER_BYTES + bytes)).toBeDefined();
    }
  });
});
