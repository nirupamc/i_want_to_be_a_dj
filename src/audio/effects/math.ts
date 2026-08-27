/**
 * M9 Effects math helpers.
 * Framework-independent, deterministic, testable.
 */

import { BEAT_MULTIPLIERS } from './types'

const RAMP = 0.02 // seconds for parameter smoothing

/**
 * Calculate effect time from BPM and beat multiplier.
 * beatSeconds = 60 / bpm * multiplier
 *
 * @param bpm - beats per minute (must be > 0)
 * @param multiplierIndex - index into BEAT_MULTIPLIERS
 * @returns effect time in seconds
 */
export function beatToSeconds(bpm: number, multiplierIndex: number): number {
  if (bpm <= 0 || !isFinite(bpm)) return 0
  const idx = Math.max(0, Math.min(BEAT_MULTIPLIERS.length - 1, multiplierIndex))
  const multiplier = BEAT_MULTIPLIERS[idx]
  return (60 / bpm) * multiplier
}

/**
 * Resolve BPM from deck state.
 * Priority: manual override > analyzed BPM
 */
export function resolveFxBpm(
  manualBpm: number | null,
  analyzedBpm: number | null,
): number | null {
  if (manualBpm !== null && manualBpm > 0) return manualBpm
  if (analyzedBpm !== null && analyzedBpm > 0) return analyzedBpm
  return null
}

/**
 * Calculate wet/dry gain values using equal-power crossfade.
 * At mix=0: fully dry. At mix=1: fully wet.
 */
export function wetDryGain(mix: number): { dry: number; wet: number } {
  const t = Math.max(0, Math.min(1, mix))
  return {
    dry: Math.cos(t * Math.PI / 2),
    wet: Math.sin(t * Math.PI / 2),
  }
}

/**
 * Smoothly ramp a GainNode value.
 */
export function rampGain(
  ctx: AudioContext,
  node: GainNode,
  target: number,
  rampSeconds: number = RAMP,
): void {
  const now = ctx.currentTime
  node.gain.cancelScheduledValues(now)
  node.gain.setValueAtTime(node.gain.value, now)
  node.gain.linearRampToValueAtTime(Math.max(0, Math.min(2, target)), now + rampSeconds)
}

/**
 * Smoothly ramp an AudioParam value.
 */
export function rampParam(
  ctx: AudioContext,
  param: AudioParam,
  target: number,
  rampSeconds: number = RAMP,
): void {
  const now = ctx.currentTime
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(target, now + rampSeconds)
}

/**
 * Generate a procedural impulse response for reverb.
 * Creates a decaying noise buffer.
 *
 * @param ctx - AudioContext
 * @param duration - impulse duration in seconds
 * @param decay - decay factor (0..1, higher = longer tail)
 * @returns AudioBuffer containing the impulse response
 */
export function generateImpulseResponse(
  ctx: AudioContext,
  duration: number = 2.0,
  decay: number = 2.0,
): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.floor(sampleRate * duration)
  const buffer = ctx.createBuffer(2, length, sampleRate)

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      // White noise with exponential decay
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }

  return buffer
}

/**
 * Calculate smart fader transition EQ mapping.
 * Returns low EQ dB for outgoing and incoming decks.
 *
 * @param progress - 0..1 (0 = fully A, 1 = fully B)
 * @param direction - 'A_TO_B' or 'B_TO_A'
 * @returns [outgoingLowEq, incomingLowEq] in dB
 */
export function smartFaderEqMapping(
  progress: number,
  direction: 'A_TO_B' | 'B_TO_A',
): [number, number] {
  const t = Math.max(0, Math.min(1, progress))

  if (direction === 'A_TO_B') {
    // Outgoing (A): LOW EQ fades out from 0 to -26 dB
    // Incoming (B): LOW EQ fades in from -26 to 0 dB
    const outgoingLow = -26 * t
    const incomingLow = -26 * (1 - t)
    return [outgoingLow, incomingLow]
  }

  // B_TO_A: mirror
  const outgoingLow = -26 * t
  const incomingLow = -26 * (1 - t)
  return [incomingLow, outgoingLow]
}

/**
 * Calculate smart fader echo amount based on transition progress.
 * Echo increases near the end of the transition.
 *
 * @param progress - 0..1
 * @returns echo depth 0..1
 */
export function smartFaderEchoAmount(progress: number): number {
  const t = Math.max(0, Math.min(1, progress))
  // Echo increases in the last 30% of the transition
  if (t < 0.7) return 0
  return (t - 0.7) / 0.3
}

/** Clamp a number to a range */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Safe feedback value to prevent runaway echo */
export const MAX_FEEDBACK = 0.85

/** Echo/Reverb tail fade time after effect disabled */
export const TAIL_FADE_SECONDS = 0.5
