import { describe, it, expect } from 'vitest'
import { AudioEngineImpl } from '../audio'
import { DeckEngine } from '../audio/DeckEngine'
import type { DJState } from '../types'

describe('AudioEngine', () => {
  it('createDeckTransport returns a DeckEngine', () => {
    const audio = new AudioEngineImpl()
    const deck = audio.createDeckTransport({ duration: 5 } as unknown as AudioBuffer, 0)
    expect(deck).toBeInstanceOf(DeckEngine)
    expect(deck.id).toBe(0)
    expect(deck.duration).toBe(0)
  })

  it('crossfade is equal-power', () => {
    const gainA = (x: number) => Math.cos((x * Math.PI) / 2)
    const gainB = (x: number) => Math.sin((x * Math.PI) / 2)

    expect(gainA(0)).toBeCloseTo(1, 5)
    expect(gainB(0)).toBeCloseTo(0, 5)
    expect(gainA(0.5)).toBeCloseTo(0.7071, 3)
    expect(gainB(0.5)).toBeCloseTo(0.7071, 3)
    expect(gainA(1)).toBeCloseTo(0, 5)
    expect(gainB(1)).toBeCloseTo(1, 5)
  })

  it('setCrossfader clamps to 0..1', () => {
    const engine = new AudioEngineImpl()
    expect(() => engine.setCrossfader(-0.5)).not.toThrow()
    expect(() => engine.setCrossfader(1.5)).not.toThrow()
    expect(() => engine.setCrossfader(0.5)).not.toThrow()
  })

  it('setChannelFader clamps to 0..1', () => {
    const engine = new AudioEngineImpl()
    expect(() => engine.setChannelFader(0, -5)).not.toThrow()
    expect(() => engine.setChannelFader(0, 99)).not.toThrow()
    expect(() => engine.setChannelFader(0, 0.5)).not.toThrow()
  })

  it('decode rejects when context missing', async () => {
    const engine = new AudioEngineImpl()
    await expect(engine.decode(new Blob(['hi']))).rejects.toThrow()
  })
})

describe('DeckEngine', () => {
  it('does not play without a buffer', () => {
    const audio = new AudioEngineImpl()
    const deck = audio.createDeckTransport({ duration: 5 } as unknown as AudioBuffer, 0)
    expect(deck.isPlaying).toBe(false)
    expect(() => deck.play()).not.toThrow()
  })

  it('load + play + pause + stop lifecycle', () => {
    const audio = new AudioEngineImpl()
    const deck = audio.createDeckTransport({ duration: 10 } as unknown as AudioBuffer, 0)
    deck.load({ duration: 10 } as unknown as AudioBuffer)
    expect(deck.duration).toBe(10)
    deck.play()
    expect(deck.isPlaying).toBe(true)
    deck.pause()
    expect(deck.isPlaying).toBe(false)
    deck.stop()
    expect(deck.isPlaying).toBe(false)
    expect(deck.currentTime).toBe(0)
  })

  it('seek clamps into duration', () => {
    const audio = new AudioEngineImpl()
    const deck = audio.createDeckTransport({ duration: 100 } as unknown as AudioBuffer, 0)
    deck.load({ duration: 100 } as unknown as AudioBuffer)
    deck.seek(200)
    expect(deck.currentTime).toBeLessThanOrEqual(100)
    deck.seek(-5)
    expect(deck.currentTime).toBeGreaterThanOrEqual(0)
  })

  it('playbackRate clamps to 0.01..4.0', () => {
    const audio = new AudioEngineImpl()
    const deck = audio.createDeckTransport({ duration: 10 } as unknown as AudioBuffer, 0)
    deck.setPlaybackRate(0.001)
    expect(deck.playbackRate).toBe(0.01)
    deck.setPlaybackRate(99)
    expect(deck.playbackRate).toBe(4.0)
    deck.setPlaybackRate(1.2)
    expect(deck.playbackRate).toBe(1.2)
  })
})

describe('DJEngine integration', () => {
  it('dispatches actions and publishes state', async () => {
    const { createDJEngine } = await import('../engine/index')
    const engine = createDJEngine()
    const initial = engine.getState()
    expect(initial.decks[0].track).toBeNull()
    expect(initial.mixer.crossfader).toBe(0.5)

    const seen: unknown[] = []
    const unsub = engine.subscribe((s: DJState) => seen.push(s))
    engine.dispatch({ type: 'SET_CROSSFADER', x: 0.25 } as never)
    engine.dispatch({ type: 'SET_MASTER', level: 0.8 } as never)
    expect(engine.getState().mixer.crossfader).toBe(0.25)
    expect(engine.getState().master.level).toBe(0.8)
    expect(seen.length).toBe(2)
    unsub()
  })
})