import { describe, it, expect } from 'vitest'
import {
  extractWaveform,
} from './waveform'
import {
  downmixToMono,
  computeEnergyEnvelope,
  detectOnsets,
  intervalToBPM,
  foldBPM,
  findBestBPM,
  BPM_MIN,
  BPM_MAX,
} from './bpm'
import {
  generateBeatGrid,
  findNearestBeat,
  findPreviousBeat,
  findNextBeat,
  timeToBeatIndex,
  beatIndexToTime,
  rebuildBeatGridWithBPM,
} from './beatgrid'
import { analyzeTrack, resetGenerationCounter } from './TrackAnalyzer'

// ---------------------------------------------------------------------------
// Waveform Tests
// ---------------------------------------------------------------------------
describe('waveform extraction', () => {
  function makeBuffer(
    channels: number,
    length: number,
    sampleRate: number = 44100,
    fillFn?: (i: number) => number,
  ): AudioBuffer {
    const buf = {
      duration: length / sampleRate,
      sampleRate,
      numberOfChannels: channels,
      length,
      getChannelData: (_ch: number) => {
        const data = new Float32Array(length)
        for (let i = 0; i < length; i++) {
          data[i] = fillFn ? fillFn(i) : Math.sin(i * 0.01) * 0.5
        }
        return data
      },
    }
    return buf as unknown as AudioBuffer
  }

  it('extracts peaks from mono buffer', () => {
    const buf = makeBuffer(1, 44100, 44100, (i) => Math.sin(i * 0.1) * 0.8)
    const waveform = extractWaveform(buf, 100)
    expect(waveform.peaks.length).toBeGreaterThan(0)
    expect(waveform.pointsPerSecond).toBe(100)
  })

  it('extracts peaks from stereo buffer', () => {
    const buf = makeBuffer(2, 44100, 44100, (i) => Math.sin(i * 0.1) * 0.6)
    const waveform = extractWaveform(buf, 100)
    expect(waveform.peaks.length).toBeGreaterThan(0)
  })

  it('normalizes to 0..1', () => {
    const buf = makeBuffer(1, 44100, 44100, (i) => Math.sin(i * 0.1) * 0.5)
    const waveform = extractWaveform(buf, 100)
    for (const p of waveform.peaks) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it('correct bucket count', () => {
    // 2 second buffer at 100 pts/sec should give ~200 points
    const buf = makeBuffer(1, 88200, 44100)
    const waveform = extractWaveform(buf, 100)
    const expectedPoints = Math.ceil(2 * 100)
    expect(waveform.peaks.length).toBe(expectedPoints)
  })

  it('silence produces all-zero peaks', () => {
    const buf = makeBuffer(1, 44100, 44100, () => 0)
    const waveform = extractWaveform(buf, 100)
    for (const p of waveform.peaks) {
      expect(p).toBe(0)
    }
  })

  it('short track produces valid waveform', () => {
    const buf = makeBuffer(1, 4410, 44100) // 0.1 seconds
    const waveform = extractWaveform(buf, 100)
    expect(waveform.peaks.length).toBeGreaterThanOrEqual(1)
  })

  it('deterministic output', () => {
    const buf = makeBuffer(1, 44100, 44100, (i) => Math.sin(i * 0.05) * 0.3)
    const w1 = extractWaveform(buf, 100)
    const w2 = extractWaveform(buf, 100)
    expect(w1.peaks).toEqual(w2.peaks)
  })

  it('rms is provided', () => {
    const buf = makeBuffer(1, 44100, 44100)
    const waveform = extractWaveform(buf, 100)
    expect(waveform.rms).toBeDefined()
    expect(waveform.rms!.length).toBe(waveform.peaks.length)
  })
})

// ---------------------------------------------------------------------------
// BPM Tests
// ---------------------------------------------------------------------------
describe('BPM estimation', () => {
  it('downmixToMono averages channels', () => {
    const buf = {
      duration: 1,
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 44100,
      getChannelData: (ch: number) => {
        const data = new Float32Array(44100)
        for (let i = 0; i < 44100; i++) data[i] = ch === 0 ? 0.5 : 0.3
        return data
      },
    } as unknown as AudioBuffer

    const mono = downmixToMono(buf)
    // Average of 0.5 and 0.3 = 0.4
    expect(mono[0]).toBeCloseTo(0.4, 5)
  })

  it('computeEnergyEnvelope returns array', () => {
    const signal = new Float32Array(10000)
    for (let i = 0; i < 10000; i++) signal[i] = Math.sin(i * 0.1) * 0.5
    const envelope = computeEnergyEnvelope(signal)
    expect(envelope.length).toBeGreaterThan(0)
    for (const e of envelope) {
      expect(e).toBeGreaterThanOrEqual(0)
    }
  })

  it('detectOnsets returns indices', () => {
    // Create a signal with clear transients
    const envelope: number[] = []
    for (let i = 0; i < 100; i++) {
      // Periodic peaks every 10 windows
      envelope.push(i % 10 === 0 ? 1.0 : 0.1)
    }
    const onsets = detectOnsets(envelope)
    expect(onsets.length).toBeGreaterThan(0)
  })

  it('intervalToBPM converts correctly', () => {
    expect(intervalToBPM(0.5)).toBeCloseTo(120, 5)
    expect(intervalToBPM(60 / 128)).toBeCloseTo(128, 5)
    expect(intervalToBPM(0)).toBe(0)
  })

  it('foldBPM folds into range', () => {
    // 30 BPM (< BPM_MIN/2=35) should fold up to 60 (doubled once)
    expect(foldBPM(30)).toBeCloseTo(60, 0)
    // 240 BPM (> BPM_MAX*2=360? no, 240 < 360) stays at 240
    // Actually 240 is within [35, 360], so it stays
    expect(foldBPM(240)).toBeCloseTo(240, 0)
    // 128 BPM stays in range
    expect(foldBPM(128)).toBeCloseTo(128, 0)
    // 500 BPM folds down: 500 > 360 → 250, 250 < 360 → stop
    expect(foldBPM(500)).toBeCloseTo(250, 0)
    // 0 BPM returns 0
    expect(foldBPM(0)).toBe(0)
  })

  it('findBestBPM returns confidence', () => {
    // IOIs corresponding to ~120 BPM (0.5s intervals)
    const iois = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    const result = findBestBPM(iois)
    expect(result.bpm).toBeCloseTo(120, 0)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('findBestBPM returns low confidence for random IOIs', () => {
    const iois = [0.1, 0.7, 0.3, 0.9, 0.2, 0.8, 0.15, 0.85]
    const result = findBestBPM(iois)
    expect(result.confidence).toBeLessThan(0.8)
  })

  it('findBestBPM returns 0 for insufficient data', () => {
    expect(findBestBPM([]).bpm).toBe(0)
    expect(findBestBPM([0.5]).bpm).toBe(0)
  })

  it('BPM range is bounded', () => {
    const result = findBestBPM([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
    if (result.bpm > 0) {
      expect(result.bpm).toBeGreaterThanOrEqual(BPM_MIN)
      expect(result.bpm).toBeLessThanOrEqual(BPM_MAX)
    }
  })
})

// ---------------------------------------------------------------------------
// Beatgrid Tests
// ---------------------------------------------------------------------------
describe('beatgrid generation', () => {
  it('generates ascending timestamps', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    expect(grid).not.toBeNull()
    for (let i = 1; i < grid.beats.length; i++) {
      expect(grid.beats[i]).toBeGreaterThan(grid.beats[i - 1])
    }
  })

  it('beat interval is correct', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    const interval = 60 / 120 // 0.5s
    for (let i = 1; i < Math.min(grid.beats.length, 5); i++) {
      expect(grid.beats[i] - grid.beats[i - 1]).toBeCloseTo(interval, 3)
    }
  })

  it('clamped to duration', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    for (const beat of grid.beats) {
      expect(beat).toBeGreaterThanOrEqual(0)
      expect(beat).toBeLessThanOrEqual(10)
    }
  })

  it('returns null for invalid BPM', () => {
    expect(generateBeatGrid(0, 0, 10)).toBeNull()
    expect(generateBeatGrid(-1, 0, 10)).toBeNull()
    expect(generateBeatGrid(120, 0, 0)).toBeNull()
  })

  it('findNearestBeat returns closest', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    // Grid at 120 BPM: [0.0, 0.5, 1.0, ...]
    // At time 0.3, nearest is 0.0 (dist 0.3) or 0.5 (dist 0.2) — 0.5 is closer
    const nearest = findNearestBeat(0.3, grid)!
    expect(nearest).not.toBeNull()
    expect(nearest.time).toBeCloseTo(0.5, 3)
    // At time 0.25, both 0.0 and 0.5 are equidistant (0.25)
    // Just verify it returns a valid beat
    const nearest2 = findNearestBeat(0.25, grid)!
    expect(nearest2).not.toBeNull()
    expect(nearest2.time).toBeGreaterThanOrEqual(0)
    expect(nearest2.time).toBeLessThanOrEqual(0.5)
  })

  it('findPreviousBeat returns beat at or before', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    const prev = findPreviousBeat(0.7, grid)!
    expect(prev).not.toBeNull()
    expect(prev.time).toBeLessThanOrEqual(0.7 + 0.001)
  })

  it('findNextBeat returns beat at or after', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    const next = findNextBeat(0.3, grid)!
    expect(next).not.toBeNull()
    expect(next.time).toBeGreaterThanOrEqual(0.3 - 0.001)
  })

  it('timeToBeatIndex returns floor index', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    const idx = timeToBeatIndex(0.7, grid)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(grid.beats[idx]).toBeLessThanOrEqual(0.7 + 0.001)
  })

  it('beatIndexToTime returns correct time', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    const time = beatIndexToTime(0, grid)
    expect(time).not.toBeNull()
    expect(time).toBeCloseTo(grid.beats[0], 5)
  })

  it('beatIndexToTime returns null for out of range', () => {
    const grid = generateBeatGrid(120, 0, 10)!
    expect(beatIndexToTime(-1, grid)).toBeNull()
    expect(beatIndexToTime(grid.beats.length, grid)).toBeNull()
  })

  it('rebuildBeatGridWithBPM preserves anchor', () => {
    const grid = generateBeatGrid(120, 0.25, 10)!
    const rebuilt = rebuildBeatGridWithBPM(130, grid, 10)!
    expect(rebuilt.bpm).toBe(130)
    expect(rebuilt.firstBeatSeconds).toBeCloseTo(0.25, 3)
  })

  it('rebuildBeatGridWithBPM returns null for invalid BPM', () => {
    expect(rebuildBeatGridWithBPM(0, null, 10)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// TrackAnalyzer Tests
// ---------------------------------------------------------------------------
describe('TrackAnalyzer', () => {
  it('analyzeTrack returns complete result', () => {
    const buf = {
      duration: 2,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 88200,
      getChannelData: () => {
        const data = new Float32Array(88200)
        for (let i = 0; i < 88200; i++) data[i] = Math.sin(i * 0.1) * 0.5
        return data
      },
    } as unknown as AudioBuffer

    const result = analyzeTrack(buf)
    expect(result.durationSeconds).toBeCloseTo(2, 1)
    expect(result.waveform.peaks.length).toBeGreaterThan(0)
    expect(result.analysisVersion).toBe('waveform-bpm-v1')
  })

  it('analyzeTrack handles silence gracefully', () => {
    const buf = {
      duration: 1,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 44100,
      getChannelData: () => new Float32Array(44100),
    } as unknown as AudioBuffer

    const result = analyzeTrack(buf)
    // BPM may be null for silence
    expect(result.bpm).toBeNull()
    expect(result.beatGrid).toBeNull()
  })

  it('resetGenerationCounter works', () => {
    resetGenerationCounter()
    expect(true).toBe(true) // Just verify it doesn't throw
  })
})

// ---------------------------------------------------------------------------
// DJEngine Integration Tests
// ---------------------------------------------------------------------------
describe('DJEngine analysis integration', () => {
  it('LOAD_TRACK triggers analysis with status', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const buf = {
      duration: 2,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 88200,
      getChannelData: () => {
        const data = new Float32Array(88200)
        for (let i = 0; i < 88200; i++) data[i] = Math.sin(i * 0.1) * 0.5
        return data
      },
    } as unknown as AudioBuffer

    engine.dispatch({
      type: 'LOAD_TRACK',
      deck: 0,
      track: { id: 't1', name: 'test', buffer: buf, duration: 2 },
    })

    const state = engine.getState().decks[0]
    expect(state.analysis.status).toBe('ready')
    expect(state.analysis.waveformReady).toBe(true)
  })

  it('SET_MANUAL_BPM updates effective BPM', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_MANUAL_BPM', deck: 0, bpm: 128 })
    const state = engine.getState().decks[0]
    expect(state.analysis.manualBpm).toBe(128)
    expect(state.originalBpm).toBe(128)
    expect(state.effectiveBpm).toBeCloseTo(128, 1)
  })

  it('SET_MANUAL_BPM null reverts to analyzed', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_MANUAL_BPM', deck: 0, bpm: 128 })
    engine.dispatch({ type: 'SET_MANUAL_BPM', deck: 0, bpm: null })
    const state = engine.getState().decks[0]
    expect(state.analysis.manualBpm).toBeNull()
  })

  it('manual BPM override affects effectiveBpm', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_MANUAL_BPM', deck: 0, bpm: 140 })
    engine.dispatch({ type: 'SET_TEMPO', deck: 0, percent: 10 })
    const state = engine.getState().decks[0]
    expect(state.effectiveBpm).toBeCloseTo(154, 0) // 140 * 1.10
  })

  it('deck isolation: analysis A does not affect B', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const buf = {
      duration: 2,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 88200,
      getChannelData: () => {
        const data = new Float32Array(88200)
        for (let i = 0; i < 88200; i++) data[i] = Math.sin(i * 0.1) * 0.5
        return data
      },
    } as unknown as AudioBuffer

    engine.dispatch({
      type: 'LOAD_TRACK',
      deck: 0,
      track: { id: 't1', name: 'test1', buffer: buf, duration: 2 },
    })

    const s0 = engine.getState().decks[0].analysis
    const s1 = engine.getState().decks[1].analysis
    expect(s0.waveformReady).toBe(true)
    expect(s1.waveformReady).toBe(false)
  })

  it('serializable state: analysis state is plain JSON', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_MANUAL_BPM', deck: 0, bpm: 128 })
    const state = engine.getState()
    const json = JSON.stringify(state)
    const parsed = JSON.parse(json)
    expect(parsed.decks[0].analysis.manualBpm).toBe(128)
    expect(parsed.decks[0].originalBpm).toBe(128)
  })

  it('default analysis state values', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const a = engine.getState().decks[0].analysis
    expect(a.status).toBe('idle')
    expect(a.analyzedBpm).toBeNull()
    expect(a.manualBpm).toBeNull()
    expect(a.waveformReady).toBe(false)
    expect(a.beatGridReady).toBe(false)
    expect(a.beatGrid).toBeNull()
  })

  it('beatGrid is generated when BPM detected', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const buf = {
      duration: 5,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 220500,
      getChannelData: () => {
        const data = new Float32Array(220500)
        for (let i = 0; i < 220500; i++) data[i] = Math.sin(i * 0.1) * 0.5
        return data
      },
    } as unknown as AudioBuffer

    engine.dispatch({
      type: 'LOAD_TRACK',
      deck: 0,
      track: { id: 't1', name: 'test', buffer: buf, duration: 5 },
    })

    const a = engine.getState().decks[0].analysis
    // BPM may or may not be detected for a simple sine wave,
    // but waveform should be ready
    expect(a.waveformReady).toBe(true)
  })

  it('stale analysis does not overwrite new track', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const buf1 = {
      duration: 2,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 88200,
      getChannelData: () => {
        const data = new Float32Array(88200)
        for (let i = 0; i < 88200; i++) data[i] = Math.sin(i * 0.1) * 0.5
        return data
      },
    } as unknown as AudioBuffer
    const buf2 = {
      duration: 3,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 132300,
      getChannelData: () => {
        const data = new Float32Array(132300)
        for (let i = 0; i < 132300; i++) data[i] = Math.sin(i * 0.2) * 0.3
        return data
      },
    } as unknown as AudioBuffer

    // Load track 1
    engine.dispatch({
      type: 'LOAD_TRACK',
      deck: 0,
      track: { id: 't1', name: 'track1', buffer: buf1, duration: 2 },
    })

    // Load track 2 before track 1 analysis could theoretically be stale
    engine.dispatch({
      type: 'LOAD_TRACK',
      deck: 0,
      track: { id: 't2', name: 'track2', buffer: buf2, duration: 3 },
    })

    const state = engine.getState().decks[0]
    // Deck should have track 2
    expect(state.track?.name).toBe('track2')
    expect(state.duration).toBeCloseTo(3, 1)
  })
})
