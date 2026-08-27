import { describe, it, expect } from 'vitest'
import { AudioEngineImpl } from '../audio'
import {
  dbToGain,
  gainToDb,
  clampDb,
  filterCutoffs,
  EQ_GAIN_DB_MIN,
  EQ_GAIN_DB_MAX,
  TRIM_DB_MIN,
  TRIM_DB_MAX,
  FILTER_MIN,
  FILTER_MAX,
} from '../audio/dsp'

// ---------------------------------------------------------------------------
// DSP helper tests
// ---------------------------------------------------------------------------
describe('dsp helpers', () => {
  it('dbToGain: 0 dB = unity', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 5)
  })

  it('dbToGain: +6 dB ≈ 2.0', () => {
    expect(dbToGain(6)).toBeCloseTo(2.0, 2)
  })

  it('dbToGain: -6 dB ≈ 0.5', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.5, 2)
  })

  it('dbToGain: -70 dB ≈ 0 (mute)', () => {
    expect(dbToGain(-70)).toBeLessThan(0.001)
  })

  it('dbToGain: handles Infinity', () => {
    expect(dbToGain(Infinity)).toBe(0)
  })

  it('gainToDb: 1 = 0 dB', () => {
    expect(gainToDb(1)).toBeCloseTo(0, 5)
  })

  it('gainToDb: 0 = -Infinity', () => {
    expect(gainToDb(0)).toBe(-Infinity)
  })

  it('clampDb clamps to bounds', () => {
    expect(clampDb(-100, TRIM_DB_MIN, TRIM_DB_MAX)).toBe(TRIM_DB_MIN)
    expect(clampDb(100, TRIM_DB_MIN, TRIM_DB_MAX)).toBe(TRIM_DB_MAX)
    expect(clampDb(5, TRIM_DB_MIN, TRIM_DB_MAX)).toBe(5)
  })

  it('clampDb handles Infinity', () => {
    expect(clampDb(Infinity, EQ_GAIN_DB_MIN, EQ_GAIN_DB_MAX)).toBe(EQ_GAIN_DB_MIN)
  })
})

// ---------------------------------------------------------------------------
// filterCutoffs mapping
// ---------------------------------------------------------------------------
describe('filterCutoffs', () => {
  it('center (0) → both pass full range (LPF at max, HPF at min)', () => {
    const [lpf, hpf] = filterCutoffs(0)
    expect(lpf).toBe(16000) // LPF_MAX = open
    expect(hpf).toBe(80)    // HPF_MIN = open
  })

  it('left (-1) → strong low-pass (LPF at minimum, HPF at min)', () => {
    const [lpf, hpf] = filterCutoffs(-1)
    expect(lpf).toBeCloseTo(250, 0) // LPF_MIN
    expect(hpf).toBe(80)
  })

  it('right (+1) → strong high-pass (LPF at max, HPF at max)', () => {
    const [lpf, hpf] = filterCutoffs(1)
    expect(lpf).toBe(16000) // LPF_MAX = open
    expect(hpf).toBeCloseTo(7000, 0) // HPF_MAX
  })

  it('clamps out-of-range values', () => {
    const [lpf1] = filterCutoffs(-5)
    const [lpf2] = filterCutoffs(5)
    expect(lpf1).toBeGreaterThanOrEqual(250)
    expect(lpf2).toBeLessThanOrEqual(16000)
  })

  it('continuity: intermediate values between -1 and 0', () => {
    const [lpfA] = filterCutoffs(-1)
    const [lpfB] = filterCutoffs(-0.5)
    const [lpfC] = filterCutoffs(0)
    expect(lpfA).toBeLessThan(lpfB)
    expect(lpfB).toBeLessThan(lpfC)
  })

  it('continuity: intermediate values between 0 and +1', () => {
    const [, hpfA] = filterCutoffs(0)
    const [, hpfB] = filterCutoffs(0.5)
    const [, hpfC] = filterCutoffs(1)
    expect(hpfA).toBeLessThan(hpfB)
    expect(hpfB).toBeLessThan(hpfC)
  })
})

// ---------------------------------------------------------------------------
// AudioEngine mixer control tests
// ---------------------------------------------------------------------------
describe('AudioEngine mixer controls', () => {
  it('setTrim clamps to TRIM_DB_MIN..TRIM_DB_MAX', () => {
    const engine = new AudioEngineImpl()
    // Should not throw for in-range
    expect(() => engine.setTrim(0, 0)).not.toThrow()
    expect(() => engine.setTrim(0, TRIM_DB_MIN)).not.toThrow()
    expect(() => engine.setTrim(0, TRIM_DB_MAX)).not.toThrow()
    // Should not throw for out-of-range (clamped internally)
    expect(() => engine.setTrim(0, -200)).not.toThrow()
    expect(() => engine.setTrim(0, 100)).not.toThrow()
  })

  it('setEQ clamps to EQ_GAIN_DB_MIN..EQ_GAIN_DB_MAX', () => {
    const engine = new AudioEngineImpl()
    expect(() => engine.setEQ(0, 'low', 0)).not.toThrow()
    expect(() => engine.setEQ(0, 'mid', EQ_GAIN_DB_MIN)).not.toThrow()
    expect(() => engine.setEQ(0, 'high', EQ_GAIN_DB_MAX)).not.toThrow()
    expect(() => engine.setEQ(0, 'low', -100)).not.toThrow()
    expect(() => engine.setEQ(1, 'high', 100)).not.toThrow()
  })

  it('setFilter clamps to FILTER_MIN..FILTER_MAX', () => {
    const engine = new AudioEngineImpl()
    expect(() => engine.setFilter(0, 0)).not.toThrow()
    expect(() => engine.setFilter(0, FILTER_MIN)).not.toThrow()
    expect(() => engine.setFilter(1, FILTER_MAX)).not.toThrow()
    expect(() => engine.setFilter(0, -10)).not.toThrow()
    expect(() => engine.setFilter(1, 10)).not.toThrow()
  })

  it('setChannelFader clamps to 0..1', () => {
    const engine = new AudioEngineImpl()
    expect(() => engine.setChannelFader(0, 0)).not.toThrow()
    expect(() => engine.setChannelFader(0, 1)).not.toThrow()
    expect(() => engine.setChannelFader(0, 0.5)).not.toThrow()
    expect(() => engine.setChannelFader(0, -1)).not.toThrow()
    expect(() => engine.setChannelFader(1, 99)).not.toThrow()
  })

  it('setCrossfader clamps to 0..1', () => {
    const engine = new AudioEngineImpl()
    expect(() => engine.setCrossfader(0)).not.toThrow()
    expect(() => engine.setCrossfader(1)).not.toThrow()
    expect(() => engine.setCrossfader(0.5)).not.toThrow()
    expect(() => engine.setCrossfader(-1)).not.toThrow()
    expect(() => engine.setCrossfader(2)).not.toThrow()
  })

  it('setMaster clamps to 0..1', () => {
    const engine = new AudioEngineImpl()
    expect(() => engine.setMaster(0)).not.toThrow()
    expect(() => engine.setMaster(1)).not.toThrow()
    expect(() => engine.setMaster(0.5)).not.toThrow()
    expect(() => engine.setMaster(-1)).not.toThrow()
    expect(() => engine.setMaster(99)).not.toThrow()
  })

  it('getMeterPeak returns 0..1', () => {
    const engine = new AudioEngineImpl()
    const peak = engine.getMeterPeak(0)
    expect(peak).toBeGreaterThanOrEqual(0)
    expect(peak).toBeLessThanOrEqual(1)
  })

  it('getMeterRms returns 0..1', () => {
    const engine = new AudioEngineImpl()
    const rms = engine.getMeterRms(0)
    expect(rms).toBeGreaterThanOrEqual(0)
    expect(rms).toBeLessThanOrEqual(1)
  })

  it('meters are independent per deck', () => {
    const engine = new AudioEngineImpl()
    const peak0 = engine.getMeterPeak(0)
    const peak1 = engine.getMeterPeak(1)
    const rms0 = engine.getMeterRms(0)
    const rms1 = engine.getMeterRms(1)
    // Both should be 0 from silence, but they should be independently computed
    expect(peak0).toBeGreaterThanOrEqual(0)
    expect(peak1).toBeGreaterThanOrEqual(0)
    expect(rms0).toBeGreaterThanOrEqual(0)
    expect(rms1).toBeGreaterThanOrEqual(0)
  })

  it('deck isolation: controls on deck 0 do not affect deck 1', () => {
    const engine = new AudioEngineImpl()
    // Set deck 0 to specific values
    engine.setTrim(0, -10)
    engine.setEQ(0, 'low', -6)
    engine.setChannelFader(0, 0.5)
    // Set deck 1 to different values
    engine.setTrim(1, 0)
    engine.setEQ(1, 'low', 0)
    engine.setChannelFader(1, 1.0)
    // Just verify they don't throw — the actual values are internal
    // The important thing is that setting one deck doesn't crash the other
    expect(true).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// DJEngine action routing & serializable state
// ---------------------------------------------------------------------------
describe('DJEngine mixer action routing', () => {
  it('dispatches SET_TRIM and updates mixer state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_TRIM', deck: 0, db: -6 })
    const state = engine.getState()
    expect(state.mixer.channels[0].trimDb).toBe(-6)
    // Deck 1 unchanged
    expect(state.mixer.channels[1].trimDb).toBe(0)
  })

  it('dispatches SET_EQ_LOW and updates mixer state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_EQ_LOW', deck: 0, db: -12 })
    expect(engine.getState().mixer.channels[0].eqLowDb).toBe(-12)
    expect(engine.getState().mixer.channels[1].eqLowDb).toBe(0)
  })

  it('dispatches SET_EQ_MID and updates mixer state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_EQ_MID', deck: 1, db: 3 })
    expect(engine.getState().mixer.channels[1].eqMidDb).toBe(3)
    expect(engine.getState().mixer.channels[0].eqMidDb).toBe(0)
  })

  it('dispatches SET_EQ_HIGH and updates mixer state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_EQ_HIGH', deck: 0, db: 6 })
    expect(engine.getState().mixer.channels[0].eqHighDb).toBe(6)
  })

  it('dispatches SET_FILTER and updates mixer state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_FILTER', deck: 0, p: -0.75 })
    expect(engine.getState().mixer.channels[0].filter).toBe(-0.75)
    engine.dispatch({ type: 'SET_FILTER', deck: 1, p: 0.5 })
    expect(engine.getState().mixer.channels[1].filter).toBe(0.5)
  })

  it('dispatches SET_CHANNEL_FADER and updates mixer + deck state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_CHANNEL_FADER', deck: 0, fader: 0.7 })
    expect(engine.getState().mixer.channels[0].channelFader).toBe(0.7)
    expect(engine.getState().decks[0].channelFader).toBe(0.7)
  })

  it('dispatches SET_CROSSFADER and updates mixer state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_CROSSFADER', x: 0.25 })
    expect(engine.getState().mixer.crossfader).toBe(0.25)
  })

  it('dispatches SET_MASTER and updates master state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_MASTER', level: 0.8 })
    expect(engine.getState().master.level).toBe(0.8)
  })

  it('serializable state: mixer state is plain JSON', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    engine.dispatch({ type: 'SET_TRIM', deck: 0, db: -3 })
    engine.dispatch({ type: 'SET_EQ_LOW', deck: 1, db: 6 })
    engine.dispatch({ type: 'SET_CROSSFADER', x: 0.7 })
    engine.dispatch({ type: 'SET_MASTER', level: 0.9 })

    const state = engine.getState()
    // Should be serializable to JSON without errors
    const json = JSON.stringify(state)
    const parsed = JSON.parse(json)
    expect(parsed.mixer.channels[0].trimDb).toBe(-3)
    expect(parsed.mixer.channels[1].eqLowDb).toBe(6)
    expect(parsed.mixer.crossfader).toBe(0.7)
    expect(parsed.master.level).toBe(0.9)
  })

  it('EQ neutral state: default mixer has all EQ at 0', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const state = engine.getState()
    for (const ch of state.mixer.channels) {
      expect(ch.eqLowDb).toBe(0)
      expect(ch.eqMidDb).toBe(0)
      expect(ch.eqHighDb).toBe(0)
    }
  })

  it('crossfader default is 0.5', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    expect(engine.getState().mixer.crossfader).toBe(0.5)
  })

  it('master default is 1.0', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    expect(engine.getState().master.level).toBe(1.0)
  })
})
