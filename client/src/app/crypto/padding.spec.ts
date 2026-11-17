import {
  MAX_TEXT_LENGTH,
  PADDING_BUCKETS,
  PADDING_HEADER_BYTES,
  type PlaintextMessage,
} from '@tincan/shared';
import { padMessage, unpadMessage } from './padding';
import { rawPadded, textMessageOfPaddedSize } from './test-helpers';

const enc = new TextEncoder();

function pad(message: PlaintextMessage): Uint8Array {
  const result = padMessage(message);
  if (!result.ok) throw new Error(result.error);
  return result.bytes;
}

describe('padMessage / unpadMessage', () => {
  it('round-trips every message type into the smallest bucket', () => {
    const messages: PlaintextMessage[] = [
      { t: 'text', text: 'hello', ts: 1 },
      { t: 'text', text: '', ts: 0 },
      { t: 'typing', ts: 2 },
      { t: 'beat', ts: 8.64e15 },
      { t: 'text', text: 'caf\u00e9 \u{1F642} \u0000 \ud800', ts: 3 },
    ];
    for (const message of messages) {
      const bytes = pad(message);
      expect(bytes.length).toBe(256);
      expect(unpadMessage(bytes)).toEqual({ ok: true, message });
    }
  });

  it('writes a big-endian length header, the JSON.stringify output and zero padding', () => {
    const message: PlaintextMessage = { t: 'text', text: 'x\u0001', ts: 5 };
    const json = enc.encode(JSON.stringify(message));
    const bytes = pad(message);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0, 0, 0, json.length]);
    // Compared as arrays: the test DOM's TextEncoder returns a Uint8Array from another realm.
    expect(Array.from(bytes.subarray(4, 4 + json.length))).toEqual(Array.from(json));
    expect(bytes.subarray(4 + json.length).every((b) => b === 0)).toBe(true);
  });

  it('lands exactly on each reachable bucket edge and moves up one byte later', () => {
    for (let i = 0; i < PADDING_BUCKETS.length - 1; i++) {
      const bucket = PADDING_BUCKETS[i]!;
      const atEdge = textMessageOfPaddedSize(bucket);
      const overEdge = textMessageOfPaddedSize(bucket + 1);
      expect(pad(atEdge).length).toBe(bucket);
      expect(pad(overEdge).length).toBe(PADDING_BUCKETS[i + 1]);
      expect(unpadMessage(pad(atEdge))).toEqual({ ok: true, message: atEdge });
      expect(unpadMessage(pad(overEdge))).toEqual({ ok: true, message: overEdge });
    }
  });

  it('fits the worst-case valid text (all 6-byte JSON escapes) into the top bucket', () => {
    const worst: PlaintextMessage = {
      t: 'text',
      text: '\u0001'.repeat(MAX_TEXT_LENGTH),
      ts: 8.64e15,
    };
    const bytes = pad(worst);
    expect(bytes.length).toBe(65536);
    expect(unpadMessage(bytes)).toEqual({ ok: true, message: worst });
  });

  it('rejects invalid messages before padding', () => {
    const bad: unknown[] = [
      { t: 'text', text: 'a'.repeat(MAX_TEXT_LENGTH + 1), ts: 0 },
      { t: 'text', ts: 0 },
      { t: 'beat', ts: 0, text: '' },
      { t: 'beat', ts: 0, extra: 1 },
      { t: 'other', ts: 0 },
      { t: 'beat', ts: -1 },
      null,
    ];
    for (const message of bad) {
      expect(padMessage(message as PlaintextMessage)).toEqual({
        ok: false,
        error: 'invalid_message',
      });
    }
  });

  describe('unpadMessage rejects', () => {
    const json = enc.encode(JSON.stringify({ t: 'beat', ts: 1 }));

    it('sizes that are not a bucket', () => {
      expect(unpadMessage(rawPadded(json, 255))).toEqual({ ok: false, error: 'bad_padding' });
      expect(unpadMessage(rawPadded(json, 300))).toEqual({ ok: false, error: 'bad_padding' });
      expect(unpadMessage(new Uint8Array(0))).toEqual({ ok: false, error: 'bad_padding' });
    });

    it('a length header beyond the buffer', () => {
      expect(unpadMessage(rawPadded(json, 256, 253))).toEqual({ ok: false, error: 'bad_padding' });
      expect(unpadMessage(rawPadded(json, 256, 0xffffffff))).toEqual({
        ok: false,
        error: 'bad_padding',
      });
    });

    it('a non-canonical (larger than needed) bucket', () => {
      expect(unpadMessage(rawPadded(json, 512))).toEqual({ ok: false, error: 'bad_padding' });
    });

    it('a non-zero padding byte', () => {
      const bytes = rawPadded(json, 256);
      bytes[255] = 1;
      expect(unpadMessage(bytes)).toEqual({ ok: false, error: 'bad_padding' });
      const early = rawPadded(json, 256);
      early[PADDING_HEADER_BYTES + json.length] = 0x20; // trailing JSON whitespace hidden in padding
      expect(unpadMessage(early)).toEqual({ ok: false, error: 'bad_padding' });
    });

    it('a header that cuts the JSON short', () => {
      expect(unpadMessage(rawPadded(json, 256, json.length - 1))).toEqual({
        ok: false,
        error: 'bad_padding', // the cut-off byte is non-zero padding
      });
    });

    it('invalid UTF-8, a BOM, broken JSON and valid JSON that is not a message', () => {
      const bodies = [
        new Uint8Array([0xff, 0xfe]),
        new Uint8Array([0xc3]),
        new Uint8Array([0xef, 0xbb, 0xbf, ...json]),
        enc.encode('{"t":"beat",'),
        enc.encode(''),
        enc.encode('{"t":"beat","ts":1,"x":0}'),
        enc.encode('{"t":"beat","ts":1,"__proto__":{}}'),
        enc.encode('[1]'),
        enc.encode('null'),
        // Invalid UTF-8 inside a JSON string: a lenient decoder would accept these as U+FFFD.
        ...[[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80]].map(
          (bad) =>
            new Uint8Array([
              ...enc.encode('{"t":"text","text":"'),
              ...bad,
              ...enc.encode('","ts":1}'),
            ]),
        ),
      ];
      for (const body of bodies) {
        expect(unpadMessage(rawPadded(body, 256))).toEqual({ ok: false, error: 'bad_message' });
      }
    });
  });
});
