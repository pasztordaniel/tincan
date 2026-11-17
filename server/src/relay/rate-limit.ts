export type RateVerdict = 'ok' | 'limited' | 'flood';

/**
 * Fixed-window event counter for one socket. Cheap (two numbers, no timers) and good enough for a
 * relay whose honest clients send a few events per second: events above `max` in a window are
 * dropped, and reaching `flood` events in one window marks the socket for disconnection.
 */
export class RateLimiter {
  private windowStart = Number.NEGATIVE_INFINITY;
  private count = 0;

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly flood: number,
  ) {}

  hit(now: number): RateVerdict {
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count += 1;
    if (this.count >= this.flood) return 'flood';
    if (this.count > this.max) return 'limited';
    return 'ok';
  }
}
