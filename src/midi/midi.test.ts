/**
 * M11 comprehensive MIDI tests.
 * Covers: parser, normalization, relative encoders, soft takeover, mapping validation,
 * mapper routing, button debounce, and disconnect cleanup.
 */

import { describe, it, expect } from 'vitest'
import { parseMidiMessage } from '../midi/midiParser'
import {
  midi7ToNormalized,
  midi7ToBipolar,
  midi14ToNormalized,
  centeredMidiToRange,
  decodeTwosComplement,
  decodeBinaryOffset,
  decodeRelative,
  midiDeltaToRadians,
  createSoftTakeover,
  softTakeoverShouldActivate,
  updateSoftTakeover,
  isButtonNewPress,
} from '../midi/midiMath'
import { MidiMapper } from '../midi/MidiMapper'
import { MidiManager } from '../midi/MidiManager'
import { DDJ_FLX4_MAPPINGS } from '../midi/mappings/ddjFlx4'
import type { Action } from '../types'

// ── MIDI Parser Tests ─────────────────────────────────────────

describe('MIDI Parser', () => {
  it('parses Note On message', () => {
    const msg = parseMidiMessage(new Uint8Array([0x90, 0x3C, 0x7F]))
    expect(msg).toEqual({ type: 'noteon', channel: 0, note: 60, velocity: 127 })
  })

  it('parses Note On velocity 0 as Note Off', () => {
    const msg = parseMidiMessage(new Uint8Array([0x90, 0x3C, 0x00]))
    expect(msg).toEqual({ type: 'noteoff', channel: 0, note: 60, velocity: 0 })
  })

  it('parses Note Off message', () => {
    const msg = parseMidiMessage(new Uint8Array([0x80, 0x3C, 0x40]))
    expect(msg).toEqual({ type: 'noteoff', channel: 0, note: 60, velocity: 64 })
  })

  it('parses Control Change', () => {
    const msg = parseMidiMessage(new Uint8Array([0xB0, 0x07, 0x64]))
    expect(msg).toEqual({ type: 'cc', channel: 0, controller: 7, value: 100 })
  })

  it('parses Pitch Bend', () => {
    const msg = parseMidiMessage(new Uint8Array([0xE0, 0x00, 0x40]))
    expect(msg).not.toBeNull()
    if (msg && msg.type === 'pitchbend') {
      expect(msg.channel).toBe(0)
      expect(msg.value14).toBe(8192) // center
      expect(msg.normalized).toBeCloseTo(0, 2)
    }
  })

  it('parses Pitch Bend at max', () => {
    const msg = parseMidiMessage(new Uint8Array([0xE0, 0x7F, 0x7F]))
    expect(msg).not.toBeNull()
    if (msg && msg.type === 'pitchbend') {
      expect(msg.value14).toBe(16383)
      expect(msg.normalized).toBeCloseTo(1, 2)
    }
  })

  it('parses channel correctly for different channels', () => {
    const msg = parseMidiMessage(new Uint8Array([0x91, 0x3C, 0x7F]))
    expect(msg).toEqual({ type: 'noteon', channel: 1, note: 60, velocity: 127 })
  })

  it('returns null for too-short message', () => {
    expect(parseMidiMessage(new Uint8Array([0x90]))).toBeNull()
  })

  it('returns null for empty message', () => {
    expect(parseMidiMessage(new Uint8Array([]))).toBeNull()
  })

  it('parses channel 15', () => {
    const msg = parseMidiMessage(new Uint8Array([0x9F, 0x00, 0x7F]))
    expect(msg).not.toBeNull()
    if (msg) expect(msg.channel).toBe(15)
  })
})

// ── Normalization Tests ───────────────────────────────────────

describe('MIDI Normalization', () => {
  it('midi7ToNormalized: 0 → 0', () => {
    expect(midi7ToNormalized(0)).toBe(0)
  })

  it('midi7ToNormalized: 127 → 1', () => {
    expect(midi7ToNormalized(127)).toBe(1)
  })

  it('midi7ToNormalized: 64 → ~0.5', () => {
    expect(midi7ToNormalized(64)).toBeCloseTo(0.504, 2)
  })

  it('midi7ToBipolar: center → 0', () => {
    expect(midi7ToBipolar(63)).toBeCloseTo(-0.00787, 3)
    expect(midi7ToBipolar(64)).toBeCloseTo(0.00787, 3)
  })

  it('midi7ToBipolar: 0 → -1', () => {
    expect(midi7ToBipolar(0)).toBeCloseTo(-1, 2)
  })

  it('midi7ToBipolar: 127 → +1', () => {
    expect(midi7ToBipolar(127)).toBeCloseTo(1, 2)
  })

  it('midi14ToNormalized: 0 → 0', () => {
    expect(midi14ToNormalized(0)).toBe(0)
  })

  it('midi14ToNormalized: 16383 → 1', () => {
    expect(midi14ToNormalized(16383)).toBe(1)
  })

  it('midi14ToNormalized: 8192 → ~0.5', () => {
    expect(midi14ToNormalized(8192)).toBeCloseTo(0.5, 2)
  })

  it('centeredMidiToRange: center → 0', () => {
    expect(centeredMidiToRange(64, -26, 6)).toBeCloseTo(0, 1)
  })

  it('centeredMidiToRange: 127 → max', () => {
    expect(centeredMidiToRange(127, -26, 6)).toBeCloseTo(6, 1)
  })

  it('centeredMidiToRange: 0 → min', () => {
    expect(centeredMidiToRange(0, -26, 6)).toBeCloseTo(-26, 1)
  })

  it('clamps values outside range', () => {
    expect(midi7ToNormalized(-10)).toBe(0)
    expect(midi7ToNormalized(200)).toBe(1)
  })
})

// ── Relative Encoder Tests ────────────────────────────────────

describe('Relative Encoders', () => {
  it('decodeTwosComplement: 64 → 0', () => {
    expect(decodeTwosComplement(64)).toBe(0)
  })

  it('decodeTwosComplement: 0 → 0', () => {
    expect(decodeTwosComplement(0)).toBe(0)
  })

  it('decodeTwosComplement: 1 → +1', () => {
    expect(decodeTwosComplement(1)).toBe(1)
  })

  it('decodeTwosComplement: 63 → +63', () => {
    expect(decodeTwosComplement(63)).toBe(63)
  })

  it('decodeTwosComplement: 65 → -63', () => {
    expect(decodeTwosComplement(65)).toBe(-63)
  })

  it('decodeTwosComplement: 127 → -1', () => {
    expect(decodeTwosComplement(127)).toBe(-1)
  })

  it('decodeBinaryOffset: 64 → 0', () => {
    expect(decodeBinaryOffset(64)).toBe(0)
  })

  it('decodeBinaryOffset: 0 → -64', () => {
    expect(decodeBinaryOffset(0)).toBe(-64)
  })

  it('decodeBinaryOffset: 127 → +63', () => {
    expect(decodeBinaryOffset(127)).toBe(63)
  })

  it('decodeRelative selects correct mode', () => {
    expect(decodeRelative(65, 'RELATIVE_TWOS_COMPLEMENT')).toBe(-63)
    expect(decodeRelative(65, 'RELATIVE_BINARY_OFFSET')).toBe(1)
  })

  it('midiDeltaToRadians scales correctly', () => {
    expect(midiDeltaToRadians(10, 0.01)).toBeCloseTo(0.1, 5)
    expect(midiDeltaToRadians(-5, 0.02)).toBeCloseTo(-0.1, 5)
  })
})

// ── Soft Takeover Tests ───────────────────────────────────────

describe('Soft Takeover', () => {
  it('createSoftTakeover creates waiting state', () => {
    const st = createSoftTakeover(0.5)
    expect(st.active).toBe(true)
    expect(st.engineValue).toBe(0.5)
    expect(st.waitingForPickup).toBe(true)
  })

  it('softTakeoverShouldActivate: close enough', () => {
    const st = createSoftTakeover(0.5)
    expect(softTakeoverShouldActivate(st, 0.51)).toBe(true)
  })

  it('softTakeoverShouldActivate: too far', () => {
    const st = createSoftTakeover(0.5)
    expect(softTakeoverShouldActivate(st, 0.1)).toBe(false)
  })

  it('softTakeoverShouldActivate: already active', () => {
    const st: ReturnType<typeof createSoftTakeover> = { active: true, engineValue: 0.5, waitingForPickup: false }
    expect(softTakeoverShouldActivate(st, 0.9)).toBe(true)
  })

  it('updateSoftTakeover resets pickup', () => {
    const st = createSoftTakeover(0.5)
    const updated = updateSoftTakeover(st, 0.7)
    expect(updated.engineValue).toBe(0.7)
    expect(updated.waitingForPickup).toBe(true)
  })
})

// ── Button Debounce Tests ─────────────────────────────────────

describe('Button Debounce', () => {
  it('first press is new', () => {
    const state = { pressed: false, noteOrCc: 0 }
    expect(isButtonNewPress(state, 60, true)).toBe(true)
    expect(state.pressed).toBe(true)
  })

  it('repeat press is not new', () => {
    const state = { pressed: true, noteOrCc: 60 }
    expect(isButtonNewPress(state, 60, true)).toBe(false)
  })

  it('release clears state', () => {
    const state = { pressed: true, noteOrCc: 60 }
    isButtonNewPress(state, 60, false)
    expect(state.pressed).toBe(false)
  })

  it('different note is new', () => {
    const state = { pressed: true, noteOrCc: 60 }
    expect(isButtonNewPress(state, 61, true)).toBe(true)
  })
})

// ── Mapper Tests ──────────────────────────────────────────────

describe('MidiMapper', () => {
  const defaultState = () => ({
    decks: [{ tempoPercent: 0 }, { tempoPercent: 0 }] as [{ tempoPercent: number }, { tempoPercent: number }],
    mixer: {
      crossfader: 0.5,
      master: 0.8,
      channels: [
        { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1 },
        { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1 },
      ] as [
        { trimDb: number; eqLowDb: number; eqMidDb: number; eqHighDb: number; filter: number; channelFader: number },
        { trimDb: number; eqLowDb: number; eqMidDb: number; eqHighDb: number; filter: number; channelFader: number },
      ],
    },
  })

  it('dispatches PLAY on note message matching play mapping', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'play_a', description: 'Play A', messageType: 'note', channel: 0, data1: 0x0B, controlMode: 'NOTE', deck: 'A', action: 'PLAY', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'noteon', channel: 0, note: 0x0B, velocity: 127 })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toEqual({ type: 'PLAY', deck: 0 })
  })

  it('dispatches CUE_DOWN on note press, CUE_UP on release', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'cue_a', description: 'Cue A', messageType: 'note', channel: 0, data1: 0x0C, controlMode: 'NOTE', deck: 'A', action: 'CUE', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'noteon', channel: 0, note: 0x0C, velocity: 100 })
    expect(actions[0]).toEqual({ type: 'CUE_DOWN', deck: 0 })

    mapper.processMessage({ type: 'noteoff', channel: 0, note: 0x0C, velocity: 0 })
    expect(actions[1]).toEqual({ type: 'CUE_UP', deck: 0 })
  })

  it('dispatches SHIFT_DOWN/UP', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'shift', description: 'Shift', messageType: 'note', data1: 0x36, controlMode: 'NOTE', action: 'SHIFT', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'noteon', channel: 0, note: 0x36, velocity: 127 })
    expect(actions[0]).toEqual({ type: 'SHIFT_DOWN' })

    mapper.processMessage({ type: 'noteoff', channel: 0, note: 0x36, velocity: 0 })
    expect(actions[1]).toEqual({ type: 'SHIFT_UP' })
  })

  it('dispatches SET_TRIM for CC mixer control', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'trim_a', description: 'Trim A', messageType: 'cc', channel: 0, data1: 0x00, controlMode: 'ABSOLUTE_7BIT', deck: 'A', action: 'SET_TRIM', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'cc', channel: 0, controller: 0x00, value: 127 })
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('SET_TRIM')
    expect((actions[0] as { deck: number }).deck).toBe(0)
  })

  it('dispatches SET_CROSSFADER', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'xf', description: 'Xf', messageType: 'cc', channel: 0, data1: 0x0C, controlMode: 'ABSOLUTE_7BIT', action: 'SET_CROSSFADER', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'cc', channel: 0, controller: 0x0C, value: 0 })
    expect(actions[0]).toEqual({ type: 'SET_CROSSFADER', x: 0 })
  })

  it('dispatches TOGGLE_BEAT_FX', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'fx', description: 'FX', messageType: 'note', data1: 0x60, controlMode: 'NOTE', action: 'TOGGLE_BEAT_FX', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'noteon', channel: 0, note: 0x60, velocity: 127 })
    expect(actions[0]).toEqual({ type: 'TOGGLE_BEAT_FX' })
  })

  it('dispatches PAD_DOWN with correct pad index', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'pad_1_a', description: 'Pad 1 A', messageType: 'note', channel: 0, data1: 0x00, controlMode: 'NOTE', deck: 'A', action: 'PAD', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'noteon', channel: 0, note: 0x00, velocity: 127 })
    expect(actions[0]).toEqual({ type: 'PAD_DOWN', deck: 0, padIndex: 0 })
  })

  it('dispatches LOOP_IN', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'loop_in_a', description: 'Loop In A', messageType: 'note', channel: 0, data1: 0x51, controlMode: 'NOTE', deck: 'A', action: 'LOOP_IN', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'noteon', channel: 0, note: 0x51, velocity: 127 })
    expect(actions[0]).toEqual({ type: 'LOOP_IN', deck: 0 })
  })

  it('dispatches SET_PAD_MODE for pad mode buttons', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'hotcue_mode', description: 'HC Mode', messageType: 'note', channel: 0, data1: 0x10, controlMode: 'NOTE', deck: 'A', action: 'PAD_MODE_HOT_CUE', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'noteon', channel: 0, note: 0x10, velocity: 127 })
    expect(actions[0]).toEqual({ type: 'SET_PAD_MODE', deck: 0, mode: 'HOT_CUE' })
  })

  it('ignores unmatched messages', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'play_a', description: 'Play A', messageType: 'note', channel: 0, data1: 0x0B, controlMode: 'NOTE', deck: 'A', action: 'PLAY', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    // Send a message with wrong channel
    mapper.processMessage({ type: 'noteon', channel: 15, note: 0x0B, velocity: 127 })
    expect(actions).toHaveLength(0)
  })

  it('deck B mapping uses correct deck index', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'play_b', description: 'Play B', messageType: 'note', channel: 1, data1: 0x0B, controlMode: 'NOTE', deck: 'B', action: 'PLAY', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    mapper.processMessage({ type: 'noteon', channel: 1, note: 0x0B, velocity: 127 })
    expect(actions[0]).toEqual({ type: 'PLAY', deck: 1 })
  })

  it('findMappings returns all matching mappings', () => {
    const mapper = new MidiMapper(
      DDJ_FLX4_MAPPINGS,
      () => {},
      defaultState,
    )

    const matches = mapper.findMappings({ type: 'noteon', channel: 0, note: 0x0B, velocity: 127 })
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches.some(m => m.action === 'PLAY')).toBe(true)
  })
})

// ── Mapping Validation Tests ──────────────────────────────────

describe('Mapping Validation', () => {
  it('DDJ-FLX4 mappings are non-empty', () => {
    expect(DDJ_FLX4_MAPPINGS.length).toBeGreaterThan(20)
  })

  it('all mappings have valid channel range', () => {
    for (const m of DDJ_FLX4_MAPPINGS) {
      if (m.channel !== undefined) {
        expect(m.channel).toBeGreaterThanOrEqual(0)
        expect(m.channel).toBeLessThanOrEqual(15)
      }
    }
  })

  it('all mappings have valid data1 range', () => {
    for (const m of DDJ_FLX4_MAPPINGS) {
      expect(m.data1).toBeGreaterThanOrEqual(0)
      expect(m.data1).toBeLessThanOrEqual(127)
    }
  })

  it('MidiManager.validateMappings catches duplicates', () => {
    const dupes = MidiManager.validateMappings([
      { id: 'a', description: 'A', messageType: 'note', channel: 0, data1: 60, controlMode: 'NOTE', action: 'PLAY', source: 'UNVERIFIED' },
      { id: 'b', description: 'B', messageType: 'note', channel: 0, data1: 60, controlMode: 'NOTE', action: 'PLAY', source: 'UNVERIFIED' },
    ])
    expect(dupes.length).toBe(1)
    expect(dupes[0]).toContain('Duplicate')
  })

  it('MidiManager.validateMappings passes unique mappings', () => {
    const errors = MidiManager.validateMappings([
      { id: 'a', description: 'A', messageType: 'note', channel: 0, data1: 60, controlMode: 'NOTE', action: 'PLAY', source: 'UNVERIFIED' },
      { id: 'b', description: 'B', messageType: 'note', channel: 1, data1: 60, controlMode: 'NOTE', action: 'PLAY', source: 'UNVERIFIED' },
    ])
    expect(errors).toHaveLength(0)
  })

  it('MidiManager.validateMappings catches invalid channel', () => {
    const errors = MidiManager.validateMappings([
      { id: 'bad', description: 'Bad', messageType: 'note', channel: 16, data1: 60, controlMode: 'NOTE', action: 'PLAY', source: 'UNVERIFIED' },
    ])
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('Invalid channel')
  })

  it('MidiManager.validateMappings catches invalid data1', () => {
    const errors = MidiManager.validateMappings([
      { id: 'bad', description: 'Bad', messageType: 'note', data1: 200, controlMode: 'NOTE', action: 'PLAY', source: 'UNVERIFIED' },
    ])
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('Invalid data1')
  })
})

// ── Mapper Reset Tests ────────────────────────────────────────

describe('MidiMapper Reset', () => {
  const defaultState = () => ({
    decks: [{ tempoPercent: 0 }, { tempoPercent: 0 }] as [{ tempoPercent: number }, { tempoPercent: number }],
    mixer: {
      crossfader: 0.5,
      master: 0.8,
      channels: [
        { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1 },
        { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1 },
      ] as [
        { trimDb: number; eqLowDb: number; eqMidDb: number; eqHighDb: number; filter: number; channelFader: number },
        { trimDb: number; eqLowDb: number; eqMidDb: number; eqHighDb: number; filter: number; channelFader: number },
      ],
    },
  })

  it('resetAll clears button states so re-press works', () => {
    const actions: Action[] = []
    const mapper = new MidiMapper(
      [{ id: 'pad1', description: 'P1', messageType: 'note', channel: 0, data1: 0, controlMode: 'NOTE', deck: 'A', action: 'PAD', source: 'UNVERIFIED' }],
      (a) => actions.push(a as Action),
      defaultState,
    )

    // Press a pad
    mapper.processMessage({ type: 'noteon', channel: 0, note: 0, velocity: 127 })
    expect(actions).toHaveLength(1)

    // Repeat press on same pad is debounced
    mapper.processMessage({ type: 'noteon', channel: 0, note: 0, velocity: 127 })
    expect(actions).toHaveLength(1) // still 1

    // Reset clears debounce
    mapper.resetAll()

    // Press again after reset — should fire
    mapper.processMessage({ type: 'noteon', channel: 0, note: 0, velocity: 127 })
    expect(actions).toHaveLength(2)
  })
})
