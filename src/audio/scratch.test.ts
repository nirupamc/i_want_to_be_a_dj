import { describe, it, expect } from 'vitest'
import {
  scratchDeltaToSeconds,
  scratchVelocityToRate,
  clampScratchPosition,
  SCRATCH_SECONDS_PER_RADIAN,
  SCRATCH_MIN_DELTA,
  SCRATCH_RATE_MIN,
  SCRATCH_RATE_MAX,
} from './scratchMath'
import { AudioEngineImpl } from '../audio'
import { DeckEngine } from '../audio/DeckEngine'

// ---------------------------------------------------------------------------
// Scratch Math Tests
// ---------------------------------------------------------------------------
describe('scratchMath', () => {
  describe('scratchDeltaToSeconds', () => {
    it('positive delta → positive seconds (forward)', () => {
      expect(scratchDeltaToSeconds(1.0)).toBeCloseTo(SCRATCH_SECONDS_PER_RADIAN, 5)
    })

    it('negative delta → negative seconds (backward)', () => {
      expect(scratchDeltaToSeconds(-1.0)).toBeCloseTo(-SCRATCH_SECONDS_PER_RADIAN, 5)
    })

    it('zero delta → zero seconds', () => {
      expect(scratchDeltaToSeconds(0)).toBe(0)
    })

    it('full rotation (2π) scrubs ~0.94 seconds', () => {
      const result = scratchDeltaToSeconds(Math.PI * 2)
      expect(result).toBeCloseTo(SCRATCH_SECONDS_PER_RADIAN * Math.PI * 2, 2)
    })
  })

  describe('scratchVelocityToRate', () => {
    it('slow velocity → minimum rate', () => {
      expect(scratchVelocityToRate(0.0001)).toBeCloseTo(SCRATCH_RATE_MIN, 3)
    })

    it('fast velocity → maximum rate', () => {
      expect(scratchVelocityToRate(1.0)).toBeCloseTo(SCRATCH_RATE_MAX, 3)
    })

    it('mid velocity → interpolated rate', () => {
      const mid = scratchVelocityToRate(0.25)
      expect(mid).toBeGreaterThan(SCRATCH_RATE_MIN)
      expect(mid).toBeLessThan(SCRATCH_RATE_MAX)
    })

    it('negative velocity uses absolute value', () => {
      const pos = scratchVelocityToRate(0.3)
      const neg = scratchVelocityToRate(-0.3)
      expect(pos).toBeCloseTo(neg, 5)
    })

    it('always returns positive rate', () => {
      expect(scratchVelocityToRate(0)).toBeGreaterThanOrEqual(SCRATCH_RATE_MIN)
      expect(scratchVelocityToRate(100)).toBeGreaterThanOrEqual(SCRATCH_RATE_MIN)
    })
  })

  describe('clampScratchPosition', () => {
    it('clamps to 0', () => {
      expect(clampScratchPosition(-5, 10)).toBe(0)
    })

    it('clamps to duration', () => {
      expect(clampScratchPosition(15, 10)).toBe(10)
    })

    it('passes through valid position', () => {
      expect(clampScratchPosition(5, 10)).toBe(5)
    })

    it('handles zero duration', () => {
      expect(clampScratchPosition(5, 0)).toBe(0)
    })

    it('handles boundary exactly', () => {
      expect(clampScratchPosition(0, 10)).toBe(0)
      expect(clampScratchPosition(10, 10)).toBe(10)
    })
  })
})

// ---------------------------------------------------------------------------
// DeckEngine Scratch Tests
// ---------------------------------------------------------------------------
describe('DeckEngine scratch lifecycle', () => {
  it('startScratch captures position and returns it', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    const pos = deck.startScratch()
    expect(pos).toBeCloseTo(5, 0)
    expect(deck.isScratching).toBe(true)
  })

  it('startScratch while paused does not affect isPlaying', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.startScratch()
    expect(deck.isPlaying).toBe(false)
  })

  it('startScratch while playing pauses playback', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.play()
    expect(deck.isPlaying).toBe(true)
    deck.startScratch()
    expect(deck.isPlaying).toBe(false)
    expect(deck.isScratching).toBe(true)
  })

  it('moveScratch updates position forward', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    // Move forward: 1 radian
    deck.moveScratch(1.0, 0.1)
    expect(deck.currentTime).toBeGreaterThan(5)
  })

  it('moveScratch updates position backward', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    // Move backward: -1 radian
    deck.moveScratch(-1.0, 0.1)
    expect(deck.currentTime).toBeLessThan(5)
  })

  it('moveScratch clamps at duration', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(9.9)
    deck.startScratch()
    // Move forward a lot
    deck.moveScratch(10.0, 0.5)
    expect(deck.currentTime).toBeLessThanOrEqual(10)
  })

  it('moveScratch clamps at zero', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(0.1)
    deck.startScratch()
    // Move backward a lot
    deck.moveScratch(-10.0, 0.5)
    expect(deck.currentTime).toBeGreaterThanOrEqual(0)
  })

  it('moveScratch ignores tiny deltas (dead zone)', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    const posBefore = deck.currentTime
    // Tiny delta below threshold
    deck.moveScratch(SCRATCH_MIN_DELTA * 0.5, 0.001)
    expect(deck.currentTime).toBeCloseTo(posBefore, 5)
  })

  it('endScratch returns final position', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    deck.moveScratch(1.0, 0.1)
    const finalPos = deck.endScratch()
    expect(finalPos).toBeCloseTo(deck.currentTime, 0)
    expect(deck.isScratching).toBe(false)
  })

  it('endScratch persists position for resume', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    deck.moveScratch(1.0, 0.1)
    const finalPos = deck.endScratch()
    // Position should be accessible at the scratched position
    expect(deck.currentTime).toBeCloseTo(finalPos, 0)
  })

  it('forceStopScratch resets position to 0', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    deck.moveScratch(1.0, 0.1)
    deck.forceStopScratch()
    expect(deck.isScratching).toBe(false)
    expect(deck.currentTime).toBe(0)
  })

  it('double startScratch is idempotent', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    deck.startScratch() // should not throw
    expect(deck.isScratching).toBe(true)
  })

  it('endScratch when not scratching is no-op', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    const pos = deck.endScratch()
    expect(pos).toBe(0)
    expect(deck.isScratching).toBe(false)
  })

  it('moveScratch when not scratching is no-op', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.moveScratch(1.0, 0.1)
    expect(deck.currentTime).toBeCloseTo(5, 0)
  })
})

describe('DeckEngine scratch source lifecycle', () => {
  it('scratch creates and stops preview source', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    deck.moveScratch(1.0, 0.1) // creates preview source
    deck.endScratch() // stops preview source
    expect(deck.isScratching).toBe(false)
  })

  it('multiple moves do not leak sources', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    // Multiple moves — each should replace previous preview
    for (let i = 0; i < 10; i++) {
      deck.moveScratch(0.1 * (i % 2 === 0 ? 1 : -1), 0.05)
    }
    deck.endScratch()
    expect(deck.isScratching).toBe(false)
  })

  it('forceStopScratch cleans up source', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    deck.moveScratch(1.0, 0.1)
    deck.forceStopScratch()
    expect(deck.isScratching).toBe(false)
    expect(deck.currentTime).toBe(0)
  })
})

describe('DeckEngine scratch interaction with transport', () => {
  it('play is ignored during scratch', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.startScratch()
    deck.play() // should be ignored
    expect(deck.isPlaying).toBe(false)
    expect(deck.isScratching).toBe(true)
  })

  it('seek ends scratch first', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.startScratch()
    deck.moveScratch(1.0, 0.1)
    deck.seek(3)
    expect(deck.isScratching).toBe(false)
    expect(deck.currentTime).toBeCloseTo(3, 0)
  })

  it('applyTempo is ignored during scratch', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.setPlaybackRate(1.0)
    deck.startScratch()
    deck.applyTempo(1.5) // should be ignored
    expect(deck.playbackRate).toBe(1.0) // unchanged
  })

  it('startNudge is ignored during scratch', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.startScratch()
    deck.startNudge('forward') // should be ignored
    expect(deck.nudging).toBeNull()
  })

  it('resumeAfterScratch resumes playback', () => {
    const audio = new AudioEngineImpl()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    deck.seek(5)
    deck.play()
    deck.startScratch()
    deck.moveScratch(1.0, 0.1)
    deck.endScratch()
    deck.resumeAfterScratch()
    expect(deck.isPlaying).toBe(true)
  })
})

describe('DeckEngine deck isolation', () => {
  it('scratch A does not affect B', () => {
    const audio = new AudioEngineImpl()
    const deck0 = new DeckEngine({ audio, deck: 0 })
    const deck1 = new DeckEngine({ audio, deck: 1 })
    deck0.load({ duration: 10 } as unknown as AudioBuffer)
    deck1.load({ duration: 20 } as unknown as AudioBuffer)
    deck0.seek(5)
    deck1.seek(10)
    deck0.startScratch()
    deck0.moveScratch(1.0, 0.1)
    expect(deck0.isScratching).toBe(true)
    expect(deck1.isScratching).toBe(false)
    expect(deck0.currentTime).toBeGreaterThan(5)
    expect(deck1.currentTime).toBeCloseTo(10, 0)
  })
})

// ---------------------------------------------------------------------------
// DJEngine Scratch Action Routing
// ---------------------------------------------------------------------------
describe('DJEngine scratch actions', () => {
  it('SCRATCH_START sets scratch.active and captures wasPlaying', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    const sc = engine.getState().decks[0].scratch
    expect(sc.active).toBe(true)
    expect(sc.wasPlayingBeforeScratch).toBe(true)
  })

  it('SCRATCH_START captures wasPlaying=false when paused', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    const sc = engine.getState().decks[0].scratch
    expect(sc.active).toBe(true)
    expect(sc.wasPlayingBeforeScratch).toBe(false)
  })

  it('SCRATCH_MOVE updates position forward', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_MOVE', deck: 0, deltaRadians: 1.0, velocity: 0.1, direction: 'forward' })
    const sc = engine.getState().decks[0].scratch
    expect(sc.direction).toBe('forward')
    expect(sc.currentPosition).toBeGreaterThan(5)
  })

  it('SCRATCH_MOVE updates position backward', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_MOVE', deck: 0, deltaRadians: -1.0, velocity: 0.1, direction: 'backward' })
    const sc = engine.getState().decks[0].scratch
    expect(sc.direction).toBe('backward')
    expect(sc.currentPosition).toBeLessThan(5)
  })

  it('SCRATCH_END clears scratch state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_MOVE', deck: 0, deltaRadians: 1.0, velocity: 0.1, direction: 'forward' })
    engine.dispatch({ type: 'SCRATCH_END', deck: 0 })
    const sc = engine.getState().decks[0].scratch
    expect(sc.active).toBe(false)
    expect(sc.direction).toBeNull()
  })

  it('SCRATCH_END resumes playback if was playing', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_END', deck: 0 })
    expect(engine.getState().decks[0].isPlaying).toBe(true)
  })

  it('SCRATCH_END stays paused if was paused', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_END', deck: 0 })
    expect(engine.getState().decks[0].isPlaying).toBe(false)
  })

  it('STOP during scratch ends scratch and resets', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_MOVE', deck: 0, deltaRadians: 1.0, velocity: 0.1, direction: 'forward' })
    engine.dispatch({ type: 'STOP', deck: 0 })
    const sc = engine.getState().decks[0].scratch
    expect(sc.active).toBe(false)
    expect(engine.getState().decks[0].position).toBe(0)
  })

  it('PLAY during scratch ends scratch first, then plays', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    expect(engine.getState().decks[0].scratch.active).toBe(false)
    expect(engine.getState().decks[0].isPlaying).toBe(true)
  })

  it('PAUSE during scratch ends scratch first, then pauses', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'PAUSE', deck: 0 })
    expect(engine.getState().decks[0].scratch.active).toBe(false)
    expect(engine.getState().decks[0].isPlaying).toBe(false)
  })

  it('SEEK during scratch ends scratch first', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 3 })
    expect(engine.getState().decks[0].scratch.active).toBe(false)
    expect(engine.getState().decks[0].position).toBeCloseTo(3, 0)
  })

  it('scratch clears nudge on start', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'NUDGE_FORWARD_START', deck: 0 })
    expect(engine.getState().decks[0].nudging).toBe('forward')
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    expect(engine.getState().decks[0].nudging).toBeNull()
  })

  it('nudge is ignored during scratch', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'NUDGE_FORWARD_START', deck: 0 })
    expect(engine.getState().decks[0].nudging).toBeNull()
  })

  it('serializable state: scratch state is plain JSON', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_MOVE', deck: 0, deltaRadians: 1.0, velocity: 0.1, direction: 'forward' })

    const state = engine.getState()
    const json = JSON.stringify(state)
    const parsed = JSON.parse(json)

    expect(parsed.decks[0].scratch.active).toBe(true)
    expect(parsed.decks[0].scratch.wasPlayingBeforeScratch).toBe(false)
    expect(parsed.decks[0].scratch.direction).toBe('forward')
  })

  it('deck isolation: scratch A does not affect B', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'LOAD_TRACK', deck: 1, track: { id: 't2', name: 'test2', buffer: { duration: 20 } as unknown as AudioBuffer, duration: 20 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'SCRATCH_START', deck: 0 })
    engine.dispatch({ type: 'SCRATCH_MOVE', deck: 0, deltaRadians: 1.0, velocity: 0.1, direction: 'forward' })
    expect(engine.getState().decks[0].scratch.active).toBe(true)
    expect(engine.getState().decks[1].scratch.active).toBe(false)
  })

  it('JOG_PLATTER_START triggers scratch start', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    expect(engine.getState().decks[0].scratch.active).toBe(true)
    expect(engine.getState().decks[0].jog.scratchIntent).toBe(true)
  })

  it('JOG_PLATTER_MOVE triggers scratch move', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'SEEK', deck: 0, seconds: 5 })
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    engine.dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians: 1.0, velocity: 0.1, direction: 'forward' })
    expect(engine.getState().decks[0].scratch.direction).toBe('forward')
    expect(engine.getState().decks[0].scratch.currentPosition).toBeGreaterThan(5)
  })

  it('JOG_PLATTER_END triggers scratch end', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    engine.dispatch({ type: 'JOG_PLATTER_END', deck: 0 })
    expect(engine.getState().decks[0].scratch.active).toBe(false)
    expect(engine.getState().decks[0].jog.scratchIntent).toBe(false)
  })

  it('default scratch state values', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const sc = engine.getState().decks[0].scratch
    expect(sc.active).toBe(false)
    expect(sc.wasPlayingBeforeScratch).toBe(false)
    expect(sc.currentPosition).toBe(0)
    expect(sc.velocity).toBe(0)
    expect(sc.direction).toBeNull()
  })
})
