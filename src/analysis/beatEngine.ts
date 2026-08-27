/**
 * Beat engine: sync, loops, and beat jump.
 *
 * Framework-independent domain logic. Consumed by DJEngine.
 * All state is serializable — no AudioNodes, AudioContext, or DOM objects.
 *
 * Sync model: BPM match + one-time phase alignment on engage.
 * Loop model: beat-based IN/OUT with quantized transport wrapping.
 * Beat Jump model: grid-index based ±N beat jumping.
 */

import type { BeatGrid } from '../analysis/analysisTypes'
import type { LoopState, SyncState } from '../types'

// ── Sync Constants ────────────────────────────────────────────────

/** Minimum source BPM to allow sync (reject unreliable low values) */
export const SYNC_MIN_BPM = 50

/** Maximum source BPM to allow sync */
export const SYNC_MAX_BPM = 200

// ── Loop Constants ────────────────────────────────────────────────

/** Supported loop lengths in beats */
export const LOOP_LENGTHS = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const

/** Minimum loop length in beats */
export const LOOP_MIN_BEATS = 0.25

/** Maximum loop length in beats */
export const LOOP_MAX_BEATS = 32

/** Default loop length for 4-BEAT button */
export const DEFAULT_AUTO_LOOP_BEATS = 4

// ── Beat Jump Constants ───────────────────────────────────────────

/** Supported beat jump amounts */
export const BEAT_JUMP_AMOUNTS = [-8, -4, -2, -1, 1, 2, 4, 8] as const

// ── Sync Functions ────────────────────────────────────────────────

/**
 * Resolve the effective source BPM for a deck.
 * Manual override takes precedence over analyzed BPM.
 */
export function resolveSourceBpm(analysis: {
  manualBpm: number | null
  analyzedBpm: number | null
}): number | null {
  if (analysis.manualBpm !== null && analysis.manualBpm > 0) {
    return analysis.manualBpm
  }
  return analysis.analyzedBpm
}

/**
 * Check whether sync is possible between two decks.
 * Both must have valid BPM within the supported range.
 */
export function canSync(
  slaveSourceBpm: number | null,
  masterEffectiveBpm: number | null,
): boolean {
  if (slaveSourceBpm === null || slaveSourceBpm <= 0) return false
  if (masterEffectiveBpm === null || masterEffectiveBpm <= 0) return false
  if (slaveSourceBpm < SYNC_MIN_BPM || slaveSourceBpm > SYNC_MAX_BPM) return false
  if (masterEffectiveBpm < SYNC_MIN_BPM || masterEffectiveBpm > SYNC_MAX_BPM) return false
  return true
}

/**
 * Calculate required slave playback rate to match master effective BPM.
 *
 * requiredRate = masterEffectiveBpm / slaveSourceBpm
 */
export function calculateSyncRate(
  masterEffectiveBpm: number,
  slaveSourceBpm: number,
): number {
  if (slaveSourceBpm <= 0) return 1
  return masterEffectiveBpm / slaveSourceBpm
}

/**
 * Convert required playback rate to tempo percent.
 * tempoPercent = (rate - 1) * 100
 */
export function rateToTempoPercent(rate: number): number {
  return (rate - 1) * 100
}

/**
 * Check if required tempo exceeds the slave's supported range.
 * Returns true if sync is impossible without clamping.
 */
export function syncExceedsRange(
  requiredTempoPercent: number,
  range: number,
): boolean {
  return Math.abs(requiredTempoPercent) > range
}

/**
 * Calculate phase error between master and slave beatgrids at given positions.
 *
 * Returns the time difference (in seconds) between the nearest master beat
 * and nearest slave beat relative to the current slave position.
 * Positive = slave is behind master, negative = slave is ahead.
 */
export function calculatePhaseError(
  masterGrid: BeatGrid,
  slaveGrid: BeatGrid,
  slavePosition: number,
): number | null {
  // Find nearest slave beat to current position
  const nearestSlave = findNearestBeatTime(slavePosition, slaveGrid)
  if (nearestSlave === null) return null

  // Find nearest master beat to the same time reference
  const nearestMaster = findNearestBeatTime(nearestSlave, masterGrid)
  if (nearestMaster === null) return null

  // Phase error: how far the slave beat is from the nearest master beat
  return nearestSlave - nearestMaster
}

/**
 * Find the nearest beat time in a grid to a given position.
 */
function findNearestBeatTime(time: number, grid: BeatGrid): number | null {
  if (grid.beats.length === 0) return null

  let bestIdx = 0
  let bestDist = Math.abs(grid.beats[0] - time)

  for (let i = 1; i < grid.beats.length; i++) {
    const dist = Math.abs(grid.beats[i] - time)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  return grid.beats[bestIdx]
}

/**
 * Calculate target position for phase alignment.
 * Seeks the slave so its nearest beat aligns with the nearest master beat.
 */
export function calculatePhaseAlignPosition(
  masterGrid: BeatGrid,
  slaveGrid: BeatGrid,
  slavePosition: number,
): number | null {
  if (slaveGrid.beats.length === 0 || masterGrid.beats.length === 0) return null

  // Find nearest slave beat to current position
  let nearestSlaveIdx = 0
  let nearestSlaveDist = Math.abs(slaveGrid.beats[0] - slavePosition)
  for (let i = 1; i < slaveGrid.beats.length; i++) {
    const dist = Math.abs(slaveGrid.beats[i] - slavePosition)
    if (dist < nearestSlaveDist) {
      nearestSlaveDist = dist
      nearestSlaveIdx = i
    }
  }

  const nearestSlaveBeat = slaveGrid.beats[nearestSlaveIdx]

  // Find the master beat closest to this slave beat
  let nearestMasterIdx = 0
  let nearestMasterDist = Math.abs(masterGrid.beats[0] - nearestSlaveBeat)
  for (let i = 1; i < masterGrid.beats.length; i++) {
    const dist = Math.abs(masterGrid.beats[i] - nearestSlaveBeat)
    if (dist < nearestMasterDist) {
      nearestMasterDist = dist
      nearestMasterIdx = i
    }
  }

  const nearestMasterBeat = masterGrid.beats[nearestMasterIdx]

  // Target position: shift slave so its nearest beat matches master's nearest beat
  // The offset is: master beat time - slave beat time, applied to slave position
  const offset = nearestMasterBeat - nearestSlaveBeat
  return Math.max(0, slavePosition + offset)
}

// ── Loop Functions ────────────────────────────────────────────────

/**
 * Quantize a time to the nearest beat in a grid.
 * Returns null if no valid beat grid.
 */
export function quantizeToBeat(time: number, grid: BeatGrid | null): number | null {
  if (!grid || grid.beats.length === 0) return null

  let bestIdx = 0
  let bestDist = Math.abs(grid.beats[0] - time)

  for (let i = 1; i < grid.beats.length; i++) {
    const dist = Math.abs(grid.beats[i] - time)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  return grid.beats[bestIdx]
}

/**
 * Create a beat-based loop from IN and OUT points.
 * Returns a LoopState, or null if the loop is invalid (OUT <= IN).
 */
export function createLoop(
  inSeconds: number,
  outSeconds: number,
  lengthBeats: number,
): LoopState | null {
  if (outSeconds <= inSeconds) return null

  return {
    active: true,
    startSeconds: inSeconds,
    endSeconds: outSeconds,
    lengthBeats,
    inPointSeconds: inSeconds,
  }
}

/**
 * Create a 4-beat (or N-beat) auto loop at a given position.
 * Uses the beatgrid to find exact boundaries.
 */
export function createAutoLoop(
  position: number,
  numBeats: number,
  grid: BeatGrid | null,
  duration: number,
): LoopState | null {
  if (numBeats <= 0) return null

  // Quantize position to nearest beat
  let loopStart: number
  if (grid && grid.beats.length > 0) {
    loopStart = quantizeToBeat(position, grid) ?? position
  } else {
    loopStart = position
  }

  // Calculate loop end from beat interval
  if (grid && grid.bpm > 0) {
    const beatInterval = 60 / grid.bpm
    const loopEnd = loopStart + numBeats * beatInterval

    if (loopEnd > duration + 0.01) return null // Would exceed track

    return createLoop(loopStart, loopEnd, numBeats)
  }

  // No beatgrid: approximate using 120 BPM
  const beatInterval = 60 / 120
  const loopEnd = loopStart + numBeats * beatInterval

  if (loopEnd > duration + 0.01) return null

  return createLoop(loopStart, loopEnd, numBeats)
}

/**
 * Halve loop length.
 * Returns new LoopState or null if invalid.
 */
export function halveLoop(
  loop: LoopState,
  grid: BeatGrid | null,
  duration: number,
): LoopState | null {
  if (!loop.active || loop.startSeconds === null || loop.endSeconds === null) return null
  if (loop.lengthBeats === null) return null

  const newLength = loop.lengthBeats / 2
  if (newLength < LOOP_MIN_BEATS) return null

  // Recalculate end from start + new length
  if (grid && grid.bpm > 0) {
    const beatInterval = 60 / grid.bpm
    const newEnd = loop.startSeconds + newLength * beatInterval
    return createLoop(loop.startSeconds, Math.min(newEnd, duration), newLength)
  }

  // Approximate with 120 BPM
  const beatInterval = 60 / 120
  const newEnd = loop.startSeconds + newLength * beatInterval
  return createLoop(loop.startSeconds, Math.min(newEnd, duration), newLength)
}

/**
 * Double loop length.
 * Returns new LoopState or null if invalid.
 */
export function doubleLoop(
  loop: LoopState,
  grid: BeatGrid | null,
  duration: number,
): LoopState | null {
  if (!loop.active || loop.startSeconds === null || loop.endSeconds === null) return null
  if (loop.lengthBeats === null) return null

  const newLength = loop.lengthBeats * 2
  if (newLength > LOOP_MAX_BEATS) return null

  if (grid && grid.bpm > 0) {
    const beatInterval = 60 / grid.bpm
    const newEnd = loop.startSeconds + newLength * beatInterval
    if (newEnd > duration + 0.01) return null
    return createLoop(loop.startSeconds, newEnd, newLength)
  }

  const beatInterval = 60 / 120
  const newEnd = loop.startSeconds + newLength * beatInterval
  if (newEnd > duration + 0.01) return null
  return createLoop(loop.startSeconds, newEnd, newLength)
}

/**
 * Check if a position is inside a loop.
 */
export function isInsideLoop(position: number, loop: LoopState): boolean {
  if (!loop.active || loop.startSeconds === null || loop.endSeconds === null) return false
  return position >= loop.startSeconds - 0.001 && position <= loop.endSeconds + 0.001
}

/**
 * Calculate wrapped position when playback crosses loop end.
 * Returns new position inside loop, preserving overflow.
 */
export function wrapLoopPosition(
  position: number,
  loop: LoopState,
): number | null {
  if (!loop.active || loop.startSeconds === null || loop.endSeconds === null) return null
  if (loop.endSeconds <= loop.startSeconds) return null

  const loopLength = loop.endSeconds - loop.startSeconds
  if (loopLength <= 0) return null

  // If position is past loop end, wrap back
  if (position >= loop.endSeconds) {
    const overflow = position - loop.endSeconds
    // Wrap within loop (modulo)
    const wrapped = loop.startSeconds + (overflow % loopLength)
    // Ensure wrapped position is within loop bounds
    return Math.max(loop.startSeconds, Math.min(loop.endSeconds, wrapped))
  }

  // If position is before loop start, jump to start
  if (position < loop.startSeconds) {
    return loop.startSeconds
  }

  // Position is inside loop
  return position
}

// ── Beat Jump Functions ───────────────────────────────────────────

/**
 * Calculate beat jump target position using beatgrid indices.
 *
 * @param currentPosition - current playback position
 * @param jumpBeats - number of beats to jump (negative = backward)
 * @param grid - beatgrid (null = no grid available)
 * @param duration - track duration (for boundary clamping)
 * @returns target position in seconds, or null if grid unavailable
 */
export function calculateBeatJumpPosition(
  currentPosition: number,
  jumpBeats: number,
  grid: BeatGrid | null,
  _duration: number,
): number | null {
  if (!grid || grid.beats.length === 0) return null
  if (jumpBeats === 0) return currentPosition

  // Find current beat index (nearest to current position)
  let currentIdx = 0
  let currentDist = Math.abs(grid.beats[0] - currentPosition)
  for (let i = 1; i < grid.beats.length; i++) {
    const dist = Math.abs(grid.beats[i] - currentPosition)
    if (dist < currentDist) {
      currentDist = dist
      currentIdx = i
    }
  }

  // Calculate target index
  const targetIdx = currentIdx + jumpBeats

  // Clamp to valid range
  if (targetIdx < 0) {
    return grid.beats[0] // Clamp to first beat
  }
  if (targetIdx >= grid.beats.length) {
    return grid.beats[grid.beats.length - 1] // Clamp to last beat
  }

  return grid.beats[targetIdx]
}

/**
 * Shift loop boundaries by a beat jump amount.
 * Used when beat jump is performed while a loop is active.
 */
export function shiftLoopByBeats(
  loop: LoopState,
  jumpBeats: number,
  grid: BeatGrid | null,
  duration: number,
): LoopState | null {
  if (!loop.active || loop.startSeconds === null || loop.endSeconds === null) return null
  if (!grid || grid.bpm <= 0) return null
  if (jumpBeats === 0) return loop

  const beatInterval = 60 / grid.bpm
  const shiftSeconds = jumpBeats * beatInterval

  let newStart = loop.startSeconds + shiftSeconds
  let newEnd = loop.endSeconds + shiftSeconds

  // Clamp to track boundaries
  if (newStart < 0) {
    const shift = -newStart
    newStart = 0
    newEnd += shift
  }
  if (newEnd > duration) {
    const shift = newEnd - duration
    newEnd = duration
    newStart -= shift
  }

  // Ensure still valid
  if (newStart < 0 || newEnd > duration || newEnd <= newStart) return null

  return {
    ...loop,
    startSeconds: newStart,
    endSeconds: newEnd,
    inPointSeconds: newStart,
  }
}

/**
 * Create default initial sync state.
 */
export function createSyncState(): SyncState {
  return {
    enabled: false,
    isMaster: false,
    masterDeck: null,
    targetBpm: null,
    phaseErrorSeconds: null,
  }
}

/**
 * Create default initial loop state.
 */
export function createLoopState(): LoopState {
  return {
    active: false,
    startSeconds: null,
    endSeconds: null,
    lengthBeats: null,
    inPointSeconds: null,
  }
}
