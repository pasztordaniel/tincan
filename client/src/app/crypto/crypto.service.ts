import { DOCUMENT, Injectable, inject } from '@angular/core';
import { FrameOpener, FrameSealer } from './frame-crypto';
import {
  generateSessionKey,
  importKeyFromFragment,
  type GeneratedKey,
  type KeyResult,
} from './key';

/**
 * Thin Angular entry point to the framework-free crypto module, so views get it by injection (and
 * tests can replace it). All logic lives in `key.ts`, `frame-crypto.ts` and `padding.ts`.
 */
@Injectable({ providedIn: 'root' })
export class CryptoService {
  private readonly document = inject(DOCUMENT);

  /** Sender: a new non-extractable session key and its base64url form for the link fragment. */
  generateKey(): Promise<KeyResult<GeneratedKey>> {
    return generateSessionKey();
  }

  /** Receiver: reads and clears `location.hash`, then imports the key non-extractable. */
  importKeyFromFragment(): Promise<KeyResult<CryptoKey>> {
    const view = this.document.defaultView;
    if (view === null) return Promise.resolve({ ok: false, error: 'unsupported' });
    return importKeyFromFragment(view.location, view.history);
  }

  createSealer(key: CryptoKey, sessionId: string): FrameSealer {
    return new FrameSealer(key, sessionId);
  }

  createOpener(key: CryptoKey, sessionId: string): FrameOpener {
    return new FrameOpener(key, sessionId);
  }
}
