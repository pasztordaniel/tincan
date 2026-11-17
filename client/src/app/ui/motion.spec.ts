import { afterEach, describe, expect, it, vi } from 'vitest';
import { motionAllowed, play } from './motion';

describe('motion', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubMedia = (reduce: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce') }));

  it('stays still without matchMedia (no way to know the preference)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(motionAllowed()).toBe(false);
  });

  it('honours prefers-reduced-motion', () => {
    stubMedia(true);
    const el = { animate: vi.fn() } as unknown as Element;
    expect(motionAllowed()).toBe(false);
    expect(play(el, [], { duration: 1 })).toBeNull();
    expect(el.animate as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('plays through the Web Animations API when motion is fine', () => {
    stubMedia(false);
    const animation = {} as Animation;
    const el = { animate: vi.fn(() => animation) } as unknown as Element;
    expect(play(el, [{ opacity: 0 }], { duration: 10 })).toBe(animation);
  });
});
