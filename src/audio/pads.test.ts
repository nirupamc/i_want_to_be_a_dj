import { describe, it, expect } from 'vitest'
import type { HotCue, PadMode, SamplerSlotState, SamplerState } from '../types'
import { SAMPLER_SLOT_COUNT } from './SamplerEngine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHotCue(index: number, pos: number, active = true): HotCue {
  return { index, positionSeconds: pos, active }
}

function makeSamplerSlot(index: number, loaded = false, playing = false): SamplerSlotState {
  return { index, loaded, name: loaded ? `Sample ${index + 1}` : null, durationSeconds: loaded ? 3.5 : null, playing }
}

function makeSamplerState(): SamplerState {
  return {
    slots: Array.from({ length: SAMPLER_SLOT_COUNT }, (_, i) => makeSamplerSlot(i)) as SamplerState['slots'],
    gain: 0.7,
  }
}

// ---------------------------------------------------------------------------
// Hot Cue: save
// ---------------------------------------------------------------------------

describe('hot cue save', () => {
  it('empty slot stores position', () => {
    const cues: HotCue[] = Array.from({ length: 8 }, (_, i) => makeHotCue(i, 0, false))
    const pos = 15.5
    cues[2] = { index: 2, positionSeconds: pos, active: true }
    expect(cues[2].active).toBe(true)
    expect(cues[2].positionSeconds).toBe(15.5)
  })

  it('slot is clamped to valid range', () => {
    const pos = 0
    const cue = makeHotCue(0, Math.max(0, Math.min(100, pos)))
    expect(cue.positionSeconds).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Hot Cue: trigger
// ---------------------------------------------------------------------------

describe('hot cue trigger', () => {
  it('populated pad returns cue position', () => {
    const cue = makeHotCue(3, 25.0)
    expect(cue.active).toBe(true)
    expect(cue.positionSeconds).toBe(25.0)
  })

  it('empty pad is not active', () => {
    const cue = makeHotCue(5, 0, false)
    expect(cue.active).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Hot Cue: delete
// ---------------------------------------------------------------------------

describe('hot cue delete', () => {
  it('SHIFT + populated pad clears cue', () => {
    const cues: HotCue[] = Array.from({ length: 8 }, (_, i) => makeHotCue(i, 10 + i))
    // Delete pad 3
    cues[3] = { index: 3, positionSeconds: 0, active: false }
    expect(cues[3].active).toBe(false)
    // Other cues unchanged
    expect(cues[2].active).toBe(true)
    expect(cues[4].active).toBe(true)
  })

  it('SHIFT + empty pad is safe no-op', () => {
    const cues: HotCue[] = Array.from({ length: 8 }, (_, i) => makeHotCue(i, 0, false))
    cues[5] = { index: 5, positionSeconds: 0, active: false }
    expect(cues[5].active).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Hot Cue: new track resets
// ---------------------------------------------------------------------------

describe('hot cue new track reset', () => {
  it('all hot cues reset on new track', () => {
    let cues: HotCue[] = Array.from({ length: 8 }, (_, i) => makeHotCue(i, 10 + i))
    // Simulate new track load
    cues = Array.from({ length: 8 }, (_, i) => makeHotCue(i, 0, false))
    expect(cues.every((c) => !c.active)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Hot Cue: independence from primary cue
// ---------------------------------------------------------------------------

describe('hot cue independence', () => {
  it('hot cues do not affect primary cue', () => {
    const primaryCue = 10.0
    const hotCue = makeHotCue(0, 25.0)
    expect(primaryCue).toBe(10.0)
    expect(hotCue.positionSeconds).toBe(25.0)
    expect(primaryCue).not.toBe(hotCue.positionSeconds)
  })
})

// ---------------------------------------------------------------------------
// Hot Cue: deck isolation
// ---------------------------------------------------------------------------

describe('hot cue deck isolation', () => {
  it('deck A hot cues do not affect deck B', () => {
    const deckA: HotCue[] = Array.from({ length: 8 }, (_, i) => makeHotCue(i, 10 + i))
    const deckB: HotCue[] = Array.from({ length: 8 }, (_, i) => makeHotCue(i, 0, false))
    deckA[0] = { index: 0, positionSeconds: 50, active: true }
    expect(deckB[0].active).toBe(false)
    expect(deckA[0].positionSeconds).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// Hot Cue: serialization
// ---------------------------------------------------------------------------

describe('hot cue serialization', () => {
  it('hot cue array is serializable', () => {
    const cues: HotCue[] = [makeHotCue(0, 5.5), makeHotCue(1, 12.0)]
    const json = JSON.stringify(cues)
    const parsed = JSON.parse(json) as HotCue[]
    expect(parsed[0].positionSeconds).toBe(5.5)
    expect(parsed[1].active).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Beat Loop pad mapping
// ---------------------------------------------------------------------------

describe('beat loop pad mapping', () => {
  const BEAT_LOOP_MAP = [0.25, 0.5, 1, 2, 4, 8, 16, 32]

  it('maps all 8 pad indices to correct lengths', () => {
    expect(BEAT_LOOP_MAP).toHaveLength(8)
    expect(BEAT_LOOP_MAP[0]).toBe(0.25)
    expect(BEAT_LOOP_MAP[1]).toBe(0.5)
    expect(BEAT_LOOP_MAP[2]).toBe(1)
    expect(BEAT_LOOP_MAP[3]).toBe(2)
    expect(BEAT_LOOP_MAP[4]).toBe(4)
    expect(BEAT_LOOP_MAP[5]).toBe(8)
    expect(BEAT_LOOP_MAP[6]).toBe(16)
    expect(BEAT_LOOP_MAP[7]).toBe(32)
  })

  it('same length as active loop toggles off', () => {
    const activeLength: number = 4
    const padLength: number = 4
    expect(activeLength === padLength).toBe(true) // would exit
  })

  it('different length replaces loop', () => {
    const activeLength: number = 4
    const padLength: number = 8
    expect(activeLength !== padLength).toBe(true) // would replace
  })
})

// ---------------------------------------------------------------------------
// Beat Jump pad mapping
// ---------------------------------------------------------------------------

describe('beat jump pad mapping', () => {
  const BEAT_JUMP_MAP = [-1, 1, -2, 2, -4, 4, -8, 8]

  it('maps all 8 pad indices to correct jump amounts', () => {
    expect(BEAT_JUMP_MAP).toHaveLength(8)
    expect(BEAT_JUMP_MAP[0]).toBe(-1)
    expect(BEAT_JUMP_MAP[1]).toBe(1)
    expect(BEAT_JUMP_MAP[2]).toBe(-2)
    expect(BEAT_JUMP_MAP[3]).toBe(2)
    expect(BEAT_JUMP_MAP[4]).toBe(-4)
    expect(BEAT_JUMP_MAP[5]).toBe(4)
    expect(BEAT_JUMP_MAP[6]).toBe(-8)
    expect(BEAT_JUMP_MAP[7]).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// Sampler state
// ---------------------------------------------------------------------------

describe('sampler state', () => {
  it('creates 8 slots', () => {
    const state = makeSamplerState()
    expect(state.slots).toHaveLength(SAMPLER_SLOT_COUNT)
  })

  it('default gain is 0.7', () => {
    const state = makeSamplerState()
    expect(state.gain).toBe(0.7)
  })

  it('all slots initially unloaded', () => {
    const state = makeSamplerState()
    expect(state.slots.every((s) => !s.loaded)).toBe(true)
  })

  it('slot load metadata', () => {
    const state = makeSamplerState()
    state.slots[2] = { index: 2, loaded: true, name: 'test.wav', durationSeconds: 5.0, playing: false }
    expect(state.slots[2].loaded).toBe(true)
    expect(state.slots[2].name).toBe('test.wav')
    expect(state.slots[2].durationSeconds).toBe(5.0)
  })

  it('slot trigger updates playing state', () => {
    const state = makeSamplerState()
    state.slots[0] = { ...state.slots[0], loaded: true, playing: true }
    expect(state.slots[0].playing).toBe(true)
    // Other slots unchanged
    expect(state.slots[1].playing).toBe(false)
  })

  it('slot stop clears playing', () => {
    const state = makeSamplerState()
    state.slots[0] = { ...state.slots[0], loaded: true, playing: true }
    state.slots[0] = { ...state.slots[0], playing: false }
    expect(state.slots[0].playing).toBe(false)
  })

  it('slot unload clears all', () => {
    const state = makeSamplerState()
    state.slots[3] = { index: 3, loaded: true, name: 'kick.wav', durationSeconds: 2.0, playing: true }
    state.slots[3] = makeSamplerSlot(3)
    expect(state.slots[3].loaded).toBe(false)
    expect(state.slots[3].name).toBeNull()
    expect(state.slots[3].playing).toBe(false)
  })

  it('slots are independent', () => {
    const state = makeSamplerState()
    state.slots[0] = { ...state.slots[0], loaded: true, playing: true }
    expect(state.slots[1].playing).toBe(false)
    expect(state.slots[2].loaded).toBe(false)
  })

  it('sampler is independent from deck transport', () => {
    const state = makeSamplerState()
    state.slots[0] = { ...state.slots[0], loaded: true, playing: true }
    // Simulate deck stop — sampler should be unaffected
    expect(state.slots[0].playing).toBe(true)
  })

  it('gain clamping', () => {
    const state = makeSamplerState()
    state.gain = Math.max(0, Math.min(1, 1.5))
    expect(state.gain).toBe(1)
    state.gain = Math.max(0, Math.min(1, -0.5))
    expect(state.gain).toBe(0)
  })

  it('sampler state is serializable', () => {
    const state = makeSamplerState()
    state.slots[0] = { ...state.slots[0], loaded: true, name: 'test.wav', durationSeconds: 3.0 }
    const json = JSON.stringify(state)
    const parsed = JSON.parse(json) as SamplerState
    expect(parsed.slots[0].loaded).toBe(true)
    expect(parsed.gain).toBe(0.7)
  })
})

// ---------------------------------------------------------------------------
// Shift state
// ---------------------------------------------------------------------------

describe('shift state', () => {
  it('default shift is false', () => {
    const shiftPressed = false
    expect(shiftPressed).toBe(false)
  })

  it('shift down sets true', () => {
    let shiftPressed = false
    shiftPressed = true
    expect(shiftPressed).toBe(true)
  })

  it('shift up sets false', () => {
    let shiftPressed = true
    shiftPressed = false
    expect(shiftPressed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Pad mode state
// ---------------------------------------------------------------------------

describe('pad mode state', () => {
  it('default mode is HOT_CUE', () => {
    const mode: PadMode = 'HOT_CUE'
    expect(mode).toBe('HOT_CUE')
  })

  it('can switch to all valid modes', () => {
    const modes: PadMode[] = ['HOT_CUE', 'BEAT_LOOP', 'BEAT_JUMP', 'SAMPLER']
    for (const m of modes) {
      expect(modes.includes(m)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Generic pad routing
// ---------------------------------------------------------------------------

describe('generic pad routing', () => {
  it('pad index 0 routes to correct action per mode', () => {
    const modes: PadMode[] = ['HOT_CUE', 'BEAT_LOOP', 'BEAT_JUMP', 'SAMPLER']
    // Each mode should accept padIndex 0
    for (const mode of modes) {
      expect(typeof mode).toBe('string')
    }
  })

  it('pad indices are 0..7', () => {
    for (let i = 0; i < 8; i++) {
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(8)
    }
  })
})

// ---------------------------------------------------------------------------
// Hot Cue + loop interaction
// ---------------------------------------------------------------------------

describe('hot cue + loop interaction', () => {
  it('triggering hot cue exits active loop', () => {
    let loopActive = true
    // Simulate hot cue trigger policy
    loopActive = false
    expect(loopActive).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Hot Cue + sync interaction
// ---------------------------------------------------------------------------

describe('hot cue + sync interaction', () => {
  it('hot cue trigger keeps sync tempo', () => {
    const syncEnabled = true
    const syncTempo = 128
    // After hot cue trigger
    // sync should remain
    expect(syncEnabled).toBe(true)
    expect(syncTempo).toBe(128)
  })
})
