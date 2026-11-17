import {
  GCM_TAG_BYTES,
  MAX_SEQ,
  PADDING_BUCKETS,
  base64UrlDecode,
  buildAad,
  isFrame,
  type Frame,
  type PlaintextMessage,
} from '@tincan/shared';
import {
  FrameOpener,
  FrameSealer,
  INTEGRITY_ERRORS,
  isIntegrityError,
  openFrame,
  sealFrame,
} from './frame-crypto';
import { padMessage } from './padding';
import {
  encryptRaw,
  flipBit,
  newKey,
  randomSessionId,
  rawPadded,
  textMessageOfPaddedSize,
} from './test-helpers';

const hello: PlaintextMessage = { t: 'text', text: 'hello', ts: 1_700_000_000_000 };

async function seal(
  key: CryptoKey,
  sessionId: string,
  seq: number,
  message: PlaintextMessage = hello,
): Promise<Frame> {
  const result = await sealFrame(key, sessionId, seq, message);
  if (!result.ok) throw new Error(result.error);
  return result.frame;
}

describe('frame crypto', () => {
  let key: CryptoKey;
  let sessionId: string;
  const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

  beforeEach(async () => {
    key = await newKey();
    sessionId = randomSessionId();
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      consoleSpies.push(vi.spyOn(console, method));
    }
  });

  afterEach(() => {
    // Nothing in the crypto module may log (keys, plaintext and frames must never reach a console).
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    consoleSpies.length = 0;
    vi.restoreAllMocks();
  });

  describe('sealFrame / openFrame', () => {
    it('round-trips every message type as a valid wire frame', async () => {
      const messages: PlaintextMessage[] = [hello, { t: 'typing', ts: 2 }, { t: 'beat', ts: 3 }];
      for (const [i, message] of messages.entries()) {
        const frame = await seal(key, sessionId, i + 1, message);
        expect(isFrame(frame)).toBe(true);
        expect(Object.keys(frame).sort()).toEqual(['ct', 'iv', 'seq', 'v']);
        expect(frame.v).toBe(1);
        expect(frame.seq).toBe(i + 1);
        expect(await openFrame(key, sessionId, i, frame)).toEqual({
          ok: true,
          seq: i + 1,
          message,
        });
      }
    });

    it('round-trips at every reachable bucket edge, ct = bucket + tag', async () => {
      const sizes: [number, number][] = [];
      for (let i = 0; i < PADDING_BUCKETS.length - 1; i++) {
        const bucket = PADDING_BUCKETS[i]!;
        sizes.push([bucket, bucket], [bucket + 1, PADDING_BUCKETS[i + 1]!]);
      }
      for (const [size, bucket] of sizes) {
        const message = textMessageOfPaddedSize(size);
        const frame = await seal(key, sessionId, 7, message);
        expect(base64UrlDecode(frame.ct).length).toBe(bucket + GCM_TAG_BYTES);
        expect(await openFrame(key, sessionId, 6, frame)).toEqual({ ok: true, seq: 7, message });
      }
    });

    it('typing and beat frames are indistinguishable in size from short text', async () => {
      const lengths = await Promise.all(
        [hello, { t: 'typing', ts: 1 } as const, { t: 'beat', ts: 1 } as const].map(
          async (m) => (await seal(key, sessionId, 1, m)).ct.length,
        ),
      );
      expect(new Set(lengths).size).toBe(1);
    });

    it('two seals of the same message differ (fresh IV)', async () => {
      const a = await seal(key, sessionId, 1);
      const b = await seal(key, sessionId, 1);
      expect(a.iv).not.toBe(b.iv);
      expect(a.ct).not.toBe(b.ct);
    });

    it('never repeats an IV across 10 000 frames', async () => {
      const ivs = new Set<string>();
      const total = 10_000;
      for (let start = 1; start <= total; start += 500) {
        const batch = await Promise.all(
          Array.from({ length: 500 }, (_, i) =>
            seal(key, sessionId, start + i, { t: 'beat', ts: 0 }),
          ),
        );
        for (const frame of batch) ivs.add(frame.iv);
      }
      expect(ivs.size).toBe(total);
    });

    it('rejects invalid seal input with typed errors', async () => {
      expect(await sealFrame(key, 'not-a-session', 1, hello)).toEqual({
        ok: false,
        error: 'invalid_session',
      });
      for (const seq of [0, -1, 1.5, MAX_SEQ + 1, Number.NaN]) {
        expect(await sealFrame(key, sessionId, seq, hello)).toEqual({
          ok: false,
          error: 'invalid_seq',
        });
      }
      const bad = { t: 'text', text: 'x', ts: 1, extra: true } as unknown as PlaintextMessage;
      expect(await sealFrame(key, sessionId, 1, bad)).toEqual({
        ok: false,
        error: 'invalid_message',
      });
    });

    it('maps WebCrypto failures on seal to crypto_failure, never a raw DOMException', async () => {
      const decryptOnly = await newKey(['decrypt']);
      expect(await sealFrame(decryptOnly, sessionId, 1, hello)).toEqual({
        ok: false,
        error: 'crypto_failure',
      });
    });
  });

  describe('openFrame rejects', () => {
    it('a flipped bit anywhere in ct (body and tag)', async () => {
      const frame = await seal(key, sessionId, 1);
      const len = base64UrlDecode(frame.ct).length;
      for (const index of [0, 3, 4, 100, len - GCM_TAG_BYTES - 1, len - GCM_TAG_BYTES, len - 1]) {
        for (const bit of [0, 7]) {
          const tampered = { ...frame, ct: flipBit(frame.ct, index, bit) };
          expect(await openFrame(key, sessionId, 0, tampered)).toEqual({
            ok: false,
            error: 'auth_failed',
          });
        }
      }
    });

    it('a flipped bit in the iv', async () => {
      const frame = await seal(key, sessionId, 1);
      for (const index of [0, 5, 11]) {
        const tampered = { ...frame, iv: flipBit(frame.iv, index) };
        expect(await openFrame(key, sessionId, 0, tampered)).toEqual({
          ok: false,
          error: 'auth_failed',
        });
      }
    });

    it('a changed seq (renumbered frame)', async () => {
      const frame = await seal(key, sessionId, 5);
      for (const seq of [4, 6, 7, 1 << 20, MAX_SEQ]) {
        expect(await openFrame(key, sessionId, 0, { ...frame, seq })).toEqual({
          ok: false,
          error: 'auth_failed',
        });
      }
    });

    it('a frame from another session (spliced)', async () => {
      const frame = await seal(key, sessionId, 1);
      expect(await openFrame(key, randomSessionId(), 0, frame)).toEqual({
        ok: false,
        error: 'auth_failed',
      });
    });

    it('a frame whose AAD differs in any way from buildAad(sessionId, seq)', async () => {
      const padded = padMessage(hello);
      if (!padded.ok) throw new Error(padded.error);
      const right = buildAad(sessionId, 1);
      const aads = [
        right.replace('tincan/v1', 'tincan/v2'),
        `${right}|`,
        right.slice(0, -1) + '01',
        '',
        `tincan/v1|${sessionId}`,
      ];
      for (const aad of aads) {
        const frame = await encryptRaw(key, padded.bytes.slice(), aad, 1);
        expect(await openFrame(key, sessionId, 0, frame)).toEqual({
          ok: false,
          error: 'auth_failed',
        });
      }
      // Control: the same path with the right AAD opens.
      const good = await encryptRaw(key, padded.bytes.slice(), right, 1);
      expect(await openFrame(key, sessionId, 0, good)).toEqual({
        ok: true,
        seq: 1,
        message: hello,
      });
    });

    it('a frame sealed with another key, without any partial plaintext', async () => {
      const frame = await seal(key, sessionId, 1);
      const result = await openFrame(await newKey(), sessionId, 0, frame);
      expect(result).toEqual({ ok: false, error: 'auth_failed' });
      expect(Object.keys(result).sort()).toEqual(['error', 'ok']);
    });

    it('seq equal to or below lastSeq, before any decryption', async () => {
      const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
      const frame = await seal(key, sessionId, 5);
      for (const lastSeq of [5, 6, MAX_SEQ]) {
        expect(await openFrame(key, sessionId, lastSeq, frame)).toEqual({
          ok: false,
          error: 'replay',
        });
      }
      expect(decrypt).not.toHaveBeenCalled();
    });

    it('malformed frames, before any decryption', async () => {
      const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
      const frame = await seal(key, sessionId, 1);
      const bad: unknown[] = [
        null,
        undefined,
        'frame',
        [frame],
        { ...frame, v: 2 },
        { ...frame, seq: 0 },
        { ...frame, seq: 1.5 },
        { ...frame, seq: '1' },
        { ...frame, extra: 1 },
        { v: 1, seq: 1, iv: frame.iv },
        { ...frame, iv: frame.iv.slice(1) },
        { ...frame, iv: frame.iv + 'A' },
        { ...frame, ct: frame.ct.slice(4) },
        { ...frame, ct: frame.ct.slice(0, -1) + '=' },
        { ...frame, ct: '+' + frame.ct.slice(1) },
        JSON.parse(`{"v":1,"seq":1,"iv":"${frame.iv}","ct":"${frame.ct}","__proto__":{}}`),
      ];
      for (const value of bad) {
        expect(await openFrame(key, sessionId, 0, value)).toEqual({
          ok: false,
          error: 'malformed_frame',
        });
      }
      expect(decrypt).not.toHaveBeenCalled();
    });

    it('authentic frames with bad padding or a bad message', async () => {
      const aad = buildAad(sessionId, 1);
      const json = new TextEncoder().encode(JSON.stringify(hello));
      const cases: [Uint8Array<ArrayBuffer>, string][] = [
        [rawPadded(json, 512), 'bad_padding'],
        [rawPadded(json, 256, 300), 'bad_padding'],
        [rawPadded(new TextEncoder().encode('{"t":"evil","ts":1}'), 256), 'bad_message'],
        [rawPadded(new Uint8Array([0xff]), 256), 'bad_message'],
      ];
      for (const [plaintext, error] of cases) {
        const frame = await encryptRaw(key, plaintext, aad, 1);
        expect(await openFrame(key, sessionId, 0, frame)).toEqual({ ok: false, error });
      }
    });

    it('returns the authenticated seq even if the caller changes the frame mid-decryption', async () => {
      const frame: Frame = await seal(key, sessionId, 1);
      const pending = openFrame(key, sessionId, 0, frame);
      frame.seq = 99; // decrypt is in flight
      expect(await pending).toEqual({ ok: true, seq: 1, message: hello });
    });

    it('maps other WebCrypto failures to crypto_failure, never a raw DOMException', async () => {
      const frame = await seal(key, sessionId, 1);
      const encryptOnly = await newKey(['encrypt']);
      expect(await openFrame(encryptOnly, sessionId, 0, frame)).toEqual({
        ok: false,
        error: 'crypto_failure',
      });
      expect(await openFrame(key, 'bad', 0, frame)).toEqual({
        ok: false,
        error: 'invalid_session',
      });
    });
  });

  describe('plaintext buffers', () => {
    it('zeroes the padded plaintext after sealing', async () => {
      const encrypt = vi.spyOn(crypto.subtle, 'encrypt');
      await seal(key, sessionId, 1);
      const plaintext = encrypt.mock.calls[0]![2] as Uint8Array;
      expect(plaintext.length).toBe(PADDING_BUCKETS[0]);
      expect(plaintext.every((b) => b === 0)).toBe(true);
    });

    it('zeroes the decrypted plaintext after opening', async () => {
      const frame = await seal(key, sessionId, 1);
      const original = crypto.subtle.decrypt.bind(crypto.subtle);
      const buffers: ArrayBuffer[] = [];
      vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args) => {
        const buffer = await original(...args);
        buffers.push(buffer);
        return buffer;
      });
      expect((await openFrame(key, sessionId, 0, frame)).ok).toBe(true);
      expect(buffers).toHaveLength(1);
      expect(new Uint8Array(buffers[0]!).every((b) => b === 0)).toBe(true);
    });
  });

  it('classifies relay-caused failures as integrity errors', () => {
    expect([...INTEGRITY_ERRORS].sort()).toEqual(
      ['auth_failed', 'bad_message', 'bad_padding', 'malformed_frame', 'replay'].sort(),
    );
    expect(isIntegrityError('replay')).toBe(true);
    expect(isIntegrityError('crypto_failure')).toBe(false);
    expect(isIntegrityError('invalid_session')).toBe(false);
  });

  describe('FrameSealer / FrameOpener', () => {
    it('numbers frames 1, 2, 3 in call order even when sealed concurrently', async () => {
      const sealer = new FrameSealer(key, sessionId);
      const big = textMessageOfPaddedSize(40_000);
      const results = await Promise.all([
        sealer.seal(big),
        sealer.seal(hello),
        sealer.seal({ t: 'beat', ts: 1 }),
      ]);
      expect(results.map((r) => (r.ok ? r.frame.seq : r.error))).toEqual([1, 2, 3]);
    });

    it('does not consume a seq on a failed seal', async () => {
      const sealer = new FrameSealer(key, sessionId);
      const bad = { t: 'nope', ts: 1 } as unknown as PlaintextMessage;
      expect(await sealer.seal(bad)).toEqual({ ok: false, error: 'invalid_message' });
      const next = await sealer.seal(hello);
      expect(next.ok && next.frame.seq).toBe(1);
    });

    it('accepts in-order frames and drops replays and older frames as replay', async () => {
      const sealer = new FrameSealer(key, sessionId);
      const opener = new FrameOpener(key, sessionId);
      const frames: Frame[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await sealer.seal({ t: 'text', text: `v${i}`, ts: i });
        if (!r.ok) throw new Error(r.error);
        frames.push(r.frame);
      }
      expect(opener.lastSeq).toBe(0);
      expect((await opener.open(frames[0])).ok).toBe(true);
      expect(await opener.open(frames[0])).toEqual({ ok: false, error: 'replay' });
      expect((await opener.open(frames[2])).ok).toBe(true); // a gap is fine (dropped frame)
      expect(opener.lastSeq).toBe(3);
      expect(await opener.open(frames[1])).toEqual({ ok: false, error: 'replay' });
      expect((await opener.open(frames[3])).ok).toBe(true);
      expect(opener.lastSeq).toBe(4);
    });

    it('does not advance lastSeq on a rejected frame', async () => {
      const sealer = new FrameSealer(key, sessionId);
      const opener = new FrameOpener(key, sessionId);
      const r = await sealer.seal(hello);
      if (!r.ok) throw new Error(r.error);
      const forged = { ...r.frame, seq: 99 };
      expect(await opener.open(forged)).toEqual({ ok: false, error: 'auth_failed' });
      expect(opener.lastSeq).toBe(0);
      expect((await opener.open(r.frame)).ok).toBe(true);
    });

    it('does not advance lastSeq on an authentic frame with bad padding or a bad message', async () => {
      const opener = new FrameOpener(key, sessionId);
      const json = new TextEncoder().encode(JSON.stringify(hello));
      const badPadding = await encryptRaw(key, rawPadded(json, 512), buildAad(sessionId, 5), 5);
      const badMessage = await encryptRaw(
        key,
        rawPadded(new TextEncoder().encode('{"t":"evil","ts":1}'), 256),
        buildAad(sessionId, 6),
        6,
      );
      expect(await opener.open(badPadding)).toEqual({ ok: false, error: 'bad_padding' });
      expect(await opener.open(badMessage)).toEqual({ ok: false, error: 'bad_message' });
      expect(opener.lastSeq).toBe(0);
      expect(await opener.open(await seal(key, sessionId, 2))).toEqual({
        ok: true,
        seq: 2,
        message: hello,
      });
    });

    it('opens concurrent arrivals one at a time: in order accepted, duplicate rejected', async () => {
      const sealer = new FrameSealer(key, sessionId);
      const opener = new FrameOpener(key, sessionId);
      const sealed = await Promise.all([
        sealer.seal(textMessageOfPaddedSize(40_000)),
        sealer.seal(hello),
      ]);
      const [a, b] = sealed.map((r) => {
        if (!r.ok) throw new Error(r.error);
        return r.frame;
      });
      const results = await Promise.all([opener.open(a), opener.open(b), opener.open(b)]);
      expect(results.map((r) => (r.ok ? r.seq : r.error))).toEqual([1, 2, 'replay']);
      expect(opener.lastSeq).toBe(2);
    });
  });
});
