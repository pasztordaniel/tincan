import { play } from '../ui/motion';

/** Minimum gap between two pulses, so fast typing reads as a steady hum, not a strobe. */
export const PULSE_GAP_MS = 320;

/**
 * Sends a short bright dash along the live string and gives the string a small twang (a frame sent
 * or received). Called from ngOnChanges, so it runs per event and never loops: when the text stops,
 * the string rests. Skipped entirely under prefers-reduced-motion (see `play`).
 */
export class StringPulse {
  private last = 0;

  fire(pulse: SVGPathElement | undefined, string: SVGPathElement | undefined): void {
    const now = Date.now();
    if (now - this.last < PULSE_GAP_MS) return;
    this.last = now;
    play(
      pulse,
      [
        { strokeDashoffset: 0.12, opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { opacity: 1, offset: 0.8 },
        { strokeDashoffset: -1, opacity: 0 },
      ],
      { duration: 900, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
    play(
      string,
      [
        { transform: 'none' },
        { transform: 'translateY(-1.5px)', offset: 0.3 },
        { transform: 'translateY(0.8px)', offset: 0.6 },
        { transform: 'none' },
      ],
      { duration: 520, easing: 'ease-out' },
    );
  }
}
