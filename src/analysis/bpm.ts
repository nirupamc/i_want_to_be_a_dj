/**
 * BPM estimation from decoded PCM.
 *
 * Algorithm:
 * 1. Downmix to mono
 * 2. Downsample to analysis rate (11,025 Hz)
 * 3. Compute windowed energy envelope
 * 4. Detect onset peaks via positive energy difference + adaptive threshold
 * 5. Calculate inter-onset intervals → tempo candidates
 * 6. Fold candidates into DJ range (70–180 BPM)
 * 7. Histogram-based voting → best BPM + confidence
 *
 * All functions are framework-independent (no DOM, no React, no Web Audio).
 */

/** Supported DJ BPM range */
export const BPM_MIN = 70
export const BPM_MAX = 180

/** Analysis downsample rate (Hz) */
export const ANALYSIS_RATE = 11025

/** Window size for energy calculation (samples at ANALYSIS_RATE) */
const WINDOW_SIZE = 1024

/** Hop size between windows (samples at ANALYSIS_RATE) */
const HOP_SIZE = 512

/** Minimum onset spacing (windows) to avoid double-counting */
const MIN_ONSET_SPACING = 3

/**
 * Downmix AudioBuffer to mono Float32Array at reduced sample rate.
 * Uses simple averaging of available channels.
 */
export function downmixToMono(buffer: AudioBuffer): Float32Array {
  const numChannels = buffer.numberOfChannels
  const srcRate = buffer.sampleRate
  const srcLength = buffer.length

  // Calculate output length at target rate
  const ratio = srcRate / ANALYSIS_RATE
  const outLength = Math.floor(srcLength / ratio)
  const out = new Float32Array(outLength)

  // Read all channels
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch))
  }

  // Simple averaging downsample
  for (let i = 0; i < outLength; i++) {
    const srcIdx = Math.floor(i * ratio)
    let sum = 0
    for (let ch = 0; ch < numChannels; ch++) {
      sum += channels[ch][srcIdx] ?? 0
    }
    out[i] = sum / numChannels
  }

  return out
}

/**
 * Compute windowed energy envelope from mono signal.
 * Returns array of energy values, one per window.
 */
export function computeEnergyEnvelope(signal: Float32Array): number[] {
  const envelope: number[] = []
  const numWindows = Math.floor((signal.length - WINDOW_SIZE) / HOP_SIZE) + 1

  for (let w = 0; w < numWindows; w++) {
    const start = w * HOP_SIZE
    let sumSquares = 0
    for (let i = 0; i < WINDOW_SIZE && start + i < signal.length; i++) {
      const s = signal[start + i]
      sumSquares += s * s
    }
    envelope.push(Math.sqrt(sumSquares / WINDOW_SIZE))
  }

  return envelope
}

/**
 * Detect onset peaks from energy envelope.
 * Uses positive energy difference with adaptive threshold.
 * Returns array of onset indices (window positions).
 */
export function detectOnsets(envelope: number[]): number[] {
  if (envelope.length < 3) return []

  // Compute positive energy difference
  const diff: number[] = []
  for (let i = 1; i < envelope.length; i++) {
    const d = envelope[i] - envelope[i - 1]
    diff.push(d > 0 ? d : 0)
  }

  // Adaptive threshold: mean + 0.5 * std of positive differences
  let sum = 0
  let sumSq = 0
  for (const d of diff) {
    sum += d
    sumSq += d * d
  }
  const mean = sum / diff.length
  const variance = sumSq / diff.length - mean * mean
  const std = Math.sqrt(Math.max(0, variance))
  const threshold = mean + 0.5 * std

  // Find local maxima above threshold with minimum spacing
  const onsets: number[] = []
  let lastOnset = -MIN_ONSET_SPACING

  for (let i = 1; i < diff.length - 1; i++) {
    if (diff[i] >= threshold && diff[i] >= diff[i - 1] && diff[i] >= diff[i + 1]) {
      if (i - lastOnset >= MIN_ONSET_SPACING) {
        onsets.push(i)
        lastOnset = i
      }
    }
  }

  return onsets
}

/**
 * Convert onset indices to inter-onset intervals (IOIs) in seconds.
 * Window time = index * HOP_SIZE / ANALYSIS_RATE
 */
export function computeIOIs(onsets: number[]): number[] {
  const iois: number[] = []
  const windowDuration = HOP_SIZE / ANALYSIS_RATE

  for (let i = 1; i < onsets.length; i++) {
    const interval = (onsets[i] - onsets[i - 1]) * windowDuration
    iois.push(interval)
  }

  return iois
}

/**
 * Convert interval (seconds) to BPM.
 */
export function intervalToBPM(interval: number): number {
  if (interval <= 0) return 0
  return 60 / interval
}

/**
 * Fold BPM into DJ range using octave equivalence.
 * Maps to [BPM_MIN/2, BPM_MAX*2] then folds.
 */
export function foldBPM(bpm: number): number {
  if (bpm <= 0) return 0
  let folded = bpm
  // Fold up if too low
  while (folded < BPM_MIN / 2) folded *= 2
  // Fold down if too high
  while (folded > BPM_MAX * 2) folded /= 2
  return folded
}

/**
 * Build histogram of folded BPM candidates and find the best.
 * Returns [bestBPM, confidence] where confidence ∈ [0, 1].
 */
export function findBestBPM(iois: number[]): { bpm: number; confidence: number } {
  if (iois.length < 2) return { bpm: 0, confidence: 0 }

  // Convert IOIs to folded BPM candidates
  const candidates: number[] = []
  for (const ioi of iois) {
    const bpm = intervalToBPM(ioi)
    const folded = foldBPM(bpm)
    if (folded >= BPM_MIN && folded <= BPM_MAX) {
      candidates.push(folded)
    }
  }

  if (candidates.length < 2) return { bpm: 0, confidence: 0 }

  // Histogram with 1 BPM bins
  const histogram: Map<number, number> = new Map()
  for (const c of candidates) {
    const bin = Math.round(c)
    histogram.set(bin, (histogram.get(bin) ?? 0) + 1)
  }

  // Find bin with most votes
  let bestBin = 0
  let bestCount = 0
  for (const [bin, count] of histogram) {
    if (count > bestCount) {
      bestBin = bin
      bestCount = count
    }
  }

  if (bestCount < 2) return { bpm: 0, confidence: 0 }

  // Confidence: ratio of best bin votes to total candidates
  const confidence = Math.min(1, bestCount / candidates.length)

  return { bpm: bestBin, confidence }
}

/**
 * Estimate BPM from an AudioBuffer.
 *
 * @param buffer - decoded audio buffer
 * @returns { bpm, confidence } or { bpm: 0, confidence: 0 } if unreliable
 */
export function estimateBPM(buffer: AudioBuffer): { bpm: number; confidence: number } {
  const signal = downmixToMono(buffer)
  const envelope = computeEnergyEnvelope(signal)
  const onsets = detectOnsets(envelope)
  const iois = computeIOIs(onsets)
  return findBestBPM(iois)
}
