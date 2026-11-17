/**
 * Motion helpers. Every animation in the app is CSS or the Web Animations API (no inline style
 * attributes, so the strict style-src CSP holds). Script-driven motion asks here first, so a
 * reduced-motion preference, or a runtime without `matchMedia`/`animate` (jsdom), gets the static state.
 */
export function motionAllowed(): boolean {
  try {
    return (
      typeof globalThis.matchMedia === 'function' &&
      !globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** Plays a one-shot animation when motion is allowed; returns null otherwise. */
export function play(
  el: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (!el || typeof el.animate !== 'function' || !motionAllowed()) return null;
  return el.animate(keyframes, options);
}
