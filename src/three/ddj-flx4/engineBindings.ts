/**
 * M12B engine bindings.
 *
 * Data-driven layer that translates 3D control IDs + interaction events
 * into existing DJEngine actions.
 *
 * No audio logic, no transport logic, no FX logic — all of that lives
 * inside DJEngine and is reused verbatim. This module only *dispatches*
 * actions.
 *
 * The binding table is an array of entries, each describing one control.
 * An entry is parameterized by:
 *   - id              : semantic control ID
 *   - onDown / onUp   : pointer-driven actions (press / release)
 *   - onValue         : continuous value actions (rotary, fader)
 *   - onJogStart/Move/End: jog rotation actions
 *
 * Unknown controls (PAD_FX1) get a no-op entry marked `unbound: true`
 * so they remain visually interactive but do not invoke engine behavior.
 */

import type { Action } from '../../types'
import { CONTROL_IDS, padId } from './controlIds'
import type { RuntimeControl } from './controlRegistry'
import {
  channelFaderFrom3D,
  crossfaderFrom3D,
  eqNormalizedToDb,
  filterNormalizedToParam,
  masterLevelFrom3D,
  tempoNormalizedToPercent,
  trimNormalizedToDb,
} from './valueMapping'

/** Marker actions produced by bindings; the dispatcher rewrites them
 *  to real DJEngine actions using current state, or routes them to the
 *  library bridge when the engine does not own that domain. */
export type BindingMarker =
  | { type: 'SET_TEMPO_NORMALIZED'; deck: 0 | 1; normalized: number }
  | { type: 'CYCLE_BEAT_FX_TARGET' }
  | { type: 'TOGGLE_PLAY_FOR_DECK'; deck: 0 | 1 }
  | { type: 'LIBRARY_SELECT'; delta: number }
  | { type: 'LIBRARY_LOAD'; deck: 0 | 1 }

export type DispatchableAction = Action | BindingMarker

type Side = 'A' | 'B'

export interface DownResult { actions: DispatchableAction[] }
export interface ValueResult { actions: DispatchableAction[]; consumed: boolean }
export interface JogMove { actions: DispatchableAction[]; consumed: boolean }

export interface ControlBinding {
  id: string
  kind: RuntimeControl['kind']
  unbound?: boolean
  /** Map a pointer down event into engine actions. */
  onDown(control: RuntimeControl, side?: Side): DownResult
  /** Map a pointer up event. */
  onUp(control: RuntimeControl, side?: Side): DownResult
  /** Map a continuous value event (normalized 0..1 or -1..+1). */
  onValue(control: RuntimeControl, value: number, side?: Side): ValueResult
  /** Map a jog start. */
  onJogStart(control: RuntimeControl, side?: Side): DownResult
  /** Map a jog movement (deltaRadians, velocity, direction). */
  onJogMove(control: RuntimeControl, info: { deltaRadians: number; velocity: number; direction: 1 | -1 }, side?: Side): JogMove
  /** Map a jog end. */
  onJogEnd(control: RuntimeControl, side?: Side): DownResult
}

function noop(): DownResult { return { actions: [] } }
function noopValue(): ValueResult { return { actions: [], consumed: false } }
function noopJog(): JogMove { return { actions: [], consumed: false } }

function deckSideFor(control: RuntimeControl): Side | undefined {
  if (control.id.startsWith('deck.left.')) return 'A'
  if (control.id.startsWith('deck.right.')) return 'B'
  return undefined
}

// ── Helpers ─────────────────────────────────────────────────────

// ── Transport buttons ──────────────────────────────────────────

function playBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.play : CONTROL_IDS.decks.right.play,
    kind: 'button',
    // PLAY vs PAUSE depends on engine state. The binding emits a marker;
    // the dispatcher rewrites it to PLAY (or PAUSE) using current state.
    onDown: () => ({ actions: [{ type: 'TOGGLE_PLAY_FOR_DECK', deck: d }] }),
    onUp: noop,
    onValue: noopValue,
    onJogStart: noop,
    onJogMove: noopJog,
    onJogEnd: noop
  }
}

function cueBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.cue : CONTROL_IDS.decks.right.cue,
    kind: 'button',
    onDown: () => ({ actions: [{ type: 'CUE_DOWN', deck: d }] }),
    onUp: () => ({ actions: [{ type: 'CUE_UP', deck: d }] }),
    onValue: noopValue,
    onJogStart: noop,
    onJogMove: noopJog,
    onJogEnd: noop
  }
}

function shiftBinding(side: Side): ControlBinding {
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.shift : CONTROL_IDS.decks.right.shift,
    kind: 'button',
    onDown: () => ({ actions: [{ type: 'SHIFT_DOWN' }] }),
    onUp: () => ({ actions: [{ type: 'SHIFT_UP' }] }),
    onValue: noopValue,
    onJogStart: noop,
    onJogMove: noopJog,
    onJogEnd: noop
  }
}

function syncBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.sync : CONTROL_IDS.decks.right.sync,
    kind: 'button',
    onDown: () => ({ actions: [{ type: 'TOGGLE_BEAT_SYNC', deck: d }] }),
    onUp: noop,
    onValue: noopValue,
    onJogStart: noop,
    onJogMove: noopJog,
    onJogEnd: noop
  }
}

function loopInBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.loopIn : CONTROL_IDS.decks.right.loopIn,
    kind: 'button',
    onDown: () => ({ actions: [{ type: 'LOOP_IN', deck: d }] }),
    onUp: noop,
    onValue: noopValue,
    onJogStart: noop,
    onJogMove: noopJog,
    onJogEnd: noop
  }
}

function loopOutBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.loopOut : CONTROL_IDS.decks.right.loopOut,
    kind: 'button',
    onDown: () => ({ actions: [{ type: 'LOOP_OUT', deck: d }] }),
    onUp: noop,
    onValue: noopValue,
    onJogStart: noop,
    onJogMove: noopJog,
    onJogEnd: noop
  }
}

function fourBeatBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.fourBeatExit : CONTROL_IDS.decks.right.fourBeatExit,
    kind: 'button',
    onDown: () => ({ actions: [{ type: 'LOOP_4_BEAT', deck: d }] }),
    onUp: noop,
    onValue: noopValue,
    onJogStart: noop,
    onJogMove: noopJog,
    onJogEnd: noop
  }
}

// Loop call left/right are present in the GLB but have no engine action in
// the current M7 vocabulary. The 3D control remains interactive but is
// marked UNBOUND.
function loopCallBinding(side: Side, direction: 'left' | 'right'): ControlBinding {
  const id = side === 'A'
    ? (direction === 'left' ? CONTROL_IDS.decks.left.callLeft : CONTROL_IDS.decks.left.callRight)
    : (direction === 'left' ? CONTROL_IDS.decks.right.callLeft : CONTROL_IDS.decks.right.callRight)
  return {
    id, kind: 'button', unbound: true,
    onDown: noop, onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

// ── Pad mode buttons ───────────────────────────────────────────

function padModeBinding(side: Side, mode: 'HOT_CUE' | 'BEAT_JUMP' | 'SAMPLER'): ControlBinding {
  const map: Record<typeof mode, string> = {
    HOT_CUE: side === 'A' ? CONTROL_IDS.decks.left.hotCueMode : CONTROL_IDS.decks.right.hotCueMode,
    BEAT_JUMP: side === 'A' ? CONTROL_IDS.decks.left.beatJumpMode : CONTROL_IDS.decks.right.beatJumpMode,
    SAMPLER: side === 'A' ? CONTROL_IDS.decks.left.samplerMode : CONTROL_IDS.decks.right.samplerMode
  }
  // The physical DDJ-FLX4 only exposes HotCue, PadFX1, BeatJump and
  // Sampler mode buttons. BEAT_LOOP mode is supported by the engine but
  // not selectable from the 3D model.
  return {
    id: map[mode], kind: 'button',
    onDown: () => ({ actions: [{ type: 'SET_PAD_MODE', deck: side === 'A' ? 0 : 1, mode }] }),
    onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

// Pad FX1 is intentionally UNBOUND per M8 (Pad FX is not implemented).
function padFx1Binding(side: Side): ControlBinding {
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.padFx1Mode : CONTROL_IDS.decks.right.padFx1Mode,
    kind: 'button', unbound: true,
    onDown: noop, onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

// ── Pads (8 per deck) ─────────────────────────────────────────

function padBinding(side: Side, index1to8: number): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  const id = padId(side === 'A' ? 'left' : 'right', index1to8)
  return {
    id, kind: 'pad',
    onDown: () => ({ actions: [{ type: 'PAD_DOWN', deck: d, padIndex: index1to8 - 1 }] }),
    onUp: () => ({ actions: [{ type: 'PAD_UP', deck: d, padIndex: index1to8 - 1 }] }),
    onValue: noopValue,
    onJogStart: noop,
    onJogMove: noopJog,
    onJogEnd: noop
  }
}

// ── Tempo faders ──────────────────────────────────────────────

function tempoBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.tempo : CONTROL_IDS.decks.right.tempo,
    kind: 'linear',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      // Range-dependent mapping is done by the dispatcher (which has
      // access to the current state). We ship the normalized value as a
      // marker and the dispatcher rewrites it to SET_TEMPO.
      return { actions: [{ type: 'SET_TEMPO_NORMALIZED', deck: d, normalized: Math.max(0, Math.min(1, value)) } as unknown as Action], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

// ── Mixer rotaries ─────────────────────────────────────────────

function trimBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.mixer.channel1.trim : CONTROL_IDS.mixer.channel2.trim,
    kind: 'rotary-bounded',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      const db = trimNormalizedToDb(value)
      return { actions: [{ type: 'SET_TRIM', deck: d, db }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function eqBinding(side: Side, band: 'high' | 'mid' | 'low'): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  const id = side === 'A'
    ? (band === 'high' ? CONTROL_IDS.mixer.channel1.eqHigh : band === 'mid' ? CONTROL_IDS.mixer.channel1.eqMid : CONTROL_IDS.mixer.channel1.eqLow)
    : (band === 'high' ? CONTROL_IDS.mixer.channel2.eqHigh : band === 'mid' ? CONTROL_IDS.mixer.channel2.eqMid : CONTROL_IDS.mixer.channel2.eqLow)
  return {
    id, kind: 'rotary-bounded',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      const db = eqNormalizedToDb(value)
      const actionType = band === 'high' ? 'SET_EQ_HIGH' : band === 'mid' ? 'SET_EQ_MID' : 'SET_EQ_LOW'
      return { actions: [{ type: actionType, deck: d, db } as Action], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function cfxBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.mixer.channel1.cfx : CONTROL_IDS.mixer.channel2.cfx,
    kind: 'rotary-bounded',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      const p = filterNormalizedToParam(value)
      return { actions: [{ type: 'SET_FILTER', deck: d, p }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function masterLevelBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.mixer.master.level, kind: 'rotary-bounded',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      const level = masterLevelFrom3D(value)
      return { actions: [{ type: 'SET_MASTER', level }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function masterCueBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.mixer.master.cue, kind: 'button', unbound: true,
    onDown: noop, onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function headphonesMixBinding(): ControlBinding {
  // DJState does not persist a HP mix value; this control is UNBOUND.
  return {
    id: CONTROL_IDS.mixer.headphones.mix, kind: 'rotary-bounded', unbound: true,
    onDown: noop, onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function headphonesLevelBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.mixer.headphones.level, kind: 'rotary-bounded', unbound: true,
    onDown: noop, onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function micLevelBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.mixer.mic.level, kind: 'rotary-bounded', unbound: true,
    onDown: noop, onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function channelFaderBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.mixer.channel1.fader : CONTROL_IDS.mixer.channel2.fader,
    kind: 'linear',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      const fader = channelFaderFrom3D(value)
      return { actions: [{ type: 'SET_CHANNEL_FADER', deck: d, fader }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function crossfaderBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.mixer.crossfader, kind: 'crossfader',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      const x = crossfaderFrom3D(value)
      return { actions: [{ type: 'SET_CROSSFADER', x }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function channelCueBinding(side: Side): ControlBinding {
  return {
    id: side === 'A' ? CONTROL_IDS.mixer.channel1.cue : CONTROL_IDS.mixer.channel2.cue,
    kind: 'button', unbound: true,
    onDown: noop, onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

// ── Browse / load ─────────────────────────────────────────────

function browseEncoderBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.browse.encoder, kind: 'rotary-relative',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      const step = Math.sign(value) * Math.max(1, Math.round(Math.abs(value) * 8))
      return { actions: [{ type: 'LIBRARY_SELECT', delta: step }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function loadBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.browse.load1 : CONTROL_IDS.browse.load2,
    kind: 'button',
    onDown: () => ({ actions: [{ type: 'LIBRARY_LOAD', deck: d }] }),
    onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

// ── Beat FX ───────────────────────────────────────────────────

function fxSelectBinding(): ControlBinding {
  // The GLB `BeatFxSelect` is the type encoder (rotary). We map a 0..1
  // value to one of the FX types in a fixed order. (This is a simplified
  // model — the physical control is a continuous encoder.)
  return {
    id: CONTROL_IDS.fx.select, kind: 'rotary-bounded',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      const t = Math.max(0, Math.min(1, value))
      const types: Array<'ECHO' | 'DELAY' | 'REVERB' | 'FLANGER' | 'FILTER'> = ['ECHO', 'DELAY', 'REVERB', 'FLANGER', 'FILTER']
      const idx = Math.min(types.length - 1, Math.floor(t * types.length))
      return { actions: [{ type: 'SET_BEAT_FX_TYPE', fxType: types[idx] }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function fxBeatLeftBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.fx.beatLeft, kind: 'button',
    onDown: () => ({ actions: [{ type: 'SET_BEAT_FX_BEATS', multiplierIndex: 0 }] }),
    onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function fxBeatRightBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.fx.beatRight, kind: 'button',
    onDown: () => ({ actions: [{ type: 'SET_BEAT_FX_BEATS', multiplierIndex: 1 }] }),
    onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function fxOnOffBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.fx.onOff, kind: 'button',
    onDown: () => ({ actions: [{ type: 'TOGGLE_BEAT_FX' }] }),
    onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function fxChannelSelectBinding(): ControlBinding {
  // The GLB `BeatFxChannelSelect` is a 3-position switch (A / B / MASTER).
  // We expose onValue so the 3D control can drive the target, while
  // onDown cycles through the three positions.
  return {
    id: CONTROL_IDS.fx.channelSelect, kind: 'switch',
    onDown: (_c, _s) => {
      // Cycle by inspecting state at dispatch time via the marker.
      return { actions: [{ type: 'CYCLE_BEAT_FX_TARGET' } as unknown as Action] }
    },
    onUp: noop,
    onValue: (_c, value) => {
      const v = Math.max(0, Math.min(1, value))
      const target: 'A' | 'B' | 'MASTER' = v < 0.34 ? 'A' : v < 0.67 ? 'B' : 'MASTER'
      return { actions: [{ type: 'SET_BEAT_FX_TARGET', target }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function fxLevelDepthBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.fx.levelDepth, kind: 'rotary-bounded',
    onDown: noop, onUp: noop,
    onValue: (_c, value) => {
      return { actions: [{ type: 'SET_BEAT_FX_DEPTH', depth: Math.max(0, Math.min(1, value)) }], consumed: true }
    },
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

// ── Smart controls ────────────────────────────────────────────

function smartCfxBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: CONTROL_IDS.mixer.smartCfx, kind: 'button',
    onDown: () => ({ actions: [{ type: 'TOGGLE_SMART_CFX', deck: d }] }),
    onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

function smartFaderBinding(): ControlBinding {
  return {
    id: CONTROL_IDS.mixer.smartFader, kind: 'button',
    onDown: () => ({ actions: [{ type: 'TOGGLE_SMART_FADER' }] }),
    onUp: noop, onValue: noopValue,
    onJogStart: noop, onJogMove: noopJog, onJogEnd: noop
  }
}

// ── Jogs (platter + rim) ──────────────────────────────────────

function jogPlatterBinding(side: Side): ControlBinding {
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? CONTROL_IDS.decks.left.jog : CONTROL_IDS.decks.right.jog,
    kind: 'jog',
    onDown: noop, onUp: noop,
    onValue: noopValue,
    onJogStart: () => ({ actions: [{ type: 'JOG_PLATTER_START', deck: d }] }),
    onJogMove: (_c, info) => ({
      actions: [{
        type: 'JOG_PLATTER_MOVE', deck: d,
        deltaRadians: info.deltaRadians, velocity: info.velocity,
        direction: info.direction >= 0 ? 'forward' : 'backward'
      }],
      consumed: true
    }),
    onJogEnd: () => ({ actions: [{ type: 'JOG_PLATTER_END', deck: d }] })
  }
}

function jogRimBinding(side: Side): ControlBinding {
  // Rim is a separate hit zone under the same control ID suffix ".jog.rim".
  const d: 0 | 1 = side === 'A' ? 0 : 1
  return {
    id: side === 'A' ? `${CONTROL_IDS.decks.left.jog}.rim` : `${CONTROL_IDS.decks.right.jog}.rim`,
    kind: 'jog',
    onDown: noop, onUp: noop,
    onValue: noopValue,
    onJogStart: () => ({ actions: [{ type: 'JOG_RIM_START', deck: d }] }),
    onJogMove: (_c, info) => ({
      actions: [{
        type: 'JOG_RIM_MOVE', deck: d,
        deltaRadians: info.deltaRadians, velocity: info.velocity,
        direction: info.direction >= 0 ? 'forward' : 'backward'
      }],
      consumed: true
    }),
    onJogEnd: () => ({ actions: [{ type: 'JOG_RIM_END', deck: d }] })
  }
}

// ── Build the registry ────────────────────────────────────────

export function buildBindingTable(): Map<string, ControlBinding> {
  const t = new Map<string, ControlBinding>()

  function add(b: ControlBinding): void { t.set(b.id, b) }

  for (const side of ['A', 'B'] as const) {
    add(playBinding(side))
    add(cueBinding(side))
    add(shiftBinding(side))
    add(syncBinding(side))
    add(loopInBinding(side))
    add(loopOutBinding(side))
    add(fourBeatBinding(side))
    add(loopCallBinding(side, 'left'))
    add(loopCallBinding(side, 'right'))

    add(padModeBinding(side, 'HOT_CUE'))
    add(padModeBinding(side, 'BEAT_JUMP'))
    add(padModeBinding(side, 'SAMPLER'))
    add(padFx1Binding(side))

    for (let i = 1; i <= 8; i += 1) add(padBinding(side, i))

    add(tempoBinding(side))
    add(trimBinding(side))
    add(eqBinding(side, 'high'))
    add(eqBinding(side, 'mid'))
    add(eqBinding(side, 'low'))
    add(cfxBinding(side))
    add(channelFaderBinding(side))
    add(channelCueBinding(side))

    add(jogPlatterBinding(side))
    add(jogRimBinding(side))
  }

  add(masterLevelBinding())
  add(masterCueBinding())
  add(headphonesMixBinding())
  add(headphonesLevelBinding())
  add(micLevelBinding())
  add(crossfaderBinding())

  add(browseEncoderBinding())
  add(loadBinding('A'))
  add(loadBinding('B'))

  add(fxSelectBinding())
  add(fxBeatLeftBinding())
  add(fxBeatRightBinding())
  add(fxOnOffBinding())
  add(fxChannelSelectBinding())
  add(fxLevelDepthBinding())

  add(smartCfxBinding('A'))
  add(smartFaderBinding())

  return t
}

/** The dispatcher converts binding output into real DJEngine actions
 *  and provides library helpers (browse/load) which DJEngine does not own.
 *  It is created separately in ./dispatcher.ts. */
export interface EngineDispatcher {
  dispatch(action: Action): void
  /** Library helpers for browse/load. The engine does not own the library. */
  librarySelect(delta: number): void
  libraryLoadTo(deck: 0 | 1): void
}

export class ControlAdapter {
  private readonly table: Map<string, ControlBinding>

  constructor(table?: Map<string, ControlBinding>) {
    this.table = table ?? buildBindingTable()
  }

  getBinding(id: string): ControlBinding | undefined {
    return this.table.get(id)
  }

  listUnbound(): string[] {
    const out: string[] = []
    for (const b of this.table.values()) if (b.unbound) out.push(b.id)
    return out
  }

  /** Apply a pointer-down event to a control. */
  onDown(control: RuntimeControl): DispatchableAction[] {
    const b = this.table.get(control.id)
    if (!b || b.unbound) return []
    const side = deckSideFor(control)
    return b.onDown(control, side).actions
  }

  onUp(control: RuntimeControl): DispatchableAction[] {
    const b = this.table.get(control.id)
    if (!b || b.unbound) return []
    const side = deckSideFor(control)
    return b.onUp(control, side).actions
  }

  onValue(control: RuntimeControl, value: number): DispatchableAction[] {
    const b = this.table.get(control.id)
    if (!b || b.unbound) return []
    const side = deckSideFor(control)
    return b.onValue(control, value, side).actions
  }

  onJogStart(control: RuntimeControl): DispatchableAction[] {
    const b = this.table.get(control.id)
    if (!b || b.unbound) return []
    const side = deckSideFor(control)
    return b.onJogStart(control, side).actions
  }

  onJogMove(control: RuntimeControl, info: { deltaRadians: number; velocity: number; direction: 1 | -1 }): DispatchableAction[] {
    const b = this.table.get(control.id)
    if (!b || b.unbound) return []
    const side = deckSideFor(control)
    return b.onJogMove(control, info, side).actions
  }

  onJogEnd(control: RuntimeControl): DispatchableAction[] {
    const b = this.table.get(control.id)
    if (!b || b.unbound) return []
    const side = deckSideFor(control)
    return b.onJogEnd(control, side).actions
  }
}

// Re-export to silence unused-warning when nothing else references the helper.
export { tempoNormalizedToPercent as _tempoNormalizedToPercent }
