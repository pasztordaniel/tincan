import { TestBed } from '@angular/core/testing';
import { CryptoService } from './crypto.service';
import { randomSessionId } from './test-helpers';

describe('CryptoService', () => {
  it('wires key generation, sealer and opener together', async () => {
    const service = TestBed.inject(CryptoService);
    const generated = await service.generateKey();
    if (!generated.ok) throw new Error(generated.error);
    const sessionId = randomSessionId();
    const sealer = service.createSealer(generated.value.key, sessionId);
    const opener = service.createOpener(generated.value.key, sessionId);
    const sealed = await sealer.seal({ t: 'beat', ts: 1 });
    if (!sealed.ok) throw new Error(sealed.error);
    expect(await opener.open(sealed.frame)).toEqual({
      ok: true,
      seq: 1,
      message: { t: 'beat', ts: 1 },
    });
  });

  it('imports from and clears the document location fragment', async () => {
    const service = TestBed.inject(CryptoService);
    const generated = await service.generateKey();
    if (!generated.ok) throw new Error(generated.error);
    history.replaceState(null, '', `/r/x#${generated.value.keyString}`);
    const imported = await service.importKeyFromFragment();
    expect(imported.ok).toBe(true);
    expect(location.hash).toBe('');
  });
});
