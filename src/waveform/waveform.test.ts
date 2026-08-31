import { describe, expect, it, vi } from 'vitest'
import { createDeckState } from '../engine/DJEngine'
import type { DJEngineHandle, DJState } from '../types'
import {
  beatGridMarkers,
  detailWindow,
  formatWaveformBpm,
  hotCueMarkers,
  loopRegion,
  overviewWindow,
  timeToX,
  xToTime,
} from './beatOverlay'
import { createDjWaveformPlayerAdapter } from './djWaveformAdapter'

function makeState(): DJState {
  return {
    decks: [createDeckState(0), createDeckState(1)],
    mixer: {
      channels: [
        { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1, meter: 0 },
        { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1, meter: 0 },
      ],
      crossfader: 0.5,
      master: 1,
    },
    master: { level: 1 },
    sampler: {
      slots: [0, 1, 2, 3, 4, 5, 6, 7].map((index) => ({
        index,
        loaded: false,
        name: null,
        durationSeconds: null,
        playing: false,
      })) as DJState['sampler']['slots'],
      gain: 1,
    },
    shiftPressed: false,
    fx: {
      beatFx: { enabled: false, type: 'ECHO', target: 'MASTER', beatMultiplierIndex: 4, levelDepth: 0 },
      releaseFx: { type: 'NONE', active: false },
      smartCfx: [{ enabled: false, value: 0 }, { enabled: false, value: 0 }],
      smartFader: { enabled: false, transitionDirection: null },
    },
    transportError: null,
  }
}

describe('waveform presentation helpers', () => {
  it('uses manual, analyzed, source track, original BPM priority', () => {
    const deck = createDeckState(0)
    expect(formatWaveformBpm(deck)).toBe('- BPM')
    deck.originalBpm = 100
    expect(formatWaveformBpm(deck)).toBe('100.0 BPM')
    deck.track = { id: 't', name: 'Track', duration: 10, buffer: {} as AudioBuffer, bpm: 110 }
    expect(formatWaveformBpm(deck)).toBe('110.0 BPM')
    deck.analysis.analyzedBpm = 120
    expect(formatWaveformBpm(deck)).toBe('120.0 BPM')
    deck.analysis.manualBpm = 130
    expect(formatWaveformBpm(deck)).toBe('130.0 BPM')
    deck.analysis.status = 'analyzing'
    expect(formatWaveformBpm(deck)).toBe('Analyzing')
  })

  it('maps time to markers with every fourth existing grid position emphasized', () => {
    const markers = beatGridMarkers([0, 0.5, 1, 1.5, 2], overviewWindow(2), 200)
    expect(markers).toEqual([
      { seconds: 0, x: 0, emphasis: 'strong' },
      { seconds: 0.5, x: 50, emphasis: 'minor' },
      { seconds: 1, x: 100, emphasis: 'minor' },
      { seconds: 1.5, x: 150, emphasis: 'minor' },
      { seconds: 2, x: 200, emphasis: 'strong' },
    ])
  })

  it('uses one reversible time to x transformation for the visible window', () => {
    const window = detailWindow(10, 30, 8)
    const x = timeToX(10, window, 800)
    expect(x).toBe(400)
    expect(xToTime(x, window, 800)).toBe(10)
  })

  it('keeps deck cue markers independent by using only the supplied cue list', () => {
    const deckA = [{ index: 0, positionSeconds: 1, active: true }]
    const deckB = [{ index: 1, positionSeconds: 3, active: true }]
    expect(hotCueMarkers(deckA, overviewWindow(4), 400)).toEqual([{ index: 0, seconds: 1, x: 100 }])
    expect(hotCueMarkers(deckB, overviewWindow(4), 400)).toEqual([{ index: 1, seconds: 3, x: 300 }])
  })

  it('clips loop overlay to the current waveform window', () => {
    const region = loopRegion({ active: true, startSeconds: 8, endSeconds: 14, lengthBeats: 8, inPointSeconds: 8 }, { start: 10, end: 18 }, 800)
    expect(region).toEqual({ startSeconds: 8, endSeconds: 14, x: 0, width: 400 })
  })
})

describe('DJEngine waveform player adapter', () => {
  it('delegates transport and seek to one deck without touching the other', () => {
    const state = makeState()
    state.decks[0].duration = 60
    state.decks[0].position = 12
    state.decks[0].isPlaying = true
    state.decks[1].duration = 30
    const dispatch = vi.fn()
    const engine = {
      getState: () => state,
      dispatch,
      subscribe: vi.fn(),
      getWaveform: vi.fn(),
      loadTrack: vi.fn(),
      loadSample: vi.fn(),
      destroy: vi.fn(),
    } satisfies DJEngineHandle

    const adapter = createDjWaveformPlayerAdapter(engine, 0)
    expect(adapter.getCurrentTime()).toBe(12)
    expect(adapter.getDuration()).toBe(60)
    expect(adapter.isPlaying()).toBe(true)

    adapter.play()
    adapter.pause()
    adapter.seek(90)

    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAY', deck: 0 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'PAUSE', deck: 0 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SEEK', deck: 0, seconds: 60 })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ deck: 1 }))
  })

  it('rejects use after cleanup', () => {
    const state = makeState()
    const engine = {
      getState: () => state,
      dispatch: vi.fn(),
      subscribe: vi.fn(),
      getWaveform: vi.fn(),
      loadTrack: vi.fn(),
      loadSample: vi.fn(),
      destroy: vi.fn(),
    } satisfies DJEngineHandle

    const adapter = createDjWaveformPlayerAdapter(engine, 1)
    adapter.destroy()
    expect(() => adapter.getCurrentTime()).toThrow('Waveform adapter is destroyed')
  })
})
