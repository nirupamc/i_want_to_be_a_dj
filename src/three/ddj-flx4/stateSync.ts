/**
 * M12B state sync.
 *
 * Subscribes to DJEngine state changes and projects them onto the 3D
 * visual layer. Updates flow in only one direction:
 *
 *   DJEngine state  →  3D visuals
 *
 * Programmatic visual writes are wrapped in `dispatcher.withSuppressed(...)`
 * so they never reach back into DJEngine. The state subscription only
 * writes to the visual layer; it never dispatches engine actions.
 */

import type { DJState } from '../../types'
import type { ThreeToEngineDispatcher } from './dispatcher'
import type { RuntimeControl } from './controlRegistry'
import { applyControlValue, setControlLit, resetAll } from './controlVisuals'
import {
  selectBeatFxChannelPosition,
  selectBeatFxDepth,
  selectBeatFxOnLit,
  selectCfxNormalized,
  selectChannelFader,
  selectCrossfader3D,
  selectCueLit,
  selectEqHighNormalized,
  selectEqLowNormalized,
  selectEqMidNormalized,
  selectFourBeatLit,
  selectHeadphonesLevelNormalized,
  selectHeadphonesMixNormalized,
  selectLoopInLit,
  selectLoopOutLit,
  selectMasterLevelNormalized,
  selectMicLevelNormalized,
  selectPadLit,
  selectPlayLit,
  selectSmartCfxLit,
  selectSmartFaderLit,
  selectSyncLit,
  selectTempoNormalized,
  selectTrimNormalized,
} from './stateSelectors'
import { CONTROL_IDS, padId } from './controlIds'

export interface StateSyncOptions {
  controls: Record<string, RuntimeControl>
  dispatcher: ThreeToEngineDispatcher
}

export class StateSync {
  private readonly opts: StateSyncOptions
  private unsubscribe: (() => void) | null = null
  private lastSerialized = ''

  constructor(opts: StateSyncOptions) {
    this.opts = opts
  }

  start(): void {
    this.stop()
    const h = this.opts.dispatcher as unknown as { subscribe?: (l: (s: DJState) => void) => () => void; getState: () => DJState }
    if (typeof h.subscribe === 'function') {
      this.unsubscribe = h.subscribe((s) => this.applyState(s))
      this.applyState(h.getState())
    }
  }

  stop(): void {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null }
  }

  /** Apply a single state snapshot. Idempotent. Skipped when nothing
   *  observable has changed (cheap JSON-shaped diff). */
  applyState(state: DJState): void {
    const ser = JSON.stringify(state)
    if (ser === this.lastSerialized) return
    this.lastSerialized = ser
    this.opts.dispatcher.withSuppressed(() => this.writeVisuals(state))
  }

  /** Reset to defaults (used by the debug overlay button). */
  resetAll(): void {
    resetAll(Object.values(this.opts.controls))
  }

  private writeVisuals(state: DJState): void {
    const c = this.opts.controls

    // ── Decks ──
    for (const side of ['A', 'B'] as const) {
      setValue(c, side === 'A' ? CONTROL_IDS.decks.left.tempo : CONTROL_IDS.decks.right.tempo, selectTempoNormalized(state, side))
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.play : CONTROL_IDS.decks.right.play, selectPlayLit(state, side))
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.cue : CONTROL_IDS.decks.right.cue, selectCueLit(state, side))
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.sync : CONTROL_IDS.decks.right.sync, selectSyncLit(state, side))
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.loopIn : CONTROL_IDS.decks.right.loopIn, selectLoopInLit(state, side))
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.loopOut : CONTROL_IDS.decks.right.loopOut, selectLoopOutLit(state, side))
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.fourBeatExit : CONTROL_IDS.decks.right.fourBeatExit, selectFourBeatLit(state, side))

      // Pad mode lit state
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.hotCueMode : CONTROL_IDS.decks.right.hotCueMode, state.decks[side === 'A' ? 0 : 1].padMode === 'HOT_CUE')
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.beatJumpMode : CONTROL_IDS.decks.right.beatJumpMode, state.decks[side === 'A' ? 0 : 1].padMode === 'BEAT_JUMP')
      setLit(c, side === 'A' ? CONTROL_IDS.decks.left.samplerMode : CONTROL_IDS.decks.right.samplerMode, state.decks[side === 'A' ? 0 : 1].padMode === 'SAMPLER')

      // Pads
      for (let i = 1; i <= 8; i += 1) {
        const id = padId(side === 'A' ? 'left' : 'right', i)
        setLit(c, id, selectPadLit(state, side, i - 1))
      }
    }

    // ── Mixer ──
    for (const side of ['A', 'B'] as const) {
      setValue(c, side === 'A' ? CONTROL_IDS.mixer.channel1.trim : CONTROL_IDS.mixer.channel2.trim, selectTrimNormalized(state, side))
      setValue(c, side === 'A' ? CONTROL_IDS.mixer.channel1.eqHigh : CONTROL_IDS.mixer.channel2.eqHigh, selectEqHighNormalized(state, side))
      setValue(c, side === 'A' ? CONTROL_IDS.mixer.channel1.eqMid : CONTROL_IDS.mixer.channel2.eqMid, selectEqMidNormalized(state, side))
      setValue(c, side === 'A' ? CONTROL_IDS.mixer.channel1.eqLow : CONTROL_IDS.mixer.channel2.eqLow, selectEqLowNormalized(state, side))
      setValue(c, side === 'A' ? CONTROL_IDS.mixer.channel1.cfx : CONTROL_IDS.mixer.channel2.cfx, selectCfxNormalized(state, side))
      setValue(c, side === 'A' ? CONTROL_IDS.mixer.channel1.fader : CONTROL_IDS.mixer.channel2.fader, selectChannelFader(state, side))

      setLit(c, CONTROL_IDS.mixer.smartCfx, selectSmartCfxLit(state, side))
    }

    setValue(c, CONTROL_IDS.mixer.crossfader, selectCrossfader3D(state))
    setValue(c, CONTROL_IDS.mixer.master.level, selectMasterLevelNormalized(state))
    setValue(c, CONTROL_IDS.mixer.headphones.mix, selectHeadphonesMixNormalized(state))
    setValue(c, CONTROL_IDS.mixer.headphones.level, selectHeadphonesLevelNormalized(state))
    setValue(c, CONTROL_IDS.mixer.mic.level, selectMicLevelNormalized(state))

    setLit(c, CONTROL_IDS.mixer.smartFader, selectSmartFaderLit(state))

    // ── FX ──
    setValue(c, CONTROL_IDS.fx.levelDepth, selectBeatFxDepth(state))
    setLit(c, CONTROL_IDS.fx.onOff, selectBeatFxOnLit(state))

    // FX channel select: GLB is a 3-position switch. We use onValue with
    // 0/0.5/1 mapping, then leave press visual alone.
    const pos = selectBeatFxChannelPosition(state)
    setValue(c, CONTROL_IDS.fx.channelSelect, pos === 0 ? 0 : pos === 1 ? 0.5 : 1)
  }
}

function setValue(controls: Record<string, RuntimeControl>, id: string, value: number): void {
  const c = controls[id]
  if (!c) return
  applyControlValue(c, value)
}

function setLit(controls: Record<string, RuntimeControl>, id: string, lit: boolean): void {
  const c = controls[id]
  if (!c) return
  setControlLit(c, lit)
}
