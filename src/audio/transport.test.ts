import { describe, it, expect } from 'vitest'
import { AudioEngineImpl } from '../audio'
import { DeckEngine } from '../audio/DeckEngine'

// ---------------------------------------------------------------------------
// DeckEngine Transport Tests
// ---------------------------------------------------------------------------
describe('DeckEngine play/pause lifecycle', () => {
  it('play starts correctly', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.play()
    expect(deck.isPlaying).toBe(true)
  })

  it('pause preserves logical position', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.play()
    deck.pause()
    expect(deck.isPlaying).toBe(false)
    // Position should be preserved (not reset to 0)
    expect(deck.currentTime).toBeGreaterThanOrEqual(0)
  })

  it('resume continues from paused position', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(3)
    deck.play()
    expect(deck.currentTime).toBeCloseTo(3, 0)
    deck.pause()
    expect(deck.currentTime).toBeCloseTo(3, 0)
    deck.play()
    expect(deck.currentTime).toBeGreaterThanOrEqual(3)
  })

  it('stop resets position to 0', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.play()
    deck.stop()
    expect(deck.currentTime).toBe(0)
    expect(deck.isPlaying).toBe(false)
  })

  it('play without buffer is no-op', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.play()
    expect(deck.isPlaying).toBe(false)
  })

  it('double play is no-op', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.play()
    deck.play() // should not throw
    expect(deck.isPlaying).toBe(true)
  })

  it('play after stop restarts from 0', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.play()
    deck.stop()
    deck.play()
    expect(deck.currentTime).toBeCloseTo(0, 0)
    expect(deck.isPlaying).toBe(true)
  })
})

describe('DeckEngine seek', () => {
  it('paused seek', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    expect(deck.currentTime).toBeCloseTo(5, 0)
  })

  it('playing seek', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.play()
    deck.seek(7)
    expect(deck.currentTime).toBeCloseTo(7, 0)
  })

  it('clamping', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(100)
    expect(deck.currentTime).toBeLessThanOrEqual(10)
    deck.seek(-5)
    expect(deck.currentTime).toBeGreaterThanOrEqual(0)
  })

  it('rate preserved across seek', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.setPlaybackRate(1.2)
    deck.seek(5)
    deck.play()
    expect(deck.playbackRate).toBe(1.2)
  })
})

describe('DeckEngine cue', () => {
  it('setCue stores cue point', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.setCue(5)
    expect(deck.cue).toBeCloseTo(5, 0)
  })

  it('setCue clamps to duration', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.setCue(100)
    expect(deck.cue).toBe(10)
  })

  it('setCue clamps to 0', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.setCue(-5)
    expect(deck.cue).toBe(0)
  })

  it('cue resets on new track load', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.setCue(5)
    expect(deck.cue).toBe(5)
    deck.load({ duration: 20 } as unknown as AudioBuffer)
    expect(deck.cue).toBeNull()
  })
})

describe('DeckEngine nudge', () => {
  it('forward nudge is active', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.startNudge('forward')
    expect(deck.nudging).toBe('forward')
  })

  it('backward nudge is active', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.startNudge('backward')
    expect(deck.nudging).toBe('backward')
  })

  it('stopNudge clears nudge', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.startNudge('forward')
    deck.stopNudge()
    expect(deck.nudging).toBeNull()
  })

  it('double nudge start is idempotent', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.startNudge('forward')
    deck.startNudge('forward')
    expect(deck.nudging).toBe('forward')
  })

  it('nudge does not alter base playbackRate', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.setPlaybackRate(1.04)
    deck.startNudge('forward')
    // playbackRate (base) should still be 1.04
    expect(deck.playbackRate).toBe(1.04)
    deck.stopNudge()
    expect(deck.playbackRate).toBe(1.04)
  })
})

describe('DeckEngine applyTempo checkpoints position', () => {
  it('no rate change is no-op', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.setPlaybackRate(1.04)
    deck.play()
    // Apply same rate — should not throw or change anything
    deck.applyTempo(1.04)
    expect(deck.playbackRate).toBe(1.04)
  })

  it('rate changes while playing', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.play()
    deck.applyTempo(1.1) // +10%
    expect(deck.playbackRate).toBe(1.1)
    expect(deck.currentTime).toBeGreaterThanOrEqual(4.5) // ~5 seconds, no big jump
    expect(deck.currentTime).toBeLessThanOrEqual(5.5)
  })

  it('rate changes while paused', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.applyTempo(1.1)
    expect(deck.playbackRate).toBe(1.1)
    expect(deck.currentTime).toBeCloseTo(5, 0)
  })
})

describe('DeckEngine deck isolation', () => {
  it('deck 0 does not affect deck 1', () => {
    const audio = new AudioEngineImpl()
    const deck0 = new DeckEngine({ audio, deck: 0 })
    const deck1 = new DeckEngine({ audio, deck: 1 })
    deck0.load({ duration: 10 } as unknown as AudioBuffer)
    deck1.load({ duration: 20 } as unknown as AudioBuffer)
    deck0.setCue(3)
    deck1.setCue(7)
    expect(deck0.cue).toBe(3)
    expect(deck1.cue).toBe(7)
    deck0.play()
    expect(deck0.isPlaying).toBe(true)
    expect(deck1.isPlaying).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// DJEngine Integration Tests
// ---------------------------------------------------------------------------
describe('DJEngine M3 action routing', () => {
  it('SET_TEMPO updates tempoPercent and playbackRate', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 5 })
    const state = engine.getState()
    expect(state.decks[0].tempoPercent).toBe(5)
    expect(state.decks[0].playbackRate).toBeCloseTo(1.05, 3)
  })

  it('SET_TEMPO clamps to range', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    // Default range is ±10%
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 50 })
    expect(engine.getState().decks[0].tempoPercent).toBe(10)
  })

  it('SET_TEMPO negative', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: -5 })
    const state = engine.getState()
    expect(state.decks[0].tempoPercent).toBe(-5)
    expect(state.decks[0].playbackRate).toBeCloseTo(0.95, 3)
  })

  it('CYCLE_TEMPO_RANGE cycles through ranges', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const s = engine.getState().decks[0]
    expect(s.tempoRange).toBe(10) // default

    engine.dispatch({ type: 'CYCLE_TEMPO_RANGE', deck: 0 })
    expect(engine.getState().decks[0].tempoRange).toBe(16)

    engine.dispatch({ type: 'CYCLE_TEMPO_RANGE', deck: 0 })
    expect(engine.getState().decks[0].tempoRange).toBe(100)

    engine.dispatch({ type: 'CYCLE_TEMPO_RANGE', deck: 0 })
    expect(engine.getState().decks[0].tempoRange).toBe(6)

    engine.dispatch({ type: 'CYCLE_TEMPO_RANGE', deck: 0 })
    expect(engine.getState().decks[0].tempoRange).toBe(10) // back to start
  })

  it('CYCLE_TEMPO_RANGE clamps current tempo', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    // Cycle to ±16% range first
    engine.dispatch({ type: 'CYCLE_TEMPO_RANGE', deck: 0 }) // → ±16%
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 12 })
    expect(engine.getState().decks[0].tempoPercent).toBe(12)
    engine.dispatch({ type: 'CYCLE_TEMPO_RANGE', deck: 0 }) // → ±100%
    expect(engine.getState().decks[0].tempoPercent).toBe(12)
    engine.dispatch({ type: 'CYCLE_TEMPO_RANGE', deck: 0 }) // → ±6%, should clamp
    expect(engine.getState().decks[0].tempoPercent).toBe(6)
  })

  it('CUE_DOWN when paused sets cue point', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'CUE_DOWN', deck: 0 })
    expect(engine.getState().decks[0].cuePoint).toBeCloseTo(5, 0)
  })

  it('CUE_DOWN when playing returns to cue and pauses', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SET_CUE', deck: 0, seconds: 3 })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    expect(engine.getState().decks[0].isPlaying).toBe(true)
    engine.dispatch({ type: 'CUE_DOWN', deck: 0 })
    expect(engine.getState().decks[0].isPlaying).toBe(false)
    expect(engine.getState().decks[0].position).toBeCloseTo(3, 0)
  })

  it('CUE_DOWN with no cue when playing sets cue at current then pauses', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'CUE_DOWN', deck: 0 })
    expect(engine.getState().decks[0].isPlaying).toBe(false)
    expect(engine.getState().decks[0].cuePoint).not.toBeNull()
  })

  it('STOP does not delete cue', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SET_CUE', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'STOP', deck: 0 })
    expect(engine.getState().decks[0].cuePoint).toBeCloseTo(5, 0)
  })

  it('STOP resets position to 0', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'STOP', deck: 0 })
    expect(engine.getState().decks[0].position).toBe(0)
  })

  it('SET_ORIGINAL_BPM and effective BPM calculation', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_ORIGINAL_BPM', deck: 0, bpm: 128 })
    expect(engine.getState().decks[0].originalBpm).toBe(128)
    expect(engine.getState().decks[0].effectiveBpm).toBeCloseTo(128, 1)

    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 10 })
    // playbackRate = 1.10, effectiveBpm = 128 * 1.10 = 140.8
    expect(engine.getState().decks[0].effectiveBpm).toBeCloseTo(140.8, 1)
  })

  it('effective BPM null when BPM unknown', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    expect(engine.getState().decks[0].effectiveBpm).toBeNull()
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 5 })
    expect(engine.getState().decks[0].effectiveBpm).toBeNull()
  })

  it('NUDGE actions', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })

    engine.dispatch({ type: 'NUDGE_FORWARD_START', deck: 0 })
    expect(engine.getState().decks[0].nudging).toBe('forward')

    engine.dispatch({ type: 'NUDGE_END', deck: 0 })
    expect(engine.getState().decks[0].nudging).toBeNull()
  })

  it('nudge does not alter tempoPercent', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 5 })
    engine.dispatch({ type: 'NUDGE_FORWARD_START', deck: 0 })
    expect(engine.getState().decks[0].tempoPercent).toBe(5)
    engine.dispatch({ type: 'NUDGE_END', deck: 0 })
    expect(engine.getState().decks[0].tempoPercent).toBe(5)
  })

  it('deck isolation: tempo A ≠ tempo B', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 5 })
    engine.dispatch({ type: 'SET_TEMPO', deck: 1, percent: -3 })
    expect(engine.getState().decks[0].tempoPercent).toBe(5)
    expect(engine.getState().decks[1].tempoPercent).toBe(-3)
  })

  it('deck isolation: cue A ≠ cue B', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'LOAD_TRACK', deck: 1, track: { id: 't2', name: 'test2', buffer: { duration: 20 } as unknown as AudioBuffer, duration: 20 } })
    engine.dispatch({ type: 'SET_CUE', deck: 0, seconds: 3 })
    engine.dispatch({ type: 'SET_CUE', deck: 1, seconds: 8 })
    expect(engine.getState().decks[0].cuePoint).toBeCloseTo(3, 0)
    expect(engine.getState().decks[1].cuePoint).toBeCloseTo(8, 0)
  })

  it('serializable state: deck state is plain JSON', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 5 })
    engine.dispatch({ type: 'SET_ORIGINAL_BPM', deck: 0, bpm: 128 })
    engine.dispatch({ type: 'SET_CUE', deck: 0, seconds: 3 })

    const state = engine.getState()
    const json = JSON.stringify(state)
    const parsed = JSON.parse(json)

    expect(parsed.decks[0].tempoPercent).toBe(5)
    expect(parsed.decks[0].originalBpm).toBe(128)
    expect(parsed.decks[0].cuePoint).toBeCloseTo(3, 0)
    expect(parsed.decks[0].nudging).toBeNull()
  })

  it('default state values', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const state = engine.getState()
    for (const d of state.decks) {
      expect(d.tempoPercent).toBe(0)
      expect(d.tempoRange).toBe(10)
      expect(d.originalBpm).toBeNull()
      expect(d.effectiveBpm).toBeNull()
      expect(d.nudging).toBeNull()
      expect(d.cuePoint).toBeNull()
      expect(d.playbackRate).toBe(1.0)
    }
  })
})
