/**
 * Track analysis service.
 *
 * Orchestrates waveform extraction, BPM estimation, and beatgrid generation.
 * Handles stale-result protection via generation tokens — if a new track is
 * loaded before analysis finishes, the old result is discarded.
 *
 * All analysis is synchronous for M6 simplicity. Can be moved to a Web Worker
 * later without rewriting the app, since this module has no React/DOM deps.
 */

import type { TrackAnalysis, BeatGrid } from './analysisTypes'
import { ANALYSIS_VERSION } from './analysisTypes'
import { extractWaveform } from './waveform'
import { estimateBPM, BPM_MIN, BPM_MAX } from './bpm'
import { generateBeatGrid } from './beatgrid'

/** Optional hint for BPM from metadata */
export interface AnalysisOptions {
  bpmHint?: number | null
}

/**
 * Analyze an AudioBuffer: extract waveform, estimate BPM, generate beatgrid.
 *
 * @param buffer - decoded AudioBuffer
 * @param options - optional analysis hints
 * @returns complete TrackAnalysis
 */
export function analyzeTrack(
  buffer: AudioBuffer,
  options?: AnalysisOptions,
): TrackAnalysis {
  const duration = buffer.duration

  // 1. Extract waveform
  const waveform = extractWaveform(buffer)

  // 2. Estimate BPM
  const { bpm: rawBpm, confidence } = estimateBPM(buffer)

  // Apply BPM range bounds
  let bpm: number | null = rawBpm > 0 ? rawBpm : null
  if (bpm !== null && (bpm < BPM_MIN || bpm > BPM_MAX)) {
    bpm = null
  }

  // If analysis failed but we have a hint, use it
  if (bpm === null && options?.bpmHint && options.bpmHint > 0) {
    bpm = options.bpmHint
  }

  // 3. Generate beat grid
  let beatGrid: BeatGrid | null = null
  if (bpm !== null) {
    // Estimate first beat anchor from waveform peaks
    // Use simple approach: find time of highest energy peak as anchor
    const peakIndex = findHighestEnergyPeak(waveform.peaks, waveform.pointsPerSecond)
    const firstBeat = peakIndex / waveform.pointsPerSecond

    beatGrid = generateBeatGrid(bpm, firstBeat, duration)
  }

  return {
    durationSeconds: duration,
    waveform,
    bpm,
    bpmConfidence: bpm !== null ? confidence : null,
    beatGrid,
    analysisVersion: ANALYSIS_VERSION,
  }
}

/**
 * Find the time index of the highest energy region.
 * Used as a simple beat-anchor heuristic.
 */
function findHighestEnergyPeak(peaks: number[], pointsPerSecond: number): number {
  if (peaks.length === 0) return 0

  // Look at the first 80% of the track (skip possible silence at end)
  const searchEnd = Math.floor(peaks.length * 0.8)
  let bestIdx = 0
  let bestVal = 0

  // Use a small window to find sustained energy regions
  const windowSize = Math.max(1, Math.floor(pointsPerSecond * 0.5)) // 0.5s window

  for (let i = 0; i < searchEnd; i++) {
    let sum = 0
    for (let j = 0; j < windowSize && i + j < peaks.length; j++) {
      sum += peaks[i + j]
    }
    if (sum > bestVal) {
      bestVal = sum
      bestIdx = i
    }
  }

  return bestIdx
}

/**
 * Create a new generation token for stale-result protection.
 * Each call increments a counter.
 */
let generationCounter = 0
export function nextGeneration(): number {
  return ++generationCounter
}

/**
 * Reset generation counter (for testing).
 */
export function resetGenerationCounter(): void {
  generationCounter = 0
}
