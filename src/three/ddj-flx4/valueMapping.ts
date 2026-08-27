/**
 * M12B value mappings.
 *
 * Conversions between 3D normalized values ([0..1] or [-1..+1] depending on
 * the control) and the engine's domain units (dB, percent, etc.).
 *
 * These are pure functions. They never call into the engine or any state
 * object; the binding layer applies them.
 *
 * Every mapper MUST be the exact inverse of its selector (see
 * ./stateSelectors.ts) so that programmatic visual updates do not produce
 * a feedback drift. Tests in engineBindings.test.ts verify the round-trip.
 */

import { EQ_GAIN_DB_MAX, EQ_GAIN_DB_MIN, FILTER_MAX, FILTER_MIN, TRIM_DB_MAX, TRIM_DB_MIN } from '../../audio/dsp'

/** Knob normalized [0..1] → bounded knob dB. Keeps 0.5 exactly at 0 dB. */
export function eqNormalizedToDb(normalized: number, min = EQ_GAIN_DB_MIN, max = EQ_GAIN_DB_MAX): number {
  const t = clamp01(normalized)
  if (t === 0.5) return 0
  if (t < 0.5) {
    return (t / 0.5) * min
  }
  return ((t - 0.5) / 0.5) * max
}

/** Inverse: bounded knob dB → knob normalized [0..1]. */
export function eqDbToNormalized(db: number, min = EQ_GAIN_DB_MIN, max = EQ_GAIN_DB_MAX): number {
  if (db === 0) return 0.5
  if (db < 0) {
    return clamp01(0.5 * (db / min))
  }
  return clamp01(0.5 + 0.5 * (db / max))
}

/** Knob normalized [0..1] → trim dB. Trim does not require a center detent. */
export function trimNormalizedToDb(normalized: number, min = TRIM_DB_MIN, max = TRIM_DB_MAX): number {
  const t = clamp01(normalized)
  return min + t * (max - min)
}

export function trimDbToNormalized(db: number, min = TRIM_DB_MIN, max = TRIM_DB_MAX): number {
  return clamp01((db - min) / (max - min))
}

/** Knob normalized [0..1] → filter position [-1..+1] (used by CFX). 0.5 → 0. */
export function filterNormalizedToParam(normalized: number, min = FILTER_MIN, max = FILTER_MAX): number {
  const t = clamp01(normalized)
  if (t === 0.5) return 0
  if (t < 0.5) {
    return (t / 0.5) * min
  }
  return ((t - 0.5) / 0.5) * max
}

export function filterParamToNormalized(p: number, min = FILTER_MIN, max = FILTER_MAX): number {
  if (p === 0) return 0.5
  if (p < 0) {
    return clamp01(0.5 * (p / min))
  }
  return clamp01(0.5 + 0.5 * (p / max))
}

/** Crossfader: 3D uses -1..+1, engine uses 0..1. Equal-power remains in audio. */
export function crossfaderFrom3D(normalized3D: number): number {
  return clamp01((normalized3D + 1) / 2)
}

export function crossfaderTo3D(engineX: number): number {
  return clampSigned(engineX * 2 - 1)
}

/** Tempo fader normalized [0..1] → tempo percent within the current range. */
export function tempoNormalizedToPercent(normalized: number, rangePercent: number): number {
  const t = clamp01(normalized)
  return (t * 2 - 1) * rangePercent
}

export function tempoPercentToNormalized(percent: number, rangePercent: number): number {
  if (rangePercent <= 0) return 0.5
  return clamp01(0.5 + 0.5 * (percent / rangePercent))
}

/** Channel fader is 1:1 in [0..1]. */
export const channelFaderTo3D = (fader: number): number => clamp01(fader)
export const channelFaderFrom3D = (t: number): number => clamp01(t)

/** Master level is 1:1 in [0..1]. */
export const masterLevelTo3D = (l: number): number => clamp01(l)
export const masterLevelFrom3D = (t: number): number => clamp01(t)

/** Crossfader uses equal-power gain internally; that math is unchanged. */

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function clampSigned(v: number): number {
  if (Number.isNaN(v)) return 0
  if (v < -1) return -1
  if (v > 1) return 1
  return v
}
