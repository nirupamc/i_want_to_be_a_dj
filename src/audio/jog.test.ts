import { describe, it, expect } from 'vitest'
import {
  normalizeAngleDelta,
  angleDelta,
  pointToAngle,
  angularVelocity,
  smoothVelocity,
  clampVelocity,
  deltaDirection,
  JOG_DEAD_ZONE,
} from './jogMath'

// ---------------------------------------------------------------------------
// Angle math
// ---------------------------------------------------------------------------
describe('normalizeAngleDelta', () => {
  it('normal clockwise delta (less than π)', () => {
    expect(normalizeAngleDelta(1.0)).toBeCloseTo(1.0, 5)
  })

  it('normal counterclockwise delta (less than π)', () => {
    expect(normalizeAngleDelta(-1.0)).toBeCloseTo(-1.0, 5)
  })

  it('+π / -π wraparound (just past +π wraps to negative)', () => {
    const result = normalizeAngleDelta(Math.PI + 0.1)
    expect(result).toBeCloseTo(-(Math.PI - 0.1), 5)
  })

  it('-π / +π wraparound (just past -π wraps to positive)', () => {
    const result = normalizeAngleDelta(-(Math.PI + 0.1))
    expect(result).toBeCloseTo(Math.PI - 0.1, 5)
  })

  it('zero movement', () => {
    expect(normalizeAngleDelta(0)).toBe(0)
  })

  it('exactly +π stays positive', () => {
    expect(normalizeAngleDelta(Math.PI)).toBeCloseTo(Math.PI, 5)
  })

  it('exactly -π stays negative', () => {
    expect(normalizeAngleDelta(-Math.PI)).toBeCloseTo(-Math.PI, 5)
  })

  it('large positive wraps correctly', () => {
    // 2π + 0.1 wraps to 0.1
    const result = normalizeAngleDelta(Math.PI * 2 + 0.1)
    expect(result).toBeCloseTo(0.1, 5)
  })

  it('large negative wraps correctly', () => {
    // -2π - 0.1 wraps to -0.1
    const result = normalizeAngleDelta(-Math.PI * 2 - 0.1)
    expect(result).toBeCloseTo(-0.1, 5)
  })
})

describe('angleDelta', () => {
  it('small forward delta', () => {
    const delta = angleDelta(0, 0.5)
    expect(delta).toBeCloseTo(0.5, 5)
  })

  it('small backward delta', () => {
    const delta = angleDelta(0.5, 0)
    expect(delta).toBeCloseTo(-0.5, 5)
  })

  it('wraparound from +π to -π (crosses boundary)', () => {
    const delta = angleDelta(Math.PI - 0.1, -(Math.PI - 0.1))
    // Should go forward (shortest path): ~0.2 radians
    expect(delta).toBeCloseTo(0.2, 5)
  })

  it('wraparound from -π to +π (crosses boundary)', () => {
    const delta = angleDelta(-(Math.PI - 0.1), Math.PI - 0.1)
    // Should go backward (shortest path): ~-0.2 radians
    expect(delta).toBeCloseTo(-0.2, 5)
  })
})

describe('pointToAngle', () => {
  it('right (3 oclock) = 0', () => {
    expect(pointToAngle(100, 50, 50, 50)).toBeCloseTo(0, 5)
  })

  it('down (6 oclock) = +π/2', () => {
    expect(pointToAngle(50, 100, 50, 50)).toBeCloseTo(Math.PI / 2, 5)
  })

  it('left (9 oclock) = ±π', () => {
    const angle = pointToAngle(0, 50, 50, 50)
    expect(Math.abs(angle)).toBeCloseTo(Math.PI, 5)
  })

  it('up (12 oclock) = -π/2', () => {
    expect(pointToAngle(50, 0, 50, 50)).toBeCloseTo(-Math.PI / 2, 5)
  })
})

// ---------------------------------------------------------------------------
// Velocity estimation
// ---------------------------------------------------------------------------
describe('angularVelocity', () => {
  it('positive velocity (forward)', () => {
    const v = angularVelocity(1.0, 16) // 1 rad in 16ms
    expect(v).toBeCloseTo(0.0625, 5)
  })

  it('negative velocity (backward)', () => {
    const v = angularVelocity(-1.0, 16)
    expect(v).toBeCloseTo(-0.0625, 5)
  })

  it('zero elapsed time returns 0', () => {
    expect(angularVelocity(1.0, 0)).toBe(0)
  })

  it('negative elapsed time returns 0', () => {
    expect(angularVelocity(1.0, -10)).toBe(0)
  })

  it('Infinity elapsed returns 0', () => {
    expect(angularVelocity(1.0, Infinity)).toBe(0)
  })
})

describe('smoothVelocity', () => {
  it('with alpha=1, returns new velocity (no smoothing)', () => {
    expect(smoothVelocity(2.0, 0.5, 1.0)).toBeCloseTo(2.0, 5)
  })

  it('with alpha=0, returns previous (complete smoothing)', () => {
    expect(smoothVelocity(2.0, 0.5, 0.0)).toBeCloseTo(0.5, 5)
  })

  it('with default alpha', () => {
    const result = smoothVelocity(1.0, 0.0)
    expect(result).toBeCloseTo(0.3, 5) // 0.3 * 1.0 + 0.7 * 0.0
  })
})

describe('clampVelocity', () => {
  it('clamps large positive', () => {
    expect(clampVelocity(100)).toBe(2.0)
  })

  it('clamps large negative', () => {
    expect(clampVelocity(-100)).toBe(-2.0)
  })

  it('passes through normal values', () => {
    expect(clampVelocity(0.5)).toBe(0.5)
    expect(clampVelocity(-0.5)).toBe(-0.5)
  })

  it('custom max', () => {
    expect(clampVelocity(5, 3)).toBe(3)
    expect(clampVelocity(-5, 3)).toBe(-3)
  })
})

describe('deltaDirection', () => {
  it('positive delta → forward', () => {
    expect(deltaDirection(0.1)).toBe('forward')
  })

  it('negative delta → backward', () => {
    expect(deltaDirection(-0.1)).toBe('backward')
  })

  it('tiny delta below dead zone → null', () => {
    expect(deltaDirection(JOG_DEAD_ZONE * 0.5)).toBeNull()
    expect(deltaDirection(-JOG_DEAD_ZONE * 0.5)).toBeNull()
  })

  it('delta at exact dead zone → forward/backward', () => {
    expect(deltaDirection(JOG_DEAD_ZONE)).toBe('forward')
    expect(deltaDirection(-JOG_DEAD_ZONE)).toBe('backward')
  })
})

// ---------------------------------------------------------------------------
// DJEngine jog action routing
// ---------------------------------------------------------------------------
describe('DJEngine jog actions', () => {
  it('JOG_PLATTER_START sets scratch intent', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    const jog = engine.getState().decks[0].jog
    expect(jog.touchingPlatter).toBe(true)
    expect(jog.scratchIntent).toBe(true)
    expect(jog.moving).toBe(true)
  })

  it('JOG_PLATTER_MOVE updates jog state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    engine.dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians: 0.5, velocity: 0.03, direction: 'forward' })
    const jog = engine.getState().decks[0].jog
    expect(jog.direction).toBe('forward')
    expect(jog.deltaRadians).toBeCloseTo(0.5, 5)
    expect(jog.velocity).toBeCloseTo(0.03, 5)
    expect(jog.accumulatedRotation).toBeCloseTo(0.5, 5)
  })

  it('JOG_PLATTER_END clears scratch intent', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    engine.dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians: 0.5, velocity: 0.03, direction: 'forward' })
    engine.dispatch({ type: 'JOG_PLATTER_END', deck: 0 })
    const jog = engine.getState().decks[0].jog
    expect(jog.touchingPlatter).toBe(false)
    expect(jog.scratchIntent).toBe(false)
    expect(jog.moving).toBe(false)
    expect(jog.direction).toBeNull()
  })

  it('JOG_RIM_START sets rim touching', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'JOG_RIM_START', deck: 0 })
    const jog = engine.getState().decks[0].jog
    expect(jog.touchingRim).toBe(true)
    expect(jog.moving).toBe(true)
  })

  it('JOG_RIM_MOVE with forward direction starts nudge', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_START', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_MOVE', deck: 0, deltaRadians: 0.1, velocity: 0.01, direction: 'forward' })
    expect(engine.getState().decks[0].nudging).toBe('forward')
  })

  it('JOG_RIM_MOVE with backward direction starts backward nudge', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_START', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_MOVE', deck: 0, deltaRadians: -0.1, velocity: -0.01, direction: 'backward' })
    expect(engine.getState().decks[0].nudging).toBe('backward')
  })

  it('JOG_RIM_END stops nudge', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_START', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_MOVE', deck: 0, deltaRadians: 0.1, velocity: 0.01, direction: 'forward' })
    expect(engine.getState().decks[0].nudging).toBe('forward')
    engine.dispatch({ type: 'JOG_RIM_END', deck: 0 })
    expect(engine.getState().decks[0].nudging).toBeNull()
    expect(engine.getState().decks[0].jog.touchingRim).toBe(false)
  })

  it('deck isolation: jog A does not affect jog B', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    engine.dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians: 0.5, velocity: 0.03, direction: 'forward' })
    const jog0 = engine.getState().decks[0].jog
    const jog1 = engine.getState().decks[1].jog
    expect(jog0.touchingPlatter).toBe(true)
    expect(jog0.scratchIntent).toBe(true)
    expect(jog1.touchingPlatter).toBe(false)
    expect(jog1.scratchIntent).toBe(false)
  })

  it('deck isolation: rim A nudge does not affect deck B', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'LOAD_TRACK', deck: 1, track: { id: 't2', name: 'test2', buffer: { duration: 20 } as unknown as AudioBuffer, duration: 20 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'PLAY', deck: 1 })
    engine.dispatch({ type: 'JOG_RIM_START', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_MOVE', deck: 0, deltaRadians: 0.1, velocity: 0.01, direction: 'forward' })
    expect(engine.getState().decks[0].nudging).toBe('forward')
    expect(engine.getState().decks[1].nudging).toBeNull()
  })

  it('serializable state: jog state is plain JSON', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    engine.dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians: 0.5, velocity: 0.03, direction: 'forward' })

    const state = engine.getState()
    const json = JSON.stringify(state)
    const parsed = JSON.parse(json)

    expect(parsed.decks[0].jog.touchingPlatter).toBe(true)
    expect(parsed.decks[0].jog.scratchIntent).toBe(true)
    expect(parsed.decks[0].jog.direction).toBe('forward')
    expect(parsed.decks[0].jog.deltaRadians).toBeCloseTo(0.5, 5)
  })

  it('default jog state values', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const jog = engine.getState().decks[0].jog
    expect(jog.touchingPlatter).toBe(false)
    expect(jog.touchingRim).toBe(false)
    expect(jog.moving).toBe(false)
    expect(jog.direction).toBeNull()
    expect(jog.deltaRadians).toBe(0)
    expect(jog.velocity).toBe(0)
    expect(jog.scratchIntent).toBe(false)
    expect(jog.accumulatedRotation).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Integration: jog cleanup
// ---------------------------------------------------------------------------
describe('Jog cleanup behavior', () => {
  it('platter start then end returns to clean state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    engine.dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians: 1.0, velocity: 0.05, direction: 'forward' })
    engine.dispatch({ type: 'JOG_PLATTER_END', deck: 0 })
    const jog = engine.getState().decks[0].jog
    expect(jog.touchingPlatter).toBe(false)
    expect(jog.scratchIntent).toBe(false)
    expect(jog.moving).toBe(false)
    expect(jog.velocity).toBe(0)
    expect(jog.deltaRadians).toBe(0)
  })

  it('rim start then end clears nudge', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'LOAD_TRACK', deck: 0, track: { id: 't1', name: 'test', buffer: { duration: 10 } as unknown as AudioBuffer, duration: 10 } })
    engine.dispatch({ type: 'PLAY', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_START', deck: 0 })
    engine.dispatch({ type: 'JOG_RIM_MOVE', deck: 0, deltaRadians: 0.1, velocity: 0.01, direction: 'forward' })
    expect(engine.getState().decks[0].nudging).toBe('forward')
    engine.dispatch({ type: 'JOG_RIM_END', deck: 0 })
    expect(engine.getState().decks[0].nudging).toBeNull()
  })

  it('accumulated rotation persists across moves', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
    engine.dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians: 0.5, velocity: 0.03, direction: 'forward' })
    engine.dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians: 0.3, velocity: 0.02, direction: 'forward' })
    expect(engine.getState().decks[0].jog.accumulatedRotation).toBeCloseTo(0.8, 5)
    engine.dispatch({ type: 'JOG_PLATTER_END', deck: 0 })
    // Accumulated rotation is NOT cleared on end (for visual continuity)
    expect(engine.getState().decks[0].jog.accumulatedRotation).toBeCloseTo(0.8, 5)
  })
})
