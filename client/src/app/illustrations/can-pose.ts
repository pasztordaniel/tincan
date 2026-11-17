/**
 * Where the placeholder cans sit in the shared 320x160 viewBox. The can is drawn once (CAN_PARTS)
 * along its own x axis, open mouth at -x and closed bottom at +x, then posed here, so every
 * illustration uses the same two angles from the maintainer's sketch. Like a real tin-can phone the
 * open end faces away from the string, toward the person, and the string leaves the closed bottom.
 */
export interface CanPose {
  readonly x: number;
  readonly y: number;
  /** Degrees, clockwise. */
  readonly angle: number;
  readonly scale: number;
  /** y of the ground shadow under the can. */
  readonly ground: number;
}

/** Lying on its side, mouth out to the left (held to an ear), tipped up a little. */
export const LEFT_CAN: CanPose = { x: 60, y: 112, angle: 8, scale: 1, ground: 146 };

/** Standing tilted, mouth up and to the right, bigger because it is closer to the viewer. */
export const RIGHT_CAN: CanPose = { x: 262, y: 100, angle: 115, scale: 1.15, ground: 152 };

export function canTransform(can: CanPose): string {
  return `translate(${can.x} ${can.y}) rotate(${can.angle}) scale(${can.scale})`;
}

/**
 * One can, seen from its open end: that is the face we look at, so it is the only full ellipse. The
 * bands curve toward the bottom (the near half of each ring), the bottom is just the silhouette with a
 * crimped seam, and the knot sits where the string leaves the middle of the bottom.
 */
export const CAN_PARTS: readonly { readonly part: string; readonly d: string }[] = [
  { part: 'can__body', d: 'M-35 -26H35A8 26 0 0 1 35 26H-35Z' },
  { part: 'can__label', d: 'M-9 -26H9A8 26 0 0 1 9 26H-9A8 26 0 0 0 -9 -26Z' },
  { part: 'can__ridge', d: 'M-22 -26A8 26 0 0 1 -22 26M16 -26A8 26 0 0 1 16 26' },
  { part: 'can__seam', d: 'M29 -25.5A8 26 0 0 1 29 25.5' },
  { part: 'can__lip', d: 'M-35 -26A8 26 0 1 1 -35 26A8 26 0 1 1 -35 -26Z' },
  { part: 'can__mouth', d: 'M-35 -21.5A5.5 21.5 0 1 1 -35 21.5A5.5 21.5 0 1 1 -35 -21.5Z' },
  { part: 'can__wall', d: 'M-35 -21.5A5.5 21.5 0 0 0 -35 21.5A2.5 21.5 0 0 1 -35 -21.5Z' },
  { part: 'can__knot', d: 'M40.8 0A2.2 2.2 0 1 0 45.2 0A2.2 2.2 0 1 0 40.8 0Z' },
];
