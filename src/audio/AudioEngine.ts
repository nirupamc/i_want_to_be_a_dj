import { DeckEngine } from './DeckEngine'
import { DeckTransport } from '../types'
import {
  dbToGain,
  EQ_GAIN_DB_MAX,
  EQ_GAIN_DB_MIN,
  EQ_FREQ,
  EQ_Q,
  filterCutoffs,
  FILTER_Q,
  TRIM_DB_DEFAULT,
  TRIM_DB_MAX,
  TRIM_DB_MIN,
} from './dsp'

const RAMP = 0.02 // seconds for gain ramp (anti-pop)

export interface AudioEngine {
  readonly context: AudioContext
  readonly isRunning: boolean
  ensureRunning(): Promise<void>
  decode(file: Blob): Promise<AudioBuffer>
  createDeckTransport(buffer: AudioBuffer, deck: 0 | 1): DeckTransport
  connectDeckSource(deck: 0 | 1, source: AudioBufferSourceNode): void
  setTrim(deck: 0 | 1, db: number): void
  setEQ(deck: 0 | 1, band: 'low' | 'mid' | 'high', db: number): void
  setFilter(deck: 0 | 1, p: number): void
  setChannelFader(deck: 0 | 1, fader: number): void
  setCrossfader(x: number): void
  setMaster(level: number): void
  getMeterPeak(deck: 0 | 1): number
  getMeterRms(deck: 0 | 1): number
  /** Get the output node of a deck's channel chain (for FX routing) */
  getDeckOutput(deck: 0 | 1): AudioNode
  /** Get the master gain node (for FX routing) */
  getMasterInput(): GainNode
  getRoutingSnapshot(deck: 0 | 1): {
    trimGain: number
    channelGain: number
    crossfadeGain: number
    masterGain: number
  }
  destroy(): void
}

export class AudioEngineImpl implements AudioEngine {
  private ctx: AudioContext | null = null
  private running = false
  private channelGains: GainNode[] = []
  private crossfadeGains: GainNode[] = []
  private trimGains: GainNode[] = []
  private eqFilters: BiquadFilterNode[][] = []
  private filterNodes: BiquadFilterNode[][] = []
  private analyzers: AnalyserNode[] = []
  private masterGain: GainNode | null = null
  private crossfader = 0.5

  get context(): AudioContext {
    if (!this.ctx) throw new Error('AudioContext not created - call ensureRunning() first')
    return this.ctx
  }
  get isRunning(): boolean { return this.running }

  async ensureRunning(): Promise<void> {
    if (this.ctx && this.running) return
    const before = this.ctx?.state ?? 'none'
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)()
      this._buildGraph()
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    this.running = this.ctx.state === 'running'
    if (!this.running) {
      throw new Error(`AudioContext is ${this.ctx.state}; resume from ${before} did not start audio`)
    }
  }

  private _buildGraph(): void {
    const ctx = this.ctx!
    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 1.0
    this.masterGain.connect(ctx.destination)

    for (let d = 0; d < 2; d++) {
      // Deck source -> analyser (pre everything, for input metering)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.5
      this.analyzers[d] = analyser

      // TRIM (pre-fader gain, dB)
      const trimGain = ctx.createGain()
      trimGain.gain.value = dbToGain(TRIM_DB_DEFAULT)
      analyser.connect(trimGain)

      // 3-band EQ: lowshelf -> peaking -> highshelf
      const low = ctx.createBiquadFilter()
      low.type = 'lowshelf'
      low.frequency.value = EQ_FREQ.LOW
      low.Q.value = EQ_Q.LOW
      low.gain.value = 0
      const mid = ctx.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = EQ_FREQ.MID
      mid.Q.value = EQ_Q.MID
      mid.gain.value = 0
      const high = ctx.createBiquadFilter()
      high.type = 'highshelf'
      high.frequency.value = EQ_FREQ.HIGH
      high.Q.value = EQ_Q.HIGH
      high.gain.value = 0
      trimGain.connect(low)
      low.connect(mid)
      mid.connect(high)

      // CFX / color filter: series lowpass + highpass biquads.
      // At center both are effectively open (LPF at max, HPF at min).
      const lpf = ctx.createBiquadFilter()
      lpf.type = 'lowpass'
      lpf.frequency.value = 16000
      lpf.Q.value = FILTER_Q
      const hpf = ctx.createBiquadFilter()
      hpf.type = 'highpass'
      hpf.frequency.value = 80
      hpf.Q.value = FILTER_Q
      high.connect(lpf)
      lpf.connect(hpf)

      // Channel fader -> crossfade gain -> master gain -> destination
      const chanGain = ctx.createGain()
      chanGain.gain.value = 1.0
      hpf.connect(chanGain)
      const cfGain = ctx.createGain()
      cfGain.gain.value = 1.0
      chanGain.connect(cfGain)
      cfGain.connect(this.masterGain)

      this.trimGains[d] = trimGain
      this.eqFilters[d] = [low, mid, high]
      this.filterNodes[d] = [lpf, hpf]
      this.channelGains[d] = chanGain
      this.crossfadeGains[d] = cfGain
    }
    this._applyCrossfade()
  }

  async decode(file: Blob): Promise<AudioBuffer> {
    await this.ensureRunning()
    const buf = await file.arrayBuffer()
    return this.ctx!.decodeAudioData(buf)
  }

  createDeckTransport(buffer: AudioBuffer, deck: 0 | 1): DeckTransport {
    return new DeckEngine({ audio: this, deck })
  }

  connectDeckSource(deck: 0 | 1, source: AudioBufferSourceNode): void {
    source.connect(this.analyzers[deck])
  }

  private _ramp(node: GainNode | null, target: number): void {
    if (!this.ctx || !node) return
    const now = this.ctx.currentTime
    node.gain.cancelScheduledValues(now)
    node.gain.setValueAtTime(node.gain.value, now)
    node.gain.linearRampToValueAtTime(Math.max(0, target), now + RAMP)
  }

  private _rampParam(param: AudioParam, target: number): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(target, now + RAMP)
  }

  private _applyCrossfade(): void {
    if (this.crossfadeGains.length === 0) return
    const x = this.crossfader
    const gainA = Math.cos((x * Math.PI) / 2)
    const gainB = Math.sin((x * Math.PI) / 2)
    this._ramp(this.crossfadeGains[0], gainA)
    this._ramp(this.crossfadeGains[1], gainB)
  }

  setTrim(deck: 0 | 1, db: number): void {
    const clamped = Math.max(TRIM_DB_MIN, Math.min(TRIM_DB_MAX, db))
    this._ramp(this.trimGains[deck] ?? null, dbToGain(clamped))
  }

  setEQ(deck: 0 | 1, band: 'low' | 'mid' | 'high', db: number): void {
    const filters = this.eqFilters[deck]
    if (!filters || !this.ctx) return
    const idx = band === 'low' ? 0 : band === 'mid' ? 1 : 2
    const clamped = Math.max(EQ_GAIN_DB_MIN, Math.min(EQ_GAIN_DB_MAX, db))
    this._rampParam(filters[idx].gain, clamped)
  }

  setFilter(deck: 0 | 1, p: number): void {
    const nodes = this.filterNodes[deck]
    if (!nodes) return
    const [lpf, hpf] = nodes
    const [lpfCutoff, hpfCutoff] = filterCutoffs(p)
    this._rampParam(lpf.frequency, lpfCutoff)
    this._rampParam(hpf.frequency, hpfCutoff)
  }

  setChannelFader(deck: 0 | 1, fader: number): void {
    this._ramp(this.channelGains[deck] ?? null, Math.max(0, Math.min(1, fader)))
  }

  setCrossfader(x: number): void {
    this.crossfader = Math.max(0, Math.min(1, x))
    this._applyCrossfade()
  }

  setMaster(level: number): void {
    this._ramp(this.masterGain, Math.max(0, Math.min(1, level)))
  }

  getMeterPeak(deck: 0 | 1): number {
    const analyser = this.analyzers[deck]
    if (!analyser || !this.ctx) return 0
    const bins = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(bins)
    let peak = 0
    for (let i = 0; i < bins.length; i++) {
      const v = Math.abs(bins[i] - 128) / 128
      if (v > peak) peak = v
    }
    return Math.max(0, Math.min(1, peak))
  }

  getMeterRms(deck: 0 | 1): number {
    const analyser = this.analyzers[deck]
    if (!analyser || !this.ctx) return 0
    const bins = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(bins)
    let sum = 0
    for (let i = 0; i < bins.length; i++) {
      const v = (bins[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / bins.length)
    return Math.max(0, Math.min(1, rms))
  }

  getDeckOutput(deck: 0 | 1): AudioNode {
    // Return the crossfade gain node as the deck output
    return this.crossfadeGains[deck]
  }

  getMasterInput(): GainNode {
    return this.masterGain!
  }

  getRoutingSnapshot(deck: 0 | 1): { trimGain: number; channelGain: number; crossfadeGain: number; masterGain: number } {
    return {
      trimGain: this.trimGains[deck]?.gain.value ?? 0,
      channelGain: this.channelGains[deck]?.gain.value ?? 0,
      crossfadeGain: this.crossfadeGains[deck]?.gain.value ?? 0,
      masterGain: this.masterGain?.gain.value ?? 0,
    }
  }

  destroy(): void {
    this.channelGains = []
    this.crossfadeGains = []
    this.trimGains = []
    this.eqFilters = []
    this.filterNodes = []
    this.analyzers = []
    if (this.ctx) { try { this.ctx.close() } catch { /* ignore */ } this.ctx = null }
    this.running = false
  }
}

let singleton: AudioEngineImpl | null = null

export function getAudioEngine(): AudioEngine {
  if (!singleton) singleton = new AudioEngineImpl()
  return singleton
}
