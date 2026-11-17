import { describe, expect, it } from 'vitest';
import { isSessionId, isToken } from '@tincan/shared';
import { RateLimiter } from '../src/relay/rate-limit.js';
import { newSessionId, newToken, tokensEqual } from '../src/relay/tokens.js';

describe('ids and tokens', () => {
  it('generates canonical, distinct 128-bit ids and tokens', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newSessionId()));
    const tokens = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(ids.size).toBe(200);
    expect(tokens.size).toBe(200);
    for (const id of ids) expect(isSessionId(id)).toBe(true);
    for (const token of tokens) expect(isToken(token)).toBe(true);
  });

  it('compares tokens exactly', () => {
    const token = newToken();
    expect(tokensEqual(token, token)).toBe(true);
    expect(tokensEqual(token, `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).toBe(
      false,
    );
    expect(tokensEqual(token, token.slice(1))).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('allows max events per window, then limits, then reports a flood', () => {
    const limiter = new RateLimiter(1000, 3, 6);
    const verdicts = Array.from({ length: 6 }, () => limiter.hit(0));
    expect(verdicts).toEqual(['ok', 'ok', 'ok', 'limited', 'limited', 'flood']);
  });

  it('starts a new window after windowMs', () => {
    const limiter = new RateLimiter(1000, 1, 10);
    expect(limiter.hit(0)).toBe('ok');
    expect(limiter.hit(999)).toBe('limited');
    expect(limiter.hit(1000)).toBe('ok');
  });
});
