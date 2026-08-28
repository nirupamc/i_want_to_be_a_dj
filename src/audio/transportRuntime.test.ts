import { describe, expect, it } from 'vitest'
import { DeckEngine } from './DeckEngine'
import type { AudioEngine } from './AudioEngine'
import { createDJEngine } from '../engine'
import { createDeckState } from '../engine/DJEngine'
import { formatRemaining, formatTime, getBeatMarkers, resolveDeckBpmLabel } from '../selectors/deckDisplay'

class FakeParam {
  value = 1
  cancelScheduledValues() {}
  setValueAtTime(value: number) { this.value = value }
  linearRampToValueAtTime(value: number) { this.value = value }
}

class FakeSource {
  buffer: AudioBuffer | null = null
  loop = false
  playbackRate = new FakeParam()
  startCalls: Array<{ when: number; offset?: number }> = []
  stopped = false
  onended: (() => void) | null = null
  connect() {}
  disconnect() {}
  start(when: number, offset?: number) { this.startCalls.push({ when, offset }) }
  stop() { this.stopped = true }
}

class RuntimeAudio implements AudioEngine {
  context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createBufferSource: () => {
      const source = new FakeSource()
      this.sources.push(source)
      return source as unknown as AudioBufferSourceNode
    },
  } as unknown as AudioContext

  sources: FakeSource[] = []
  running = true
  ensureCalls = 0
  resumeGate: Promise<void> | null = null
  get isRunning() { return this.running }
  async ensureRunning(): Promise<void> {
    this.ensureCalls += 1
    if (this.resumeGate) await this.resumeGate
    this.running = true
    ;(this.context as unknown as { state: string }).state = 'running'
  }
  async decode(): Promise<AudioBuffer> { throw new Error('unused') }
  createDeckTransport(): never { throw new Error('unused') }
  connectDeckSource(): void {}
  setTrim(): void {}
  setEQ(): void {}
  setFilter(): void {}
  setChannelFader(): void {}
  setCrossfader(): void {}
  setMaster(): void {}
  getMeterPeak(): number { return 0 }
  getMeterRms(): number { return 0 }
  getDeckOutput(): AudioNode { return {} as AudioNode }
  getMasterInput(): GainNode { return { gain: { value: 1 } } as GainNode }
  getRoutingSnapshot() { return { trimGain: 1, channelGain: 1, crossfadeGain: 1, masterGain: 1 } }
  destroy(): void {}
}

function buffer(duration = 10): AudioBuffer {
  return { duration, sampleRate: 44100, numberOfChannels: 2 } as AudioBuffer
}

describe('transport runtime repair', () => {
  it('waits for AudioContext resume before marking play active', async () => {
    let release!: () => void
    const audio = new RuntimeAudio()
    audio.running = false
    audio.resumeGate = new Promise<void>((resolve) => { release = resolve })
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load(buffer())

    const started = deck.play()
    expect(deck.isPlaying).toBe(false)
    release()
    await started

    expect(audio.ensureCalls).toBe(1)
    expect(deck.isPlaying).toBe(true)
    expect(audio.sources).toHaveLength(1)
    expect(audio.sources[0].startCalls[0].offset).toBe(0)
  })

  it('creates a fresh source on resume and preserves offset', async () => {
    const audio = new RuntimeAudio()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load(buffer())
    await deck.play()
    ;(audio.context as unknown as { currentTime: number }).currentTime = 2
    deck.pause()
    await deck.play()

    expect(audio.sources).toHaveLength(2)
    expect(audio.sources[0].stopped).toBe(true)
    expect(audio.sources[1].startCalls[0].offset).toBeCloseTo(2)
  })

  it('advances while playing, freezes on pause, and resets on stop', async () => {
    const audio = new RuntimeAudio()
    const deck = new DeckEngine({ audio, deck: 0 })
    deck.load(buffer())
    await deck.play()
    ;(audio.context as unknown as { currentTime: number }).currentTime = 1
    expect(deck.currentTime).toBeCloseTo(1)
    deck.pause()
    const paused = deck.currentTime
    ;(audio.context as unknown as { currentTime: number }).currentTime = 3
    expect(deck.currentTime).toBeCloseTo(paused)
    deck.stop()
    expect(deck.currentTime).toBe(0)
  })

  it('keeps deck A and B transport independent', async () => {
    const audio = new RuntimeAudio()
    const deckA = new DeckEngine({ audio, deck: 0 })
    const deckB = new DeckEngine({ audio, deck: 1 })
    deckA.load(buffer(10))
    deckB.load(buffer(20))
    await deckA.play()
    ;(audio.context as unknown as { currentTime: number }).currentTime = 1

    expect(deckA.currentTime).toBeCloseTo(1)
    expect(deckB.currentTime).toBe(0)
    expect(deckB.isPlaying).toBe(false)
  })

  it('publishes fresh state objects so waveform selectors see position updates', () => {
    const engine = createDJEngine()
    const seen: unknown[] = []
    engine.subscribe((state) => seen.push(state))
    engine.dispatch({ type: 'SET_MASTER', level: 0.5 })
    engine.dispatch({ type: 'SET_MASTER', level: 0.25 })

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
  })
})

describe('deck display selectors', () => {
  it('formats elapsed and remaining time cleanly', () => {
    expect(formatTime(136)).toBe('02:16')
    expect(formatRemaining(136, 270)).toBe('-02:14')
    expect(formatRemaining(0, 0)).toBe('-00:00')
  })

  it('uses BPM priority manual, analyzed, track, original, unknown', () => {
    const deck = createDeckState(0)
    expect(resolveDeckBpmLabel(deck)).toBe('-')
    deck.originalBpm = 100
    expect(resolveDeckBpmLabel(deck)).toBe('100.0')
    deck.track = { id: 't', name: 'track', duration: 1, buffer: buffer(1), bpm: 110 }
    expect(resolveDeckBpmLabel(deck)).toBe('110.0')
    deck.analysis.analyzedBpm = 120
    expect(resolveDeckBpmLabel(deck)).toBe('120.0')
    deck.analysis.manualBpm = 130
    expect(resolveDeckBpmLabel(deck)).toBe('130.0')
    deck.analysis.status = 'analyzing'
    expect(resolveDeckBpmLabel(deck)).toBe('Analyzing...')
  })

  it('derives minor and every-fourth beat markers from existing beatgrid', () => {
    const deck = createDeckState(0)
    deck.duration = 5
    deck.analysis.beatGrid = { bpm: 120, firstBeatSeconds: 0, beats: [0, 0.5, 1, 1.5, 2, 9] }

    expect(getBeatMarkers(deck)).toEqual([
      { seconds: 0, emphasis: 'strong' },
      { seconds: 0.5, emphasis: 'minor' },
      { seconds: 1, emphasis: 'minor' },
      { seconds: 1.5, emphasis: 'minor' },
      { seconds: 2, emphasis: 'strong' },
    ])
  })
})
