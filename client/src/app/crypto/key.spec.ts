import { isKeyString } from '@tincan/shared';
import { openFrame, sealFrame } from './frame-crypto';
import {
  clearFragment,
  generateSessionKey,
  importKeyFromFragment,
  importKeyString,
  type FragmentHistory,
  type FragmentLocation,
} from './key';
import { randomSessionId } from './test-helpers';

function fakeWindow(hash: string): {
  location: FragmentLocation;
  history: FragmentHistory;
  replaceState: ReturnType<typeof vi.fn>;
} {
  const replaceState = vi.fn();
  return {
    location: { hash, pathname: '/r/abc', search: '?x=1' },
    history: { state: { keep: true }, replaceState },
    replaceState,
  };
}

async function expectNonExtractable(key: CryptoKey): Promise<void> {
  expect(key.extractable).toBe(false);
  expect(key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
  expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
  await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  await expect(crypto.subtle.exportKey('jwk', key)).rejects.toThrow();
}

describe('session key', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('generates a non-extractable AES-256-GCM key and its 43-char base64url form', async () => {
    const result = await generateSessionKey();
    if (!result.ok) throw new Error(result.error);
    await expectNonExtractable(result.value.key);
    expect(isKeyString(result.value.keyString)).toBe(true);
  });

  it('generates a different key every time', async () => {
    const strings = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const r = await generateSessionKey();
      if (!r.ok) throw new Error(r.error);
      strings.add(r.value.keyString);
    }
    expect(strings.size).toBe(50);
  });

  it('the imported key string interoperates with the generated key', async () => {
    const generated = await generateSessionKey();
    if (!generated.ok) throw new Error(generated.error);
    const imported = await importKeyString(generated.value.keyString);
    if (!imported.ok) throw new Error(imported.error);
    await expectNonExtractable(imported.value);

    const sessionId = randomSessionId();
    const message = { t: 'text', text: 'hi', ts: 1 } as const;
    const sealed = await sealFrame(generated.value.key, sessionId, 1, message);
    if (!sealed.ok) throw new Error(sealed.error);
    expect(await openFrame(imported.value, sessionId, 0, sealed.frame)).toEqual({
      ok: true,
      seq: 1,
      message,
    });
  });

  it('rejects malformed key strings', async () => {
    const valid = 'A'.repeat(43);
    expect((await importKeyString(valid)).ok).toBe(true);
    const bad: unknown[] = [
      '',
      'A'.repeat(42),
      'A'.repeat(44),
      `${'A'.repeat(43)}=`,
      `${'A'.repeat(42)}B`, // non-zero trailing bits: not canonical
      `+${'A'.repeat(42)}`,
      `/${'A'.repeat(42)}`,
      ` ${'A'.repeat(42)}`,
      `%41${'A'.repeat(40)}`,
      `${'A'.repeat(42)}\u00e9`,
      42,
      null,
      undefined,
      new Uint8Array(32),
    ];
    for (const value of bad) {
      expect(await importKeyString(value)).toEqual({ ok: false, error: 'malformed_key' });
    }
  });

  it('reports unsupported when WebCrypto is unavailable', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(await generateSessionKey()).toEqual({ ok: false, error: 'unsupported' });
    const fill = vi.spyOn(Uint8Array.prototype, 'fill');
    expect(await importKeyString('_'.repeat(42) + 'w')).toEqual({
      ok: false,
      error: 'unsupported',
    });
    // The decoded key bytes are zeroed on this path too.
    const zeroed = fill.mock.contexts.filter((buf) => (buf as Uint8Array).length === 32);
    expect(zeroed).toHaveLength(1);
    expect((zeroed[0] as Uint8Array).every((b) => b === 0)).toBe(true);
    vi.restoreAllMocks();
  });

  it('maps an unexpected importKey failure to crypto_failure', async () => {
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(new DOMException('x', 'DataError'));
    expect(await importKeyString('A'.repeat(43))).toEqual({ ok: false, error: 'crypto_failure' });
    vi.restoreAllMocks();
  });

  it('zeroes the raw key bytes after import', async () => {
    const spy = vi.spyOn(crypto.subtle, 'importKey');
    const r = await generateSessionKey();
    expect(r.ok).toBe(true);
    const raw = spy.mock.calls[0]![1] as Uint8Array;
    expect(raw.every((b) => b === 0)).toBe(true);
    expect(spy.mock.calls[0]![3]).toBe(false);
    vi.restoreAllMocks();
  });

  describe('fragment', () => {
    it('imports the key from the fragment and clears it, keeping path, query and state', async () => {
      const generated = await generateSessionKey();
      if (!generated.ok) throw new Error(generated.error);
      const w = fakeWindow(`#${generated.value.keyString}`);
      const result = await importKeyFromFragment(w.location, w.history);
      if (!result.ok) throw new Error(result.error);
      await expectNonExtractable(result.value);
      expect(w.replaceState).toHaveBeenCalledExactlyOnceWith({ keep: true }, '', '/r/abc?x=1');
    });

    it('clears a malformed fragment too, then reports malformed_key', async () => {
      for (const hash of [
        '#short',
        '#' + 'A'.repeat(42) + 'B',
        '#%20',
        '#' + 'A'.repeat(43) + '&x',
      ]) {
        const w = fakeWindow(hash);
        expect(await importKeyFromFragment(w.location, w.history)).toEqual({
          ok: false,
          error: 'malformed_key',
        });
        expect(w.replaceState).toHaveBeenCalledOnce();
      }
    });

    it('reports missing_key without a fragment', async () => {
      const w = fakeWindow('');
      expect(await importKeyFromFragment(w.location, w.history)).toEqual({
        ok: false,
        error: 'missing_key',
      });
      expect(w.replaceState).not.toHaveBeenCalled();
    });

    it('clears the real address bar fragment', async () => {
      history.replaceState(null, '', `/r/session?q=1#${'A'.repeat(43)}`);
      expect(location.hash).not.toBe('');
      const result = await importKeyFromFragment(location, history);
      expect(result.ok).toBe(true);
      expect(location.hash).toBe('');
      expect(location.pathname + location.search).toBe('/r/session?q=1');
      clearFragment(location, history); // idempotent
      expect(location.href.includes('#')).toBe(false);
    });
  });
});
