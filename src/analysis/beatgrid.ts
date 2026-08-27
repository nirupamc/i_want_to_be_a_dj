/**
 * Beat grid generation and lookup helpers.
 *
 * Given a BPM and first-beat anchor, generates regular beat timestamps
 * and provides reusable lookup functions for future milestones (Beat Sync,
 * Beat Jump, quantized loops, cue snapping).
 *
 * Documentation:
 * - firstBeatSeconds is a beat-grid anchor, NOT a guaranteed musical downbeat
 * - every-4th grid marker is NOT automatically a musical bar
 * - all functions are deterministic and framework-independent
 */

import type { BeatGrid } from './analysisTypes'


/**
 * Generate a regular beat grid from BPM and anchor.
 *
 * @param bpm - beats per minute (must be > 0)
 * @param firstBeatSeconds - time of first beat anchor (seconds)
 * @param duration - track duration in seconds
 * @returns BeatGrid with ascending beat timestamps clamped to [0, duration]
 */
export function generateBeatGrid(
  bpm: number,
  firstBeatSeconds: number,
  duration: number,
): BeatGrid | null {
  if (bpm <= 0 || !isFinite(bpm)) return null
  if (duration <= 0) return null

  const interval = 60 / bpm
  const beats: number[] = []

  // Generate beats before anchor (if useful for alignment)
  let t = firstBeatSeconds
  while (t >= 0) {
    beats.push(Math.max(0, Math.min(duration, t)))
    t -= interval
  }
  beats.reverse()

  // Generate beats after anchor
  t = firstBeatSeconds + interval
  while (t <= duration + interval * 0.01) {
    beats.push(Math.max(0, Math.min(duration, t)))
    t += interval
  }

  // Remove duplicates and sort
  const unique = [...new Set(beats.map((b) => Math.round(b * 1000) / 1000))]
  unique.sort((a, b) => a - b)

  // Clamp all to [0, duration]
  const clamped = unique
    .filter((b) => b >= 0 && b <= duration)
    .map((b) => Math.max(0, Math.min(duration, b)))

  return {
    bpm,
    firstBeatSeconds,
    beats: clamped,
  }
}

/**
 * Find the nearest beat to a given time.
 * Returns { index, time, distance }
 */
export function findNearestBeat(
  time: number,
  grid: BeatGrid,
): { index: number; time: number; distance: number } | null {
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

  return {
    index: bestIdx,
    time: grid.beats[bestIdx],
    distance: bestDist,
  }
}

/**
 * Find the previous beat (at or before the given time).
 * Returns { index, time } or null if no previous beat exists.
 */
export function findPreviousBeat(
  time: number,
  grid: BeatGrid,
): { index: number; time: number } | null {
  for (let i = grid.beats.length - 1; i >= 0; i--) {
    if (grid.beats[i] <= time + 0.001) {
      return { index: i, time: grid.beats[i] }
    }
  }
  return null
}

/**
 * Find the next beat (at or after the given time).
 * Returns { index, time } or null if no next beat exists.
 */
export function findNextBeat(
  time: number,
  grid: BeatGrid,
): { index: number; time: number } | null {
  for (let i = 0; i < grid.beats.length; i++) {
    if (grid.beats[i] >= time - 0.001) {
      return { index: i, time: grid.beats[i] }
    }
  }
  return null
}

/**
 * Convert time to beat index (floor).
 * Returns the index of the last beat at or before the given time.
 * Returns -1 if time is before the first beat.
 */
export function timeToBeatIndex(time: number, grid: BeatGrid): number {
  for (let i = grid.beats.length - 1; i >= 0; i--) {
    if (grid.beats[i] <= time + 0.001) return i
  }
  return -1
}

/**
 * Convert beat index to time.
 * Returns the beat time at the given index, or null if out of range.
 */
export function beatIndexToTime(index: number, grid: BeatGrid): number | null {
  if (index < 0 || index >= grid.beats.length) return null
  return grid.beats[index]
}

/**
 * Find the best beat anchor from onset peaks and BPM.
 *
 * Tests phase offsets against onset strengths and picks the best alignment.
 * This does NOT detect musical downbeats — it finds a grid anchor.
 *
 * @param bpm - estimated BPM
 * @param onsetTimes - onset peak times in seconds
 * @param duration - track duration
 * @returns best firstBeatSeconds
 */
export function estimateFirstBeat(
  bpm: number,
  onsetTimes: number[],
  duration: number,
): number {
  if (bpm <= 0 || onsetTimes.length === 0) return 0

  const interval = 60 / bpm
  let bestPhase = 0
  let bestScore = -1

  // Test phase offsets: sample at onset times and midway between them
  const candidatePhases: number[] = []
  for (const t of onsetTimes) {
    candidatePhases.push(t % interval)
    candidatePhases.push((t + interval * 0.5) % interval)
  }

  // Also test evenly spaced phases
  const numPhases = Math.max(20, Math.round(interval * 10))
  for (let i = 0; i < numPhases; i++) {
    candidatePhases.push((i / numPhases) * interval)
  }

  for (const phase of candidatePhases) {
    // Score: sum of onset strengths near grid positions
    let score = 0
    for (const onset of onsetTimes) {
      const gridPos = phase + Math.round((onset - phase) / interval) * interval
      const dist = Math.abs(onset - gridPos)
      // Gaussian-like scoring: closer = higher score
      const sigma = interval * 0.1 // 10% of beat interval tolerance
      score += Math.exp(-(dist * dist) / (2 * sigma * sigma))
    }
    if (score > bestScore) {
      bestScore = score
      bestPhase = phase
    }
  }

  return Math.max(0, Math.min(duration, bestPhase))
}

/**
 * Rebuild beat grid with manual BPM, preserving existing anchor if sensible.
 *
 * @param manualBpm - user-provided BPM
 * @param existingGrid - existing beat grid (may be null)
 * @param duration - track duration
 * @returns new BeatGrid or null
 */
export function rebuildBeatGridWithBPM(
  manualBpm: number,
  existingGrid: BeatGrid | null,
  duration: number,
): BeatGrid | null {
  if (manualBpm <= 0 || !isFinite(manualBpm)) return null

  // Use existing anchor if available and BPM is in valid range
  const anchor = existingGrid?.firstBeatSeconds ?? 0

  return generateBeatGrid(manualBpm, anchor, duration)
}
