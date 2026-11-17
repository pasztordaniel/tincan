/**
 * Where the placeholder cans sit in the shared 320x160 viewBox. The can is drawn once along its own
 * x axis (open mouth at -x, closed bottom at +x, where the string goes through), then posed here, so
 * every illustration uses the same two angles from the maintainer's sketch.
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
