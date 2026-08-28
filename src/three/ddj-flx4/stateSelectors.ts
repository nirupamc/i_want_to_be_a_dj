/**
 * M12B state selectors.
 *
 * Pure read-only projections of DJState into the normalized 0..1 (or
 * -1..+1) values expected by the 3D visual layer. Selectors never
 * mutate state.
 *
 * Selectors are the inverse of the input mappers in ./valueMapping.ts
 * so that programmatic visual updates round-trip exactly.
 */

import type { DJState, PadMode, PadVisualState } from '../../types'

export type Side = 'A' | 'B'

export function deckIndex(side: Side): 0 | 1 {
  return side === 'A' ? 0 : 1
}

export function sideFromIndex(idx: 0 | 1): Side {
  return idx === 0 ? 'A' : 'B'
}

/** Tempo fader: returns the fader's normalized [0..1] value. */
export function selectTempoNormalized(state: DJState, side: Side): number {
  const s = state.decks[deckIndex(side)]
  return tempoPercentToNormalized(s.tempoPercent, s.tempoRange)
}

/** Channel trim: returns knob normalized [0..1]. */
export function selectTrimNormalized(state: DJState, side: Side): number {
  return trimDbToNormalized(state.mixer.channels[deckIndex(side)].trimDb)
}

/** EQ high: returns knob normalized [0..1]. 0.5 = exactly 0 dB. */
export function selectEqHighNormalized(state: DJState, side: Side): number {
  return eqDbToNormalized(state.mixer.channels[deckIndex(side)].eqHighDb)
}

export function selectEqMidNormalized(state: DJState, side: Side): number {
  return eqDbToNormalized(state.mixer.channels[deckIndex(side)].eqMidDb)
}

export function selectEqLowNormalized(state: DJState, side: Side): number {
  return eqDbToNormalized(state.mixer.channels[deckIndex(side)].eqLowDb)
}

/** Channel FX: returns knob normalized [0..1] mapping to filter -1..+1. */
export function selectCfxNormalized(state: DJState, side: Side): number {
  return filterParamToNormalized(state.mixer.channels[deckIndex(side)].filter)
}

/** Master level: knob normalized [0..1]. */
export function selectMasterLevelNormalized(state: DJState): number {
  return clamp01(state.master.level)
}

/** Headphones level: knob normalized [0..1]. We map the channelFader proxy
 *  field in DJState. The AudioEngine stores master volume under master.level
 *  and the HP mix as a -1..+1 crossfade between cue and master. For the
 *  3D view we expose a normalized representation of the channel mix. */
export function selectHeadphonesMixNormalized(_state: DJState): number {
  // DJState does not yet persist the HP mix value, so we report 0.5 (center).
  return 0.5
}

export function selectHeadphonesLevelNormalized(_state: DJState): number {
  return 0.5
}

export function selectMicLevelNormalized(_state: DJState): number {
  return 0.5
}

/** Channel fader: 1:1 in [0..1]. */
export function selectChannelFader(state: DJState, side: Side): number {
  return clamp01(state.mixer.channels[deckIndex(side)].channelFader)
}

/** Crossfader: engine 0..1 → 3D -1..+1. */
export function selectCrossfader3D(state: DJState): number {
  return crossfaderTo3D(state.mixer.crossfader)
}

/** Browse encoder: returns the current rotation in radians for the visual. */
export function selectBrowseEncoderAngle(state: DJState, prev: number): number {
  // We don't store a continuous angle in state. The visual just shows a
  // static pose, so the selector returns 0. Selection state lives in the
  // library service (M10) — outside the engine state.
  return prev
}

/** Beat FX level/depth: knob normalized [0..1]. */
export function selectBeatFxDepth(state: DJState): number {
  return clamp01(state.fx.beatFx.levelDepth)
}

/** Pad mode 0..3 (visual position 0..3 of the mode LEDs). */
export function selectPadModeIndex(state: DJState, side: Side): number {
  const mode = state.decks[deckIndex(side)].padMode
  return padModeToIndex(mode)
}

/** LED lit state for transport buttons. */
export function selectPlayLit(state: DJState, side: Side): boolean {
  return state.decks[deckIndex(side)].isPlaying
}

export function selectCueLit(state: DJState, side: Side): boolean {
  const s = state.decks[deckIndex(side)]
  return s.cuePoint !== null
}

export function selectShiftLit(state: DJState): boolean {
  return state.shiftPressed
}

export function selectSyncLit(state: DJState, side: Side): boolean {
  return state.decks[deckIndex(side)].sync.enabled
}

export function selectLoopInLit(state: DJState, side: Side): boolean {
  return state.decks[deckIndex(side)].loop.inPointSeconds !== null
}

export function selectLoopOutLit(state: DJState, side: Side): boolean {
  return state.decks[deckIndex(side)].loop.active
}

export function selectFourBeatLit(state: DJState, side: Side): boolean {
  return state.decks[deckIndex(side)].loop.active
}

export function selectPadModeLit(state: DJState, side: Side, mode: PadMode): boolean {
  return state.decks[deckIndex(side)].padMode === mode
}

export function selectPadLit(state: DJState, side: Side, padIndex: number): boolean {
  const s = state.decks[deckIndex(side)]
  switch (s.padMode) {
    case 'HOT_CUE': {
      return s.hotCues[padIndex]?.active === true
    }
    case 'BEAT_LOOP': {
      return s.loop.active
    }
    case 'BEAT_JUMP': {
      return false
    }
    case 'SAMPLER': {
      const slot = state.sampler.slots[padIndex]
      return slot?.loaded === true
    }
  }
}

export function selectPadVisualState(state: DJState, side: Side, padIndex: number): PadVisualState {
  const s = state.decks[deckIndex(side)]
  switch (s.padMode) {
    case 'HOT_CUE':
      return s.hotCues[padIndex]?.active ? 'ACTIVE' : 'OFF'
    case 'BEAT_LOOP':
      return s.loop.active ? 'ACTIVE' : 'AVAILABLE'
    case 'BEAT_JUMP':
      return 'AVAILABLE'
    case 'SAMPLER': {
      const slot = state.sampler.slots[padIndex]
      if (!slot?.loaded) return 'OFF'
      return slot.playing ? 'PLAYING' : 'AVAILABLE'
    }
  }
}

export function selectChannelCueLit(_state: DJState, _side: Side): boolean {
  // M2 has no per-channel cue state. The physical CUE button is momentary;
  // we always report unlit so the 3D LED only reflects the momentary press.
  return false
}

export function selectMasterCueLit(_state: DJState): boolean {
  return false
}

export function selectBeatFxOnLit(state: DJState): boolean {
  return state.fx.beatFx.enabled
}

export function selectSmartCfxLit(state: DJState, side: Side): boolean {
  return state.fx.smartCfx[deckIndex(side)].enabled
}

export function selectSmartFaderLit(state: DJState): boolean {
  return state.fx.smartFader.enabled
}

export function selectBeatFxSelectIndex(state: DJState): number {
  // Map engine FX type to a 0..7 selector position for the GLB 8-way switch.
  // (The actual GLB `BeatFxSelect` is the type encoder; the dedicated
  // `BeatFxChannelSelect` switch is 3-position and we expose 0..2.)
  switch (state.fx.beatFx.type) {
    case 'ECHO': return 0
    case 'DELAY': return 1
    case 'REVERB': return 2
    case 'FLANGER': return 3
    case 'FILTER': return 4
  }
  return 0
}

export function selectBeatFxChannelPosition(state: DJState): 0 | 1 | 2 {
  const target = state.fx.beatFx.target
  if (target === 'A') return 0
  if (target === 'B') return 1
  return 2
}

// Re-export the inverse mappers from valueMapping so a single import covers
// both directions. This avoids circular imports.
import {
  clamp01,
  crossfaderTo3D,
  eqDbToNormalized,
  filterParamToNormalized,
  tempoPercentToNormalized,
  trimDbToNormalized,
} from './valueMapping'

function padModeToIndex(mode: PadMode): number {
  switch (mode) {
    case 'HOT_CUE': return 0
    case 'BEAT_LOOP': return 1
    case 'BEAT_JUMP': return 2
    case 'SAMPLER': return 3
  }
}
