/**
 * Framework-independent angle math for jog wheel interaction.
 *
 * All angles are in radians. Positive = clockwise (forward in transport).
 * The helpers here have no DOM or framework dependencies — they can be
 * used by the React debug UI, a future Three.js jog wheel, or unit tests.
 */

/** Dead zone: ignore angular deltas smaller than this (radians ≈ 0.5°) */
export const JOG_DEAD_ZONE = 0.0087 // ~0.5 degrees

/** Nudge velocity threshold: angular velocity above this triggers nudge */
export const NUDGE_VELOCITY_THRESHOLD = 0.05 // radians / frame

/**
 * Normalize an angular delta to the shortest signed path across the
 * ±π wraparound boundary.
 *
 * Examples:
 *   normalizeAngleDelta(3.0)   →  3.0   (clockwise, less than π)
 *   normalizeAngleDelta(-3.0)  → -3.0   (counter-clockwise, less than π)
 *   normalizeAngleDelta(3.2)   → -3.08  (wraps around +π)
 *   normalizeAngleDelta(-3.2)  →  3.08  (wraps around -π)
 *   normalizeAngleDelta(Math.PI + 0.1) → -(Math.PI - 0.1)
 */
export function normalizeAngleDelta(delta: number): number {
  // Wrap to [-2π, +2π] first
  const TWO_PI = Math.PI * 2
  let d = delta % TWO_PI
  // Now bring into (-2π, +2π)
  if (d > Math.PI) d -= TWO_PI
  if (d < -Math.PI) d += TWO_PI
  return d
}

/**
 * Calculate the shortest angular delta between two angles (radians).
 * Handles wraparound correctly.
 *
 * @param prevAngle - previous angle in radians
 * @param currAngle - current angle in radians
 * @returns normalized signed delta in radians
 */
export function angleDelta(prevAngle: number, currAngle: number): number {
  return normalizeAngleDelta(currAngle - prevAngle)
}

/**
 * Calculate angle from center to point, in radians.
 * Returns a value in (-π, +π].
 *
 * Positive = clockwise from 3 o'clock (standard math convention).
 * For DJ jog wheels, "forward" drag (rightward on top) = positive angle.
 *
 * @param x - point X coordinate
 * @param y - point Y coordinate
 * @param cx - center X coordinate
 * @param cy - center Y coordinate
 */
export function pointToAngle(x: number, y: number, cx: number, cy: number): number {
  return Math.atan2(y - cy, x - cx)
}

/**
 * Estimate angular velocity from delta and elapsed time.
 * Returns 0 for zero or negative elapsed time to avoid division by zero.
 *
 * @param deltaRadians - angular change in radians
 * @param elapsedMs - time elapsed in milliseconds
 * @returns angular velocity in radians per millisecond
 */
export function angularVelocity(deltaRadians: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || !isFinite(elapsedMs)) return 0
  const v = deltaRadians / elapsedMs
  return isFinite(v) ? v : 0
}

/**
 * Smooth velocity using exponential moving average.
 *
 * @param newVelocity - latest velocity sample
 * @param prevSmoothed - previous smoothed velocity
 * @param alpha - smoothing factor (0 = no change, 1 = no smoothing)
 * @returns smoothed velocity
 */
export function smoothVelocity(
  newVelocity: number,
  prevSmoothed: number,
  alpha = 0.3,
): number {
  return alpha * newVelocity + (1 - alpha) * prevSmoothed
}

/**
 * Determine transport direction from angular delta.
 * Positive delta = forward, negative = backward.
 * Returns null for zero delta.
 */
export function deltaDirection(delta: number): 'forward' | 'backward' | null {
  if (Math.abs(delta) < JOG_DEAD_ZONE) return null
  return delta > 0 ? 'forward' : 'backward'
}

/**
 * Clamp velocity to a safe range.
 * Prevents extreme values from pointer teleports or clock glitches.
 *
 * @param v - raw velocity
 * @param maxAbs - maximum absolute value
 * @returns clamped velocity
 */
export function clampVelocity(v: number, maxAbs = 2.0): number {
  return Math.max(-maxAbs, Math.min(maxAbs, v))
}
