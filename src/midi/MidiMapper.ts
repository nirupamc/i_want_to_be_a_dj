/**
 * M11 MidiMapper: routes parsed MIDI messages to DJEngine semantic actions.
 *
 * Data-driven: mapping config defines which MIDI messages map to which actions.
 * The mapper handles normalization, relative encoding, soft takeover, and debounce.
 */

import type { ParsedMidiMessage, MidiMapping, SoftTakeoverState } from './midiTypes'
import type { ButtonState } from './midiMath'
import type { Action } from '../types'
import {
  midi7ToBipolar,
  centeredMidiToRange,
  getCCValue,
  createSoftTakeover,
  softTakeoverShouldActivate,
} from './midiMath'

/** Action dispatcher type */
type ActionDispatcher = (action: Action) => void

/** State getter for soft takeover */
type StateGetter = () => { decks: [{ tempoPercent: number }, { tempoPercent: number }]; mixer: { crossfader: number; master: number; channels: [{ trimDb: number; eqLowDb: number; eqMidDb: number; eqHighDb: number; filter: number; channelFader: number }, { trimDb: number; eqLowDb: number; eqMidDb: number; eqHighDb: number; filter: number; channelFader: number }] } }

export class MidiMapper {
  private mappings: MidiMapping[]
  private dispatch: ActionDispatcher
  private getState: StateGetter
  private buttonStates: Map<string, ButtonState> = new Map()
  private softTakeoverStates: Map<string, SoftTakeoverState> = new Map()
  private selectedDeck: 0 | 1 = 0 // default deck for single-channel controls

  constructor(mappings: MidiMapping[], dispatch: ActionDispatcher, getState: StateGetter) {
    this.mappings = mappings
    this.dispatch = dispatch
    this.getState = getState
  }

  /** Set which deck single-channel controls apply to */
  setSelectedDeck(deck: 0 | 1): void {
    this.selectedDeck = deck
  }

  /**
   * Process a parsed MIDI message against all configured mappings.
   * Returns true if a mapping matched.
   */
  processMessage(msg: ParsedMidiMessage): boolean {
    let matched = false

    for (const mapping of this.mappings) {
      if (this.matchesMapping(msg, mapping)) {
        this.executeMapping(msg, mapping)
        matched = true
      }
    }

    return matched
  }

  /**
   * Find all mappings that match a message signature.
   */
  findMappings(msg: ParsedMidiMessage): MidiMapping[] {
    return this.mappings.filter((m) => this.matchesMapping(msg, m))
  }

  private matchesMapping(msg: ParsedMidiMessage, mapping: MidiMapping): boolean {
    // Match message type
    if (msg.type === 'noteon' || msg.type === 'noteoff') {
      if (mapping.messageType !== 'note') return false
      if (mapping.channel !== undefined && msg.channel !== mapping.channel) return false
      if (msg.note !== mapping.data1) return false
    } else if (msg.type === 'cc') {
      if (mapping.messageType !== 'cc') return false
      if (mapping.channel !== undefined && msg.channel !== mapping.channel) return false
      if (msg.controller !== mapping.data1) return false
    } else if (msg.type === 'pitchbend') {
      if (mapping.messageType !== 'pitchbend') return false
      if (mapping.channel !== undefined && msg.channel !== mapping.channel) return false
    }

    return true
  }

  private executeMapping(msg: ParsedMidiMessage, mapping: MidiMapping): void {
    const deckIdx = mapping.deck === 'B' ? 1 : this.selectedDeck

    if (mapping.controlMode === 'NOTE') {
      this.handleNoteMapping(msg, mapping, deckIdx)
    } else if (mapping.messageType === 'cc') {
      this.handleCCMapping(msg, mapping, deckIdx)
    } else if (mapping.messageType === 'pitchbend') {
      this.handlePitchBendMapping(msg, mapping, deckIdx)
    }
  }

  private handleNoteMapping(msg: ParsedMidiMessage, mapping: MidiMapping, deckIdx: 0 | 1): void {
    if (msg.type !== 'noteon' && msg.type !== 'noteoff') return

    const isDown = msg.type === 'noteon' && msg.velocity > 0
    const btnKey = `${mapping.id}_${msg.note}`
    const buttonState = this.getButtonState(btnKey)

    if (isDown) {
      // Check for repeat press
      if (buttonState.pressed && buttonState.noteOrCc === msg.note) return
      buttonState.pressed = true
      buttonState.noteOrCc = msg.note
    } else {
      if (buttonState.noteOrCc === msg.note) {
        buttonState.pressed = false
      }
    }

    const actionStr = isDown ? mapping.action : mapping.action.replace('DOWN', 'UP').replace('PRESS', 'RELEASE')

    // Pass note number as value for pad index derivation
    this.dispatchAction(actionStr, mapping, deckIdx, isDown, msg.note)
  }

  private handleCCMapping(msg: ParsedMidiMessage, mapping: MidiMapping, deckIdx: 0 | 1): void {
    if (msg.type !== 'cc') return

    const value = getCCValue(msg.value, mapping.controlMode)

    // Soft takeover for absolute controls
    if (mapping.softTakeover && (mapping.controlMode === 'ABSOLUTE_7BIT' || mapping.controlMode === 'ABSOLUTE_14BIT')) {
      const takeoverKey = `${mapping.id}_st`
      let st = this.softTakeoverStates.get(takeoverKey)
      if (!st) {
        st = createSoftTakeover(0)
        this.softTakeoverStates.set(takeoverKey, st)
      }

      if (st.waitingForPickup) {
        if (!softTakeoverShouldActivate(st, value)) return
        st.waitingForPickup = false
      }
      st.engineValue = value
    }

    this.dispatchAction(mapping.action, mapping, deckIdx, true, value)
  }

  private handlePitchBendMapping(msg: ParsedMidiMessage, mapping: MidiMapping, deckIdx: 0 | 1): void {
    if (msg.type !== 'pitchbend') return

    // Map normalized -1..+1 to appropriate range based on action
    const normalized = (msg.normalized + 1) / 2 // 0..1
    this.dispatchAction(mapping.action, mapping, deckIdx, true, normalized)
  }

  private dispatchAction(
    actionStr: string,
    mapping: MidiMapping,
    deckIdx: 0 | 1,
    isDown: boolean,
    value: number | undefined,
  ): void {
    // Parse action string and dispatch
    // Format examples: "PLAY", "CUE_DOWN", "SET_TRIM", "SET_TEMPO"
    const parts = actionStr.split('_')
    const baseAction = parts[0]

    switch (baseAction) {
      case 'PLAY':
        this.dispatch({ type: isDown ? 'PLAY' : 'PAUSE', deck: deckIdx })
        break
      case 'PAUSE':
        this.dispatch({ type: 'PAUSE', deck: deckIdx })
        break
      case 'STOP':
        this.dispatch({ type: 'STOP', deck: deckIdx })
        break
      case 'CUE':
        if (isDown) this.dispatch({ type: 'CUE_DOWN', deck: deckIdx })
        else this.dispatch({ type: 'CUE_UP', deck: deckIdx })
        break
      case 'SHIFT':
        this.dispatch({ type: isDown ? 'SHIFT_DOWN' : 'SHIFT_UP' })
        break
      case 'NUDGE':
        if (parts[1] === 'FORWARD') this.dispatch({ type: isDown ? 'NUDGE_FORWARD_START' : 'NUDGE_END', deck: deckIdx })
        else if (parts[1] === 'BACKWARD') this.dispatch({ type: isDown ? 'NUDGE_BACKWARD_START' : 'NUDGE_END', deck: deckIdx })
        break
      case 'JOG':
        this.handleJogAction(parts, deckIdx, isDown, value)
        break
      case 'SET':
        this.handleSetAction(parts, deckIdx, value)
        break
      case 'TOGGLE':
        this.handleToggleAction(parts, deckIdx)
        break
      case 'CYCLE':
        if (actionStr === 'CYCLE_TEMPO_RANGE') this.dispatch({ type: 'CYCLE_TEMPO_RANGE', deck: deckIdx })
        break
      case 'LOOP':
        this.handleLoopAction(parts, deckIdx)
        break
      case 'PAD':
        if (parts[1] === 'MODE') {
          // PAD_MODE_HOT_CUE, PAD_MODE_BEAT_JUMP, PAD_MODE_SAMPLER
          const modeStr = parts.slice(2).join('_')
          const modeMap: Record<string, 'HOT_CUE' | 'BEAT_LOOP' | 'BEAT_JUMP' | 'SAMPLER'> = {
            HOT_CUE: 'HOT_CUE',
            BEAT_JUMP: 'BEAT_JUMP',
            SAMPLER: 'SAMPLER',
            BEAT_LOOP: 'BEAT_LOOP',
          }
          const mode = modeMap[modeStr]
          if (mode) this.dispatch({ type: 'SET_PAD_MODE', deck: deckIdx, mode })
        } else if (parts[1] === 'DOWN' || parts[1] === 'UP') {
          const padIndex = parseInt(parts[2] ?? '0', 10)
          this.dispatch({ type: parts[1] === 'DOWN' ? 'PAD_DOWN' : 'PAD_UP', deck: deckIdx, padIndex })
        } else if (parts.length === 1) {
          // Generic PAD action — derive pad index from note number
          const padIndex = Math.max(0, Math.min(7, (value ?? mapping.data1) & 0x7F))
          if (isDown) this.dispatch({ type: 'PAD_DOWN', deck: deckIdx, padIndex })
          else this.dispatch({ type: 'PAD_UP', deck: deckIdx, padIndex })
        }
        break
      case 'BROWSE':
        if (actionStr === 'BROWSE_ENCODER') {
          const delta = (value ?? 0) * 0.01
          this.dispatch({ type: 'LIBRARY_SELECT_NEXT', delta })
        } else if (actionStr === 'BROWSE_PUSH') {
          this.dispatch({ type: 'LOAD_SELECTED_TO_A', deck: deckIdx })
        }
        break
      case 'LOAD_SELECTED':
        if (parts[1] === 'TO' && parts[2]) {
          const targetDeck = parts[2] === 'A' ? 0 : 1
          this.dispatch({ type: 'LOAD_SELECTED_TO_A', deck: targetDeck })
        }
        break
      case 'TRIGGER':
        if (actionStr === 'TRIGGER_RELEASE_FX') this.dispatch({ type: 'TRIGGER_RELEASE_FX' })
        break
      case 'SET_PAD':
        if (parts[1] === 'MODE') {
          const mode = parts.slice(2).join('_') as 'HOT_CUE' | 'BEAT_LOOP' | 'BEAT_JUMP' | 'SAMPLER'
          this.dispatch({ type: 'SET_PAD_MODE', deck: deckIdx, mode })
        }
        break
      default:
        // Unknown action — ignore
        break
    }
  }

  private handleJogAction(parts: string[], deckIdx: 0 | 1, isDown: boolean, value: number | undefined): void {
    if (parts[1] === 'PLATTER') {
      if (parts[2] === 'START' || parts[2] === 'DOWN') {
        this.dispatch({ type: 'JOG_PLATTER_START', deck: deckIdx })
      } else if (parts[2] === 'END' || parts[2] === 'UP') {
        this.dispatch({ type: 'JOG_PLATTER_END', deck: deckIdx })
      } else if (parts[2] === 'MOVE') {
        const delta = (value ?? 0) * 0.01 // default sensitivity
        const direction = delta > 0 ? 'forward' : delta < 0 ? 'backward' : null
        this.dispatch({ type: 'JOG_PLATTER_MOVE', deck: deckIdx, deltaRadians: delta, velocity: Math.abs(delta), direction })
      }
    } else if (parts[1] === 'RIM') {
      if (parts[2] === 'START') {
        this.dispatch({ type: 'JOG_RIM_START', deck: deckIdx })
      } else if (parts[2] === 'END') {
        this.dispatch({ type: 'JOG_RIM_END', deck: deckIdx })
      } else if (parts[2] === 'MOVE') {
        const delta = (value ?? 0) * 0.01
        const direction = delta > 0 ? 'forward' : delta < 0 ? 'backward' : null
        this.dispatch({ type: 'JOG_RIM_MOVE', deck: deckIdx, deltaRadians: delta, velocity: Math.abs(delta), direction })
      }
    }
  }

  private handleSetAction(parts: string[], deckIdx: 0 | 1, value: number | undefined): void {
    if (value === undefined) return
    const target = parts[1]

    switch (target) {
      case 'TEMPO':
        this.dispatch({ type: 'SET_TEMPO', deck: deckIdx, percent: (value - 0.5) * 200 }) // normalize 0..1 to -100..+100
        break
      case 'TRIM':
        this.dispatch({ type: 'SET_TRIM', deck: deckIdx, db: centeredMidiToRange(value * 127, -70, 9) })
        break
      case 'EQ': {
        const band = parts[2]?.toLowerCase()
        if (band === 'low') this.dispatch({ type: 'SET_EQ_LOW', deck: deckIdx, db: centeredMidiToRange(value * 127, -26, 6) })
        else if (band === 'mid') this.dispatch({ type: 'SET_EQ_MID', deck: deckIdx, db: centeredMidiToRange(value * 127, -26, 6) })
        else if (band === 'high') this.dispatch({ type: 'SET_EQ_HIGH', deck: deckIdx, db: centeredMidiToRange(value * 127, -26, 6) })
        break
      }
      case 'FILTER':
        this.dispatch({ type: 'SET_FILTER', deck: deckIdx, p: midi7ToBipolar(value * 127) })
        break
      case 'CHANNEL_FADER':
        this.dispatch({ type: 'SET_CHANNEL_FADER', deck: deckIdx, fader: value })
        break
      case 'CROSSFADER':
        this.dispatch({ type: 'SET_CROSSFADER', x: value })
        break
      case 'MASTER':
        this.dispatch({ type: 'SET_MASTER', level: value })
        break
      case 'BEAT_FX': {
        if (parts[2] === 'DEPTH') this.dispatch({ type: 'SET_BEAT_FX_DEPTH', depth: value })
        else if (parts[2] === 'BEATS') {
          const idx = Math.round(value * 7) // 0..7
          this.dispatch({ type: 'SET_BEAT_FX_BEATS', multiplierIndex: Math.max(0, Math.min(7, idx)) })
        } else if (parts[2] === 'TYPE') {
          const types = ['ECHO', 'DELAY', 'REVERB', 'FLANGER', 'FILTER'] as const
          const idx = Math.round(value * (types.length - 1))
          this.dispatch({ type: 'SET_BEAT_FX_TYPE', fxType: types[Math.max(0, Math.min(types.length - 1, idx))] })
        } else if (parts[2] === 'TARGET') {
          const targets = ['A', 'B', 'MASTER'] as const
          const idx = Math.round(value * (targets.length - 1))
          this.dispatch({ type: 'SET_BEAT_FX_TARGET', target: targets[Math.max(0, Math.min(targets.length - 1, idx))] })
        }
        break
      }
      case 'SMART_CFX':
        this.dispatch({ type: 'SET_SMART_CFX_VALUE', deck: deckIdx, value: midi7ToBipolar(value * 127) })
        break
      case 'MANUAL_BPM':
        this.dispatch({ type: 'SET_MANUAL_BPM', deck: deckIdx, bpm: value > 0 ? value * 300 : null })
        break
    }
  }

  private handleToggleAction(parts: string[], deckIdx: 0 | 1): void {
    const target = parts.slice(1).join('_')
    switch (target) {
      case 'BEAT_SYNC': this.dispatch({ type: 'TOGGLE_BEAT_SYNC', deck: deckIdx }); break
      case 'BEAT_FX': this.dispatch({ type: 'TOGGLE_BEAT_FX' }); break
      case 'SMART_CFX': this.dispatch({ type: 'TOGGLE_SMART_CFX', deck: deckIdx }); break
      case 'SMART_FADER': this.dispatch({ type: 'TOGGLE_SMART_FADER' }); break
    }
  }

  private handleLoopAction(parts: string[], deckIdx: 0 | 1): void {
    const action = parts[1]
    switch (action) {
      case 'IN': this.dispatch({ type: 'LOOP_IN', deck: deckIdx }); break
      case 'OUT': this.dispatch({ type: 'LOOP_OUT', deck: deckIdx }); break
      case 'EXIT': this.dispatch({ type: 'LOOP_EXIT', deck: deckIdx }); break
      case '4': this.dispatch({ type: 'LOOP_4_BEAT', deck: deckIdx }); break
      case 'HALF': this.dispatch({ type: 'LOOP_HALF', deck: deckIdx }); break
      case 'DOUBLE': this.dispatch({ type: 'LOOP_DOUBLE', deck: deckIdx }); break
    }
  }

  private getButtonState(key: string): ButtonState {
    let state = this.buttonStates.get(key)
    if (!state) {
      state = { pressed: false, noteOrCc: 0 }
      this.buttonStates.set(key, state)
    }
    return state
  }

  /**
   * Reset all held states (for disconnect cleanup).
   */
  resetAll(): void {
    // Release all held buttons
    for (const [_key, state] of this.buttonStates) {
      if (state.pressed) {
        state.pressed = false
      }
    }
    this.buttonStates.clear()
    this.softTakeoverStates.clear()
  }

  /**
   * Get the current mappings.
   */
  getMappings(): MidiMapping[] {
    return this.mappings
  }

  /**
   * Add a runtime mapping (for learn mode).
   */
  addMapping(mapping: MidiMapping): void {
    // Check for duplicates
    const existing = this.mappings.find((m) =>
      m.messageType === mapping.messageType &&
      m.channel === mapping.channel &&
      m.data1 === mapping.data1 &&
      m.deck === mapping.deck,
    )
    if (existing) {
      // Replace
      const idx = this.mappings.indexOf(existing)
      this.mappings[idx] = mapping
    } else {
      this.mappings.push(mapping)
    }
  }
}
