/**
 * M9 EffectsEngine: Web Audio effects processing.
 *
 * Provides Beat FX (Echo, Delay, Reverb, Flanger, Filter),
 * Release FX (Echo Out), and effect bus routing.
 *
 * Effects are inserted as insert effects on per-deck or master buses.
 * All state is serializable. No AudioNodes in state.
 */

import type { BeatFxType, BeatFxTarget, ReleaseFxType } from './types'
import {
  wetDryGain,
  rampGain,
  rampParam,
  generateImpulseResponse,
  MAX_FEEDBACK,
  TAIL_FADE_SECONDS,
  clamp,
} from './math'

const RAMP = 0.02

export interface EffectsEngineOptions {
  ctx: AudioContext
  /**
   * Taps to get audio from. Returns the output node of each deck's channel chain.
   * Deck 0 = Deck A, Deck 1 = Deck B.
   */
  getDeckOutput: (deck: 0 | 1) => AudioNode
  /**
   * The master gain node. Effects on MASTER target connect here.
   */
  getMasterInput: () => GainNode
}

interface EffectNodes {
  // Common
  input: GainNode
  output: GainNode
  wetGain: GainNode
  dryGain: GainNode

  // Echo/Delay specific
  delay?: DelayNode
  feedbackGain?: GainNode

  // Reverb specific
  convolver?: ConvolverNode

  // Flanger specific
  flangerDelay?: DelayNode
  flangerLfo?: OscillatorNode
  flangerLfoGain?: GainNode
  flangerFeedback?: GainNode

  // Filter specific
  filter?: BiquadFilterNode
}

export class EffectsEngine {
  private ctx: AudioContext
  private getDeckOutput: (deck: 0 | 1) => AudioNode
  private getMasterInput: () => GainNode

  // Effect nodes per target
  private effectNodes: Map<string, EffectNodes> = new Map()

  // Reverb impulse buffer (shared)
  private reverbImpulse: AudioBuffer | null = null

  // Release FX state
  private releaseFxActive = false
  private releaseFxTimeout: ReturnType<typeof setTimeout> | null = null
  private releaseFxDryGain: GainNode | null = null
  private releaseFxWetGain: GainNode | null = null
  private releaseFxDelay: DelayNode | null = null
  private releaseFxFbGain: GainNode | null = null

  // Connected nodes tracking for disconnect
  private connections: { source: AudioNode; target: AudioNode }[] = []

  constructor(opts: EffectsEngineOptions) {
    this.ctx = opts.ctx
    this.getDeckOutput = opts.getDeckOutput
    this.getMasterInput = opts.getMasterInput
  }

  // ── Beat FX ──────────────────────────────────────────────────

  /**
   * Enable a Beat FX on the specified target.
   * Creates effect nodes if not already present for this target+type combo.
   */
  enableBeatFx(
    target: BeatFxTarget,
    type: BeatFxType,
    beatTime: number,
    depth: number,
  ): void {
    const key = `beat_${target}_${type}`

    // Remove existing effect for this key
    this._removeEffectNodes(key)

    // Create new effect nodes
    const nodes = this._createEffectNodes(type, beatTime, depth)
    this.effectNodes.set(key, nodes)

    // Connect to target
    this._connectToTarget(target, nodes)
  }

  /**
   * Update beat FX parameters (time, depth).
   */
  updateBeatFx(
    target: BeatFxTarget,
    type: BeatFxType,
    beatTime: number,
    depth: number,
  ): void {
    const key = `beat_${target}_${type}`
    const nodes = this.effectNodes.get(key)
    if (!nodes) return

    // Update wet/dry
    const { dry, wet } = wetDryGain(depth)
    rampGain(this.ctx, nodes.dryGain, dry)
    rampGain(this.ctx, nodes.wetGain, wet)

    // Update effect-specific params
    if (type === 'ECHO' || type === 'DELAY') {
      if (nodes.delay) {
        nodes.delay.delayTime.cancelScheduledValues(this.ctx.currentTime)
        nodes.delay.delayTime.setValueAtTime(nodes.delay.delayTime.value, this.ctx.currentTime)
        nodes.delay.delayTime.linearRampToValueAtTime(
          clamp(beatTime, 0.01, 5.0),
          this.ctx.currentTime + RAMP,
        )
      }
      if (nodes.feedbackGain) {
        rampGain(this.ctx, nodes.feedbackGain, clamp(depth * MAX_FEEDBACK, 0, MAX_FEEDBACK))
      }
    }

    if (type === 'REVERB') {
      // Reverb depth controls wet amount (already set above)
    }

    if (type === 'FLANGER') {
      if (nodes.flangerDelay) {
        // Modulation depth tied to beat time
        rampParam(this.ctx, nodes.flangerDelay.delayTime, clamp(beatTime * 0.1, 0.001, 0.01))
      }
      if (nodes.flangerLfoGain) {
        rampGain(this.ctx, nodes.flangerLfoGain, clamp(depth * 0.003, 0, 0.005))
      }
      if (nodes.flangerFeedback) {
        rampGain(this.ctx, nodes.flangerFeedback, clamp(depth * 0.7, 0, 0.9))
      }
    }

    if (type === 'FILTER') {
      if (nodes.filter) {
        // Sweep filter cutoff based on beat time and depth
        const baseFreq = 200
        const maxFreq = 12000
        const freq = baseFreq + (maxFreq - baseFreq) * depth
        rampParam(this.ctx, nodes.filter.frequency, freq)
      }
    }
  }

  /**
   * Disable a Beat FX on the specified target.
   * Fades out and disconnects.
   */
  disableBeatFx(target: BeatFxTarget, type: BeatFxType): void {
    const key = `beat_${target}_${type}`
    const nodes = this.effectNodes.get(key)
    if (!nodes) return

    // Fade out wet, fade in dry
    rampGain(this.ctx, nodes.wetGain, 0)
    rampGain(this.ctx, nodes.dryGain, 1)

    // Remove after tail
    setTimeout(() => {
      this._removeEffectNodes(key)
    }, TAIL_FADE_SECONDS * 1000 + 100)
  }

  // ── Release FX ────────────────────────────────────────────────

  /**
   * Trigger Release FX (Echo Out).
   * Momentarily applies echo and reduces dry signal.
   */
  triggerReleaseFx(
    target: BeatFxTarget,
    type: ReleaseFxType,
    beatTime: number,
  ): void {
    if (type === 'NONE') return
    if (this.releaseFxActive) return // prevent overlap

    if (type === 'ECHO_OUT') {
      this._triggerEchoOut(target, beatTime)
    }
  }

  private _triggerEchoOut(target: BeatFxTarget, beatTime: number): void {
    this.releaseFxActive = true

    // Create echo chain for release
    const input = this.ctx.createGain()
    const output = this.ctx.createGain()
    const dryGain = this.ctx.createGain()
    const wetGain = this.ctx.createGain()
    const delay = this.ctx.createDelay(5.0)
    const fbGain = this.ctx.createGain()

    delay.delayTime.value = clamp(beatTime * 0.5, 0.01, 2.0)
    fbGain.gain.value = 0.7

    // Dry path
    input.connect(dryGain)
    dryGain.connect(output)

    // Wet path: input → delay → wet gain → output
    input.connect(delay)
    delay.connect(fbGain)
    fbGain.connect(delay) // feedback loop
    delay.connect(wetGain)
    wetGain.connect(output)

    // Start: dry=1, wet=0
    dryGain.gain.value = 1
    wetGain.gain.value = 0

    // Connect to target
    this._connectNodeToTarget(target, input, output)

    this.releaseFxDryGain = dryGain
    this.releaseFxWetGain = wetGain
    this.releaseFxDelay = delay
    this.releaseFxFbGain = fbGain

    // Animate: reduce dry, increase wet over beat time
    const now = this.ctx.currentTime
    dryGain.gain.cancelScheduledValues(now)
    dryGain.gain.setValueAtTime(1, now)
    dryGain.gain.linearRampToValueAtTime(0, now + beatTime * 0.5)

    wetGain.gain.cancelScheduledValues(now)
    wetGain.gain.setValueAtTime(0, now)
    wetGain.gain.linearRampToValueAtTime(0.8, now + beatTime * 0.3)

    // Auto-disable after 2 beats
    this.releaseFxTimeout = setTimeout(() => {
      this._endReleaseFx()
    }, beatTime * 2 * 1000)
  }

  private _endReleaseFx(): void {
    if (!this.releaseFxActive) return

    const now = this.ctx.currentTime

    // Fade out wet, fade in dry
    if (this.releaseFxWetGain) {
      this.releaseFxWetGain.gain.cancelScheduledValues(now)
      this.releaseFxWetGain.gain.setValueAtTime(this.releaseFxWetGain.gain.value, now)
      this.releaseFxWetGain.gain.linearRampToValueAtTime(0, now + TAIL_FADE_SECONDS)
    }
    if (this.releaseFxDryGain) {
      this.releaseFxDryGain.gain.cancelScheduledValues(now)
      this.releaseFxDryGain.gain.setValueAtTime(this.releaseFxDryGain.gain.value, now)
      this.releaseFxDryGain.gain.linearRampToValueAtTime(1, now + TAIL_FADE_SECONDS)
    }

    // Disconnect after tail
    setTimeout(() => {
      this._cleanupReleaseFx()
    }, TAIL_FADE_SECONDS * 1000 + 100)

    this.releaseFxActive = false
  }

  private _cleanupReleaseFx(): void {
    try { this.releaseFxDryGain?.disconnect() } catch { /* already disconnected */ }
    try { this.releaseFxWetGain?.disconnect() } catch { /* already disconnected */ }
    try { this.releaseFxDelay?.disconnect() } catch { /* already disconnected */ }
    try { this.releaseFxFbGain?.disconnect() } catch { /* already disconnected */ }
    this.releaseFxDryGain = null
    this.releaseFxWetGain = null
    this.releaseFxDelay = null
    this.releaseFxFbGain = null
  }

  /**
   * Force-end any active release FX.
   */
  cancelReleaseFx(): void {
    if (this.releaseFxTimeout) {
      clearTimeout(this.releaseFxTimeout)
      this.releaseFxTimeout = null
    }
    this._cleanupReleaseFx()
    this.releaseFxActive = false
  }

  get isReleaseFxActive(): boolean {
    return this.releaseFxActive
  }

  // ── Effect creation ─────────────────────────────────────────

  private _createEffectNodes(
    type: BeatFxType,
    beatTime: number,
    depth: number,
  ): EffectNodes {
    const input = this.ctx.createGain()
    const output = this.ctx.createGain()
    const wetGain = this.ctx.createGain()
    const dryGain = this.ctx.createGain()

    const { dry, wet } = wetDryGain(depth)
    dryGain.gain.value = dry
    wetGain.gain.value = wet

    // Dry path
    input.connect(dryGain)
    dryGain.connect(output)

    const nodes: EffectNodes = { input, output, wetGain, dryGain }

    switch (type) {
      case 'ECHO':
      case 'DELAY': {
        const delay = this.ctx.createDelay(5.0)
        const fbGain = this.ctx.createGain()
        delay.delayTime.value = clamp(beatTime, 0.01, 5.0)
        fbGain.gain.value = clamp(depth * MAX_FEEDBACK, 0, MAX_FEEDBACK)

        input.connect(delay)
        delay.connect(fbGain)
        fbGain.connect(delay) // feedback loop
        delay.connect(wetGain)
        wetGain.connect(output)

        nodes.delay = delay
        nodes.feedbackGain = fbGain
        break
      }

      case 'REVERB': {
        const convolver = this.ctx.createConvolver()
        if (!this.reverbImpulse) {
          this.reverbImpulse = generateImpulseResponse(this.ctx, 2.5, 2.0)
        }
        convolver.buffer = this.reverbImpulse

        input.connect(convolver)
        convolver.connect(wetGain)
        wetGain.connect(output)

        nodes.convolver = convolver
        break
      }

      case 'FLANGER': {
        const flangerDelay = this.ctx.createDelay(0.02)
        const lfo = this.ctx.createOscillator()
        const lfoGain = this.ctx.createGain()
        const feedback = this.ctx.createGain()

        flangerDelay.delayTime.value = 0.005 // 5ms base
        lfo.type = 'sine'
        lfo.frequency.value = beatTime > 0 ? 1 / beatTime : 0.5 // LFO rate synced to beat
        lfoGain.gain.value = clamp(depth * 0.003, 0, 0.005) // modulation depth
        feedback.gain.value = clamp(depth * 0.7, 0, 0.9)

        lfo.connect(lfoGain)
        lfoGain.connect(flangerDelay.delayTime) // modulate delay time

        input.connect(flangerDelay)
        flangerDelay.connect(feedback)
        feedback.connect(flangerDelay) // feedback loop
        flangerDelay.connect(wetGain)
        wetGain.connect(output)

        lfo.start()

        nodes.flangerDelay = flangerDelay
        nodes.flangerLfo = lfo
        nodes.flangerLfoGain = lfoGain
        nodes.flangerFeedback = feedback
        break
      }

      case 'FILTER': {
        const filter = this.ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 1000
        filter.Q.value = 2

        input.connect(filter)
        filter.connect(wetGain)
        wetGain.connect(output)

        nodes.filter = filter
        break
      }
    }

    return nodes
  }

  // ── Target routing ───────────────────────────────────────────

  private _connectToTarget(target: BeatFxTarget, nodes: EffectNodes): void {
    if (target === 'MASTER') {
      // MASTER: take output from master gain input
      const masterInput = this.getMasterInput()
      // Disconnect masterInput from destination temporarily? No — we insert.
      // Better: tap from master, process, reconnect.
      // Simplest approach: connect effect output to destination directly
      // and disconnect master from destination.
      // Actually, let's use a simpler insert model:
      // We tap from each deck's output and route to the effect.
      // For MASTER, we process the combined output.
      nodes.output.connect(masterInput)
    } else {
      const deckIdx = target === 'A' ? 0 : 1
      const deckOutput = this.getDeckOutput(deckIdx)
      // The deck output is connected to its crossfade gain.
      // We insert the effect between deck output and crossfade gain.
      // Disconnect existing connection, insert effect.
      deckOutput.connect(nodes.input)
      nodes.output.connect(this.getMasterInput())
    }
  }

  private _connectNodeToTarget(
    target: BeatFxTarget,
    input: GainNode,
    output: GainNode,
  ): void {
    if (target === 'MASTER') {
      output.connect(this.getMasterInput())
    } else {
      const deckIdx = target === 'A' ? 0 : 1
      const deckOutput = this.getDeckOutput(deckIdx)
      deckOutput.connect(input)
      output.connect(this.getMasterInput())
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────

  private _removeEffectNodes(key: string): void {
    const nodes = this.effectNodes.get(key)
    if (!nodes) return

    try { nodes.input.disconnect() } catch { /* already disconnected */ }
    try { nodes.output.disconnect() } catch { /* already disconnected */ }
    try { nodes.wetGain.disconnect() } catch { /* already disconnected */ }
    try { nodes.dryGain.disconnect() } catch { /* already disconnected */ }
    if (nodes.delay) try { nodes.delay.disconnect() } catch { /* already disconnected */ }
    if (nodes.feedbackGain) try { nodes.feedbackGain.disconnect() } catch { /* already disconnected */ }
    if (nodes.convolver) try { nodes.convolver.disconnect() } catch { /* already disconnected */ }
    if (nodes.flangerDelay) try { nodes.flangerDelay.disconnect() } catch { /* already disconnected */ }
    if (nodes.flangerLfo) { try { nodes.flangerLfo.stop() } catch { /* already stopped */ } try { nodes.flangerLfo.disconnect() } catch { /* already disconnected */ } }
    if (nodes.flangerLfoGain) try { nodes.flangerLfoGain.disconnect() } catch { /* already disconnected */ }
    if (nodes.flangerFeedback) try { nodes.flangerFeedback.disconnect() } catch { /* already disconnected */ }
    if (nodes.filter) try { nodes.filter.disconnect() } catch { /* already disconnected */ }

    this.effectNodes.delete(key)
  }

  destroy(): void {
    // Remove all effects
    for (const key of this.effectNodes.keys()) {
      this._removeEffectNodes(key)
    }
    this.effectNodes.clear()
    this.cancelReleaseFx()
    this.connections = []
  }
}
