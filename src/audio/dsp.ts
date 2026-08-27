// Shared DSP helpers for the M2 mixer stage.
//
// Conventions (documented):
//  * EQ gain is expressed in dB, range -26..+6, 0 = neutral.
//  * Trim is expressed in dB, range -70..+9, 0 = unity. -70 dB is effectively
//    mute (no true -infinity gain in Web Audio).
//  * CFX/filter parameter is normalized -1..1: -1 = strong low-pass,
//    0 = neutral/open, +1 = strong high-pass.
//  * All frequency interpolation is logarithmic (perceptually even).

export const EQ_GAIN_DB_MIN = -26
export const EQ_GAIN_DB_MAX = 6
export const EQ_FREQ = { LOW: 100, MID: 1000, HIGH: 10000 } as const
export const EQ_Q = { LOW: 0.7, MID: 1.0, HIGH: 0.7 } as const

export const TRIM_DB_MIN = -70 // effectively mute
export const TRIM_DB_MAX = 9
export const TRIM_DB_DEFAULT = 0

export const FILTER_MIN = -1
export const FILTER_MAX = 1
export const FILTER_DEFAULT = 0

export function dbToGain(db: number): number {
  if (!isFinite(db)) return 0
  return Math.pow(10, db / 20)
}

export function gainToDb(gain: number): number {
  if (!(gain > 0)) return -Infinity
  return 20 * Math.log10(gain)
}

export function clampDb(db: number, min: number, max: number): number {
  if (!isFinite(db)) return min
  return Math.max(min, Math.min(max, db))
}

function lerpLog(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  if (a <= 0 || b <= 0) return a + (b - a) * clamped
  return a * Math.pow(b / a, clamped)
}

// Returns [lowPassCutoff, highPassCutoff] for a CFX position p in -1..1.
// p=-1 -> strong low pass; p=0 -> open; p=+1 -> strong high pass.
// Uses two series biquads (lowpass + highpass) so the center is continuous
// and there is no type-switch discontinuity.
export function filterCutoffs(p: number): [number, number] {
  const clamped = Math.max(FILTER_MIN, Math.min(FILTER_MAX, p))
  const LPF_MIN = 250
  const LPF_MAX = 16000
  const HPF_MIN = 80
  const HPF_MAX = 7000
  if (clamped <= 0) {
    // p: -1 → 0, 0 → 1 (fully open at center)
    const t = clamped + 1
    return [lerpLog(LPF_MIN, LPF_MAX, t), HPF_MIN]
  }
  return [LPF_MAX, lerpLog(HPF_MIN, HPF_MAX, clamped)]
}

export const FILTER_Q = 0.7