/**
 * SamplerEngine: dedicated sampler layer.
 *
 * Owns 8 sample slots with private AudioBuffer storage.
 * Routes through a dedicated sampler bus → master gain → destination.
 * Independent from deck transport. Supports retrigger and stop.
 *
 * AudioBuffers live privately in this engine, not in serializable state.
 */

import { AudioEngine } from './AudioEngine'

const NUM_SLOTS = 8
const RAMP = 0.02 // seconds for gain ramp

export interface SamplerEngineOptions {
  audio: AudioEngine
}

export class SamplerEngine {
  private audio: AudioEngine
  private buffers: Map<number, AudioBuffer> = new Map()
  private sources: Map<number, AudioBufferSourceNode> = new Map()
  private gainNode: GainNode | null = null
  private _gain = 0.7 // default conservative level

  constructor(opts: SamplerEngineOptions) {
    this.audio = opts.audio
  }

  get gain(): number { return this._gain }

  /**
   * Ensure the sampler bus graph is built.
   * Called lazily on first use.
   */
  private _ensureGraph(): void {
    if (this.gainNode) return
    try {
      const ctx = this.audio.context
      this.gainNode = ctx.createGain()
      this.gainNode.gain.value = this._gain
      this.gainNode.connect(ctx.destination)
    } catch {
      // AudioContext not available (test env)
    }
  }

  /**
   * Load a sample from an AudioBuffer into a slot.
   */
  loadSlot(slot: number, buffer: AudioBuffer, _name: string): void {
    if (slot < 0 || slot >= NUM_SLOTS) return
    // Stop any playing source in this slot
    this.stopSlot(slot)
    this.buffers.set(slot, buffer)
  }

  /**
   * Get metadata for a slot (serializable).
   */
  getSlotInfo(slot: number): { loaded: boolean; name: string | null; duration: number | null } {
    if (slot < 0 || slot >= NUM_SLOTS) return { loaded: false, name: null, duration: null }
    const buf = this.buffers.get(slot)
    if (!buf) return { loaded: false, name: null, duration: null }
    return { loaded: true, name: `Sample ${slot + 1}`, duration: buf.duration }
  }

  /**
   * Trigger (or retrigger) a sample slot.
   * If already playing, stops and restarts from beginning.
   */
  trigger(slot: number): void {
    if (slot < 0 || slot >= NUM_SLOTS) return

    const buffer = this.buffers.get(slot)
    if (!buffer) return

    // Retrigger: stop current source
    this.stopSlot(slot)

    this._ensureGraph()
    if (!this.gainNode) return

    try {
      const ctx = this.audio.context
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = false
      source.connect(this.gainNode)
      source.start(0, 0)

      this.sources.set(slot, source)

      source.onended = () => {
        // Clean up if source ended naturally (not manually stopped)
        if (this.sources.get(slot) === source) {
          this.sources.delete(slot)
        }
      }
    } catch {
      // AudioContext not available
    }
  }

  /**
   * Stop a specific slot.
   */
  stopSlot(slot: number): void {
    const source = this.sources.get(slot)
    if (source) {
      try {
        source.onended = null
        source.stop()
      } catch { /* already stopped */ }
      source.disconnect()
      this.sources.delete(slot)
    }
  }

  /**
   * Unload a slot: stop + remove buffer + clear state.
   */
  unloadSlot(slot: number): void {
    if (slot < 0 || slot >= NUM_SLOTS) return
    this.stopSlot(slot)
    this.buffers.delete(slot)
  }

  /**
   * Set sampler master gain (0..1).
   */
  setGain(gain: number): void {
    this._gain = Math.max(0, Math.min(1, gain))
    if (this.gainNode) {
      try {
        const ctx = this.audio.context
        const now = ctx.currentTime
        this.gainNode.gain.cancelScheduledValues(now)
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now)
        this.gainNode.gain.linearRampToValueAtTime(this._gain, now + RAMP)
      } catch {
        this.gainNode.gain.value = this._gain
      }
    }
  }

  /**
   * Check if a slot is currently playing.
   */
  isSlotPlaying(slot: number): boolean {
    return this.sources.has(slot)
  }

  /**
   * Destroy all active sources and clean up.
   */
  destroy(): void {
    for (let i = 0; i < NUM_SLOTS; i++) {
      this.stopSlot(i)
    }
    this.buffers.clear()
    this.sources.clear()
    this.gainNode = null
  }
}

/** Number of sampler slots */
export const SAMPLER_SLOT_COUNT = NUM_SLOTS
