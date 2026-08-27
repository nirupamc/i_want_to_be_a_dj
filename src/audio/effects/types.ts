/**
 * M9 Effects types.
 * All types are serializable — no AudioNodes or DOM objects.
 */

// ── Beat FX ──────────────────────────────────────────────────────

export type BeatFxType = 'ECHO' | 'DELAY' | 'REVERB' | 'FLANGER' | 'FILTER'

export type BeatFxTarget = 'A' | 'B' | 'MASTER'

/** Beat multiplier values for beat-synced timing */
export const BEAT_MULTIPLIERS = [1/16, 1/8, 1/4, 1/2, 1, 2, 4, 8] as const
export type BeatMultiplier = typeof BEAT_MULTIPLIERS[number]

/** Beat FX display labels */
export const BEAT_FX_LABELS: Record<BeatFxType, string> = {
  ECHO: 'Echo',
  DELAY: 'Delay',
  REVERB: 'Reverb',
  FLANGER: 'Flanger',
  FILTER: 'Filter',
}

export const BEAT_MULTIPLIER_LABELS: string[] = [
  '1/16', '1/8', '1/4', '1/2', '1', '2', '4', '8',
]

export interface BeatFxState {
  enabled: boolean
  type: BeatFxType
  target: BeatFxTarget
  beatMultiplierIndex: number // index into BEAT_MULTIPLIERS
  levelDepth: number // 0..1, wet/dry mix
}

// ── Release FX ───────────────────────────────────────────────────

export type ReleaseFxType = 'NONE' | 'ECHO_OUT'

export interface ReleaseFxState {
  type: ReleaseFxType
  active: boolean
}

// ── Smart CFX ────────────────────────────────────────────────────

export interface SmartCfxState {
  enabled: boolean
  value: number // -1..+1, macro position
}

// ── Smart Fader ──────────────────────────────────────────────────

export interface SmartFaderState {
  enabled: boolean
  transitionDirection: 'A_TO_B' | 'B_TO_A' | null
}
