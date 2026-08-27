/**
 * Waveform extraction from decoded PCM.
 *
 * Generates a reduced waveform representation from AudioBuffer data.
 * For each time bucket: calculates peak amplitude and optional RMS.
 * Normalizes to [0, 1] range.
 *
 * Documentation:
 * - pointsPerSecond: default 100 (configurable)
 * - bucket calculation: samples per bucket = sampleRate / pointsPerSecond
 * - normalization: peak normalized to max absolute sample value across all buckets
 * - stereo handling: max(leftPeak, rightPeak) per bucket
 */

import type { WaveformData } from './analysisTypes'

/** Default waveform resolution: points per second */
export const DEFAULT_POINTS_PER_SECOND = 100

/**
 * Extract waveform peaks (and optionally RMS) from an AudioBuffer.
 *
 * @param buffer - decoded AudioBuffer
 * @param pointsPerSecond - waveform resolution (default 100)
 * @returns normalized WaveformData
 */
export function extractWaveform(
  buffer: AudioBuffer,
  pointsPerSecond: number = DEFAULT_POINTS_PER_SECOND,
): WaveformData {
  const sampleRate = buffer.sampleRate
  const totalSamples = buffer.length
  const duration = buffer.duration

  // Number of output points
  const numPoints = Math.max(1, Math.ceil(duration * pointsPerSecond))
  const samplesPerBucket = Math.floor(sampleRate / pointsPerSecond)

  // Read channel data (use up to 2 channels for stereo)
  const numChannels = Math.min(buffer.numberOfChannels, 2)
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch))
  }

  const peaks: number[] = new Array(numPoints)
  const rmsValues: number[] = new Array(numPoints)

  // Find global max for normalization
  let globalMax = 0

  for (let i = 0; i < numPoints; i++) {
    const startSample = Math.floor(i * samplesPerBucket)
    const endSample = Math.min(startSample + samplesPerBucket, totalSamples)

    let peak = 0
    let sumSquares = 0
    let sampleCount = 0

    for (let s = startSample; s < endSample; s++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const absVal = Math.abs(channels[ch][s])
        if (absVal > peak) peak = absVal
        sumSquares += channels[ch][s] * channels[ch][s]
        sampleCount++
      }
    }

    peaks[i] = peak
    rmsValues[i] = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0

    if (peak > globalMax) globalMax = peak
  }

  // Normalize to 0..1 using global max
  const scale = globalMax > 0 ? 1 / globalMax : 0
  for (let i = 0; i < numPoints; i++) {
    peaks[i] = peaks[i] * scale
    rmsValues[i] = rmsValues[i] * scale
  }

  return {
    sampleRate,
    pointsPerSecond,
    peaks,
    rms: rmsValues,
  }
}
