/**
 * Scratch math helpers for M5 audio scrubbing.
 *
 * These convert M4 jog interaction data (angular deltas, velocity) into
 * transport-level position deltas and audio preview parameters.
 *
 * All functions are framework-independent (no DOM, no React, no Web Audio).
 */

/**
 * Conversion factor: radians of platter rotation → seconds of audio position.
 *
 * At 1.0, one full radian of platter rotation scrubs 0.15 seconds of audio.
 * A full 360° rotation (2π ≈ 6.28 rad) scrubs ~0.94 seconds — enough to
 * feel responsive without overshooting on a typical 3-4 second drag.
 *
 * This constant does NOT need to perfectly match the FLX4 hardware; it is
 * a tunable software parameter.
 */
export const SCRATCH_SECONDS_PER_RADIAN = 0.15

/** Minimum delta (radians) to trigger a position update — avoids micro-jitter */
export const SCRATCH_MIN_DELTA = 0.005

/** Audio preview playback rate multiplier based on velocity (rad/ms).
 *  Slow movement: rate ≈ 0.3× (subtle, hear current position)
 *  Fast movement: rate ≈ 2.0× (fast scrub preview)
 */
export const SCRATCH_RATE_MIN = 0.3
export const SCRATCH_RATE_MAX = 2.0
export const SCRATCH_VELOCITY_MIN = 0.001 // below this, use minimum rate
export const SCRATCH_VELOCITY_MAX = 0.5  // above this, use maximum rate

/**
 * Convert angular delta (radians) to position delta (seconds).
 *
 * @param deltaRadians - angular movement from jog interaction
 * @returns position delta in seconds (positive = forward)
 */
export function scratchDeltaToSeconds(deltaRadians: number): number {
  return deltaRadians * SCRATCH_SECONDS_PER_RADIAN
}

/**
 * Convert platter velocity (rad/ms) to audio preview playback rate.
 *
 * Uses a simple linear interpolation between SCRATCH_RATE_MIN and
 * SCRATCH_RATE_MAX, clamped to safe bounds.
 *
 * @param velocity - angular velocity from jog interaction (rad/ms)
 * @returns playback rate for scratch preview (always positive, clamped)
 */
export function scratchVelocityToRate(velocity: number): number {
  const absVel = Math.abs(velocity)
  const t = Math.max(0, Math.min(1,
    (absVel - SCRATCH_VELOCITY_MIN) / (SCRATCH_VELOCITY_MAX - SCRATCH_VELOCITY_MIN)
  ))
  return SCRATCH_RATE_MIN + t * (SCRATCH_RATE_MAX - SCRATCH_RATE_MIN)
}

/**
 * Clamp a scratch position to valid range [0, duration].
 *
 * @param position - proposed position in seconds
 * @param duration - track duration in seconds
 * @returns clamped position
 */
export function clampScratchPosition(position: number, duration: number): number {
  if (duration <= 0) return 0
  return Math.max(0, Math.min(duration, position))
}
