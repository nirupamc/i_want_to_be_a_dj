import { describe, it, expect } from 'vitest'
import type { BeatGrid } from './analysisTypes'
import type { LoopState, SyncState } from '../types'
import {
  canSync,
  calculateSyncRate,
  rateToTempoPercent,
  syncExceedsRange,
  calculatePhaseError,
  calculatePhaseAlignPosition,
  quantizeToBeat,
  createLoop,
  createAutoLoop,
  halveLoop,
  doubleLoop,
  isInsideLoop,
  wrapLoopPosition,
  calculateBeatJumpPosition,
  shiftLoopByBeats,
  createSyncState,
  createLoopState,
  resolveSourceBpm,
  LOOP_MIN_BEATS,
  LOOP_MAX_BEATS,
} from './beatEngine'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeGrid(bpm: number, duration: number, anchor = 0): BeatGrid {
  const interval = 60 / bpm
  const beats: number[] = []
  let t = anchor
  while (t >= 0) { beats.push(Math.max(0, Math.min(duration, t))); t -= interval }
  beats.reverse()
  t = anchor + interval
  while (t <= duration + interval * 0.01) { beats.push(Math.max(0, Math.min(duration, t))); t += interval }
  const unique = [...new Set(beats.map((b) => Math.round(b * 1000) / 1000))]
    .sort((a, b) => a - b)
    .filter((b) => b >= 0 && b <= duration)
  return { bpm, firstBeatSeconds: anchor, beats: unique }
}

// ---------------------------------------------------------------------------
// Sync: canSync
// ---------------------------------------------------------------------------

describe('canSync', () => {
  it('returns true when both BPMs are valid', () => {
    expect(canSync(120, 128)).toBe(true)
  })

  it('returns false when slave BPM is null', () => {
    expect(canSync(null, 128)).toBe(false)
  })

  it('returns false when master BPM is null', () => {
    expect(canSync(120, null)).toBe(false)
  })

  it('returns false when slave BPM is too low', () => {
    expect(canSync(30, 128)).toBe(false)
  })

  it('returns false when slave BPM is too high', () => {
    expect(canSync(250, 128)).toBe(false)
  })

  it('returns false when master BPM is zero', () => {
    expect(canSync(120, 0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Sync: calculateSyncRate
// ---------------------------------------------------------------------------

describe('calculateSyncRate', () => {
  it('calculates correct rate for matching BPMs', () => {
    expect(calculateSyncRate(128, 128)).toBeCloseTo(1.0, 5)
  })

  it('calculates correct rate for different BPMs', () => {
    // Master 128, slave 100 → rate = 1.28
    expect(calculateSyncRate(128, 100)).toBeCloseTo(1.28, 5)
  })

  it('returns 1 when slave BPM is zero', () => {
    expect(calculateSyncRate(128, 0)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Sync: rateToTempoPercent
// ---------------------------------------------------------------------------

describe('rateToTempoPercent', () => {
  it('converts rate 1.0 to 0%', () => {
    expect(rateToTempoPercent(1.0)).toBe(0)
  })

  it('converts rate 1.05 to +5%', () => {
    expect(rateToTempoPercent(1.05)).toBeCloseTo(5, 5)
  })

  it('converts rate 0.95 to -5%', () => {
    expect(rateToTempoPercent(0.95)).toBeCloseTo(-5, 5)
  })
})

// ---------------------------------------------------------------------------
// Sync: syncExceedsRange
// ---------------------------------------------------------------------------

describe('syncExceedsRange', () => {
  it('returns false when within range', () => {
    expect(syncExceedsRange(5, 10)).toBe(false)
  })

  it('returns true when exceeds range', () => {
    expect(syncExceedsRange(15, 10)).toBe(true)
  })

  it('returns true at boundary', () => {
    expect(syncExceedsRange(10.1, 10)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Sync: calculatePhaseError
// ---------------------------------------------------------------------------

describe('calculatePhaseError', () => {
  it('returns 0 when grids are aligned', () => {
    const grid = makeGrid(120, 10, 0)
    const error = calculatePhaseError(grid, grid, 1.0)
    expect(error).not.toBeNull()
    expect(Math.abs(error!)).toBeLessThan(0.01)
  })

  it('returns non-zero when grids are offset', () => {
    const master = makeGrid(120, 10, 0)
    const slave = makeGrid(120, 10, 0.1) // offset by 0.1s
    const error = calculatePhaseError(master, slave, 1.0)
    expect(error).not.toBeNull()
    expect(Math.abs(error!)).toBeGreaterThan(0)
  })

  it('returns null for empty grid', () => {
    const empty: BeatGrid = { bpm: 120, firstBeatSeconds: 0, beats: [] }
    expect(calculatePhaseError(empty, empty, 1.0)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Sync: calculatePhaseAlignPosition
// ---------------------------------------------------------------------------

describe('calculatePhaseAlignPosition', () => {
  it('returns same position when already aligned', () => {
    const grid = makeGrid(120, 10, 0)
    const pos = calculatePhaseAlignPosition(grid, grid, 1.0)
    expect(pos).not.toBeNull()
    expect(pos!).toBeCloseTo(1.0, 1)
  })

  it('shifts position to align with master', () => {
    const master = makeGrid(120, 10, 0)
    const slave = makeGrid(120, 10, 0.1)
    const pos = calculatePhaseAlignPosition(master, slave, 1.0)
    expect(pos).not.toBeNull()
    // Should shift slave toward master alignment
    expect(pos!).toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// Sync: resolveSourceBpm
// ---------------------------------------------------------------------------

describe('resolveSourceBpm', () => {
  it('prefers manual BPM over analyzed', () => {
    expect(resolveSourceBpm({ manualBpm: 125, analyzedBpm: 128 })).toBe(125)
  })

  it('falls back to analyzed BPM', () => {
    expect(resolveSourceBpm({ manualBpm: null, analyzedBpm: 128 })).toBe(128)
  })

  it('returns null when both are null', () => {
    expect(resolveSourceBpm({ manualBpm: null, analyzedBpm: null })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Sync: state
// ---------------------------------------------------------------------------

describe('createSyncState', () => {
  it('creates default sync state', () => {
    const s = createSyncState()
    expect(s.enabled).toBe(false)
    expect(s.isMaster).toBe(false)
    expect(s.masterDeck).toBeNull()
    expect(s.targetBpm).toBeNull()
    expect(s.phaseErrorSeconds).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Loop: createLoop
// ---------------------------------------------------------------------------

describe('createLoop', () => {
  it('creates valid loop', () => {
    const loop = createLoop(1.0, 3.0, 4)
    expect(loop).not.toBeNull()
    expect(loop!.active).toBe(true)
    expect(loop!.startSeconds).toBe(1.0)
    expect(loop!.endSeconds).toBe(3.0)
    expect(loop!.lengthBeats).toBe(4)
  })

  it('returns null when OUT <= IN', () => {
    expect(createLoop(3.0, 1.0, 4)).toBeNull()
  })

  it('returns null when OUT == IN', () => {
    expect(createLoop(2.0, 2.0, 4)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Loop: createAutoLoop
// ---------------------------------------------------------------------------

describe('createAutoLoop', () => {
  it('creates 4-beat loop with beatgrid', () => {
    const grid = makeGrid(120, 30, 0) // 120 BPM = 0.5s per beat
    const loop = createAutoLoop(1.0, 4, grid, 30)
    expect(loop).not.toBeNull()
    expect(loop!.active).toBe(true)
    expect(loop!.lengthBeats).toBe(4)
    // 4 beats at 120 BPM = 2 seconds
    expect(loop!.endSeconds! - loop!.startSeconds!).toBeCloseTo(2.0, 1)
  })

  it('returns null when loop exceeds duration', () => {
    const grid = makeGrid(120, 2, 0)
    const loop = createAutoLoop(1.0, 4, grid, 2)
    expect(loop).toBeNull()
  })

  it('creates loop without beatgrid (approximate)', () => {
    const loop = createAutoLoop(1.0, 4, null, 30)
    expect(loop).not.toBeNull()
    expect(loop!.active).toBe(true)
    expect(loop!.lengthBeats).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Loop: halveLoop
// ---------------------------------------------------------------------------

describe('halveLoop', () => {
  it('halves loop length', () => {
    const grid = makeGrid(120, 30, 0)
    const loop = createAutoLoop(0, 8, grid, 30)!
    const halved = halveLoop(loop, grid, 30)
    expect(halved).not.toBeNull()
    expect(halved!.lengthBeats).toBe(4)
  })

  it('returns null for inactive loop', () => {
    expect(halveLoop(createLoopState(), null, 30)).toBeNull()
  })

  it('returns null when would go below minimum', () => {
    const loop = createLoop(0, 0.25, LOOP_MIN_BEATS)!
    const halved = halveLoop(loop, null, 30)
    expect(halved).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Loop: doubleLoop
// ---------------------------------------------------------------------------

describe('doubleLoop', () => {
  it('doubles loop length', () => {
    const grid = makeGrid(120, 60, 0)
    const loop = createAutoLoop(0, 4, grid, 60)!
    const doubled = doubleLoop(loop, grid, 60)
    expect(doubled).not.toBeNull()
    expect(doubled!.lengthBeats).toBe(8)
  })

  it('returns null for inactive loop', () => {
    expect(doubleLoop(createLoopState(), null, 30)).toBeNull()
  })

  it('returns null when would exceed maximum', () => {
    const loop = createLoop(0, 32, LOOP_MAX_BEATS)!
    const doubled = doubleLoop(loop, null, 60)
    expect(doubled).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Loop: isInsideLoop
// ---------------------------------------------------------------------------

describe('isInsideLoop', () => {
  it('returns true for position inside loop', () => {
    const loop = createLoop(1.0, 3.0, 4)!
    expect(isInsideLoop(2.0, loop)).toBe(true)
  })

  it('returns false for position outside loop', () => {
    const loop = createLoop(1.0, 3.0, 4)!
    expect(isInsideLoop(4.0, loop)).toBe(false)
  })

  it('returns false for inactive loop', () => {
    const loop = createLoopState()
    expect(isInsideLoop(2.0, loop)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Loop: wrapLoopPosition
// ---------------------------------------------------------------------------

describe('wrapLoopPosition', () => {
  it('wraps position past loop end back to start', () => {
    const loop = createLoop(1.0, 3.0, 4)!
    const wrapped = wrapLoopPosition(3.1, loop)
    expect(wrapped).not.toBeNull()
    expect(wrapped!).toBeGreaterThanOrEqual(loop.startSeconds!)
    expect(wrapped!).toBeLessThanOrEqual(loop.endSeconds!)
  })

  it('returns position unchanged when inside loop', () => {
    const loop = createLoop(1.0, 3.0, 4)!
    const wrapped = wrapLoopPosition(2.0, loop)
    expect(wrapped).toBe(2.0)
  })

  it('jumps to start when before loop', () => {
    const loop = createLoop(1.0, 3.0, 4)!
    const wrapped = wrapLoopPosition(0.5, loop)
    expect(wrapped).toBe(1.0)
  })

  it('returns null for inactive loop', () => {
    expect(wrapLoopPosition(3.1, createLoopState())).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Loop: state
// ---------------------------------------------------------------------------

describe('createLoopState', () => {
  it('creates default loop state', () => {
    const s = createLoopState()
    expect(s.active).toBe(false)
    expect(s.startSeconds).toBeNull()
    expect(s.endSeconds).toBeNull()
    expect(s.lengthBeats).toBeNull()
    expect(s.inPointSeconds).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Beat Jump: calculateBeatJumpPosition
// ---------------------------------------------------------------------------

describe('calculateBeatJumpPosition', () => {
  it('jumps forward by 1 beat', () => {
    const grid = makeGrid(120, 30, 0)
    // Position at beat 0 (time 0), jump +1 → time 0.5
    const target = calculateBeatJumpPosition(0, 1, grid, 30)
    expect(target).not.toBeNull()
    expect(target!).toBeCloseTo(0.5, 2)
  })

  it('jumps backward by 1 beat', () => {
    const grid = makeGrid(120, 30, 0)
    // Position at beat 2 (time 1.0), jump -1 → time 0.5
    const target = calculateBeatJumpPosition(1.0, -1, grid, 30)
    expect(target).not.toBeNull()
    expect(target!).toBeCloseTo(0.5, 2)
  })

  it('jumps forward by 4 beats', () => {
    const grid = makeGrid(120, 30, 0)
    // Position at beat 0 (time 0), jump +4 → time 2.0
    const target = calculateBeatJumpPosition(0, 4, grid, 30)
    expect(target).not.toBeNull()
    expect(target!).toBeCloseTo(2.0, 2)
  })

  it('clamps to first beat when jumping before start', () => {
    const grid = makeGrid(120, 30, 0)
    // Position at beat 0 (time 0), jump -4 → clamp to beat 0
    const target = calculateBeatJumpPosition(0, -4, grid, 30)
    expect(target).not.toBeNull()
    expect(target!).toBe(0)
  })

  it('clamps to last beat when jumping past end', () => {
    const grid = makeGrid(120, 6, 0) // short track
    const lastBeat = grid.beats[grid.beats.length - 1]
    // Position at last beat, jump +8
    const target = calculateBeatJumpPosition(lastBeat, 8, grid, 6)
    expect(target).not.toBeNull()
    expect(target!).toBe(lastBeat)
  })

  it('returns null without beatgrid', () => {
    expect(calculateBeatJumpPosition(1.0, 4, null, 30)).toBeNull()
  })

  it('returns null for empty beatgrid', () => {
    const empty: BeatGrid = { bpm: 120, firstBeatSeconds: 0, beats: [] }
    expect(calculateBeatJumpPosition(1.0, 4, empty, 30)).toBeNull()
  })

  it('returns same position for zero jump', () => {
    const grid = makeGrid(120, 30, 0)
    expect(calculateBeatJumpPosition(1.0, 0, grid, 30)).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// Beat Jump: shiftLoopByBeats
// ---------------------------------------------------------------------------

describe('shiftLoopByBeats', () => {
  it('shifts loop forward by beat count', () => {
    const grid = makeGrid(120, 30, 0)
    const loop = createLoop(1.0, 3.0, 4)!
    const shifted = shiftLoopByBeats(loop, 2, grid, 30)
    expect(shifted).not.toBeNull()
    // 2 beats at 120 BPM = 1 second
    expect(shifted!.startSeconds).toBeCloseTo(2.0, 2)
    expect(shifted!.endSeconds).toBeCloseTo(4.0, 2)
    expect(shifted!.lengthBeats).toBe(4)
  })

  it('shifts loop backward by beat count', () => {
    const grid = makeGrid(120, 30, 0)
    const loop = createLoop(3.0, 5.0, 4)!
    const shifted = shiftLoopByBeats(loop, -2, grid, 30)
    expect(shifted).not.toBeNull()
    expect(shifted!.startSeconds).toBeCloseTo(2.0, 2)
    expect(shifted!.endSeconds).toBeCloseTo(4.0, 2)
  })

  it('clamps to track boundaries', () => {
    const grid = makeGrid(120, 10, 0)
    const loop = createLoop(0.5, 2.5, 4)!
    const shifted = shiftLoopByBeats(loop, -4, grid, 10)
    // Shifted start would be -1.5, should clamp to 0
    expect(shifted).not.toBeNull()
    expect(shifted!.startSeconds!).toBeGreaterThanOrEqual(0)
    expect(shifted!.endSeconds!).toBeLessThanOrEqual(10)
  })

  it('returns null for inactive loop', () => {
    const grid = makeGrid(120, 30, 0)
    expect(shiftLoopByBeats(createLoopState(), 2, grid, 30)).toBeNull()
  })

  it('returns null without beatgrid', () => {
    const loop = createLoop(1.0, 3.0, 4)!
    expect(shiftLoopByBeats(loop, 2, null, 30)).toBeNull()
  })

  it('returns same loop for zero shift', () => {
    const grid = makeGrid(120, 30, 0)
    const loop = createLoop(1.0, 3.0, 4)!
    const shifted = shiftLoopByBeats(loop, 0, grid, 30)
    expect(shifted).not.toBeNull()
    expect(shifted!.startSeconds).toBe(1.0)
    expect(shifted!.endSeconds).toBe(3.0)
  })
})

// ---------------------------------------------------------------------------
// Beat Jump: quantizeToBeat
// ---------------------------------------------------------------------------

describe('quantizeToBeat', () => {
  it('quantizes to nearest beat', () => {
    const grid = makeGrid(120, 30, 0) // 0.5s per beat
    const q = quantizeToBeat(0.3, grid)
    expect(q).not.toBeNull()
    expect(q!).toBeCloseTo(0.5, 2) // nearest beat is 0.5
  })

  it('quantizes to exact beat when already on beat', () => {
    const grid = makeGrid(120, 30, 0)
    const q = quantizeToBeat(1.0, grid)
    expect(q).not.toBeNull()
    expect(q!).toBeCloseTo(1.0, 2)
  })

  it('returns null for null grid', () => {
    expect(quantizeToBeat(1.0, null)).toBeNull()
  })

  it('returns null for empty grid', () => {
    const empty: BeatGrid = { bpm: 120, firstBeatSeconds: 0, beats: [] }
    expect(quantizeToBeat(1.0, empty)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Integration: deck isolation
// ---------------------------------------------------------------------------

describe('deck isolation', () => {
  it('loop on deck A does not affect deck B', () => {
    const loopA = createLoop(1.0, 3.0, 4)!
    const loopB = createLoopState()

    expect(isInsideLoop(2.0, loopA)).toBe(true)
    expect(isInsideLoop(2.0, loopB)).toBe(false)
  })

  it('beat jump on deck A does not affect deck B position', () => {
    const grid = makeGrid(120, 30, 0)
    const targetA = calculateBeatJumpPosition(1.0, 4, grid, 30)
    const targetB = calculateBeatJumpPosition(1.0, 0, grid, 30)

    expect(targetA).not.toBe(targetB)
  })
})

// ---------------------------------------------------------------------------
// Serialization: state objects are plain JSON
// ---------------------------------------------------------------------------

describe('serialization', () => {
  it('sync state is serializable', () => {
    const s = createSyncState()
    const json = JSON.stringify(s)
    const parsed = JSON.parse(json) as SyncState
    expect(parsed.enabled).toBe(false)
    expect(parsed.isMaster).toBe(false)
  })

  it('loop state is serializable', () => {
    const l = createLoop(1.0, 3.0, 4)
    const json = JSON.stringify(l)
    const parsed = JSON.parse(json) as LoopState
    expect(parsed.active).toBe(true)
    expect(parsed.startSeconds).toBe(1.0)
    expect(parsed.endSeconds).toBe(3.0)
  })
})
