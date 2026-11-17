import { DOCUMENT, Injectable, inject } from '@angular/core';
import { RelayService } from '../relay/relay.service';
import { SenderSession } from '../sender/sender-session';

/**
 * Ends the session when the page goes away (ADR 0004): keys are memory-only, so a reload or close
 * cannot resume, and the peer is told at once (`peer_left`) instead of waiting out the 20 s grace.
 *
 * - `pagehide`, not `beforeunload` (unreliable, blocks bfcache) and not `visibilitychange` (switching
 *   tabs on a phone must not end the line).
 * - `leave()` is an explicit socket disconnect: socket.io writes the disconnect packet to the open
 *   WebSocket synchronously, so it goes out before the page is torn down.
 * - A page restored from bfcache (`pageshow` with `persisted`) cannot resume: the key and the token are
 *   gone, so it must show the ended state, not a dead live view. `pagehide` already ended it; the
 *   restore re-asserts that in case the page was frozen without the event reaching us.
 * - Component-scoped sessions (the receiver) register through `onHide()` to drop their own key and
 *   plaintext; the root `SenderSession` is ended directly.
 */
@Injectable({ providedIn: 'root' })
export class PageLifecycle {
  private readonly relay = inject(RelayService);
  private readonly sender = inject(SenderSession);
  private readonly target = inject(DOCUMENT).defaultView;
  private readonly hideHandlers = new Set<() => void>();
  private started = false;

  /** Starts listening. Idempotent; a no-op without a window (server rendering, tests). */
  init(): void {
    if (this.started || !this.target) return;
    this.started = true;
    this.target.addEventListener('pagehide', () => this.endSession());
    this.target.addEventListener('pageshow', (event) => {
      if ((event as PageTransitionEvent).persisted) this.endSession();
    });
  }

  /** Runs `handler` when the page goes away (and again on a bfcache restore). Returns an unregister. */
  onHide(handler: () => void): () => void {
    this.hideHandlers.add(handler);
    return () => this.hideHandlers.delete(handler);
  }

  private endSession(): void {
    // Each step runs even if an earlier one throws: the explicit leave is what tells the peer, and an
    // exception escaping a pagehide listener would only end up in the console.
    const steps = [...this.hideHandlers, () => this.sender.end()];
    for (const step of steps) {
      try {
        step();
      } catch {
        // Nothing to report to: the page is going away.
      }
    }
    if (this.relay.status() !== 'ended') this.relay.leave();
  }
}
