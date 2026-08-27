import { DeckTransport, Track } from '../types'
import { AudioEngine } from './AudioEngine'
import { scratchDeltaToSeconds, scratchVelocityToRate, clampScratchPosition, SCRATCH_MIN_DELTA } from './scratchMath'

export interface DeckEngineOptions {
  audio: AudioEngine
  deck: 0 | 1
}

// Nudge offsets playback rate temporarily by ±2%
const NUDGE_AMOUNT = 0.02

export class DeckEngine implements DeckTransport {
  readonly id: number
  private audio: AudioEngine
  private buffer: AudioBuffer | null = null
  private track: Track | null = null
  private source: AudioBufferSourceNode | null = null
  private startTime = 0
  private startOffset = 0
  private _isPlaying = false
  private _cue: number | null = null
  private _playbackRate = 1.0
  private _nudging: 'forward' | 'backward' | null = null

  // M5 scratch state
  private _isScratching = false
  private _scratchPosition = 0 // current position during scratch
  private _scratchSource: AudioBufferSourceNode | null = null

  constructor(opts: DeckEngineOptions) {
    this.id = opts.deck
    this.audio = opts.audio
  }

  get isPlaying(): boolean { return this._isPlaying }
  get nudging(): 'forward' | 'backward' | null { return this._nudging }
  get isScratching(): boolean { return this._isScratching }

  get currentTime(): number {
    if (!this.buffer) return 0
    if (this._isScratching) {
      return this._scratchPosition
    }
    if (this._isPlaying) {
      // Rate-aware position: position advances faster when playbackRate > 1
      const effectiveRate = this._getEffectiveRate()
      const elapsed = (this.audio.context.currentTime - this.startTime) * effectiveRate
      return Math.min(this.buffer.duration, this.startOffset + elapsed)
    }
    return this.startOffset
  }

  get duration(): number { return this.buffer ? this.buffer.duration : 0 }
  get cue(): number | null { return this._cue }
  get playbackRate(): number { return this._playbackRate }
  get currentTrack(): Track | null { return this.track }

  /** Effective playback rate including any active nudge offset */
  private _getEffectiveRate(): number {
    if (this._nudging === 'forward') return this._playbackRate + NUDGE_AMOUNT
    if (this._nudging === 'backward') return this._playbackRate - NUDGE_AMOUNT
    return this._playbackRate
  }

  /** Clamp rate to safe range (0.01 to prevent zero/negative) */
  private _clampRate(rate: number): number {
    return Math.max(0.01, Math.min(4.0, rate))
  }

  load(buffer: AudioBuffer, track?: Track): void {
    this.pause()
    this.stop()
    this._stopScratchSource()
    this.buffer = buffer
    this.track = track ?? null
    this.startOffset = 0
    this._cue = null
    this._nudging = null
    this._isScratching = false
    this._scratchPosition = 0
  }

  play(): void {
    if (!this.buffer) return
    if (this._isPlaying) return
    // If scratching, ignore play — scratch owns transport
    if (this._isScratching) return
    this.audio.ensureRunning()
    this._createSource()
    if (!this.source) return
    this.source.start(0, this.startOffset % this.buffer.duration)
    this.startTime = this.audio.context.currentTime
    this._isPlaying = true
  }

  pause(): void {
    if (!this._isPlaying) return
    // Checkpoint position before stopping
    this.startOffset = this.currentTime
    this._stopSource()
    this._isPlaying = false
  }

  stop(): void {
    this.startOffset = 0
    this._stopSource()
    this._isPlaying = false
  }

  seek(seconds: number): void {
    // If scratching, end scratch first
    if (this._isScratching) {
      this._stopScratchSource()
      this._isScratching = false
    }
    const wasPlaying = this._isPlaying
    const clamped = Math.max(0, Math.min(this.duration || Infinity, seconds))
    if (wasPlaying) {
      // Checkpoint current position first
      this.startOffset = this.currentTime
      this._stopSource()
      this.startOffset = clamped
      this._createSource()
      if (this.source && this.buffer) {
        this.source.start(0, clamped % this.buffer.duration)
        this.startTime = this.audio.context.currentTime
      }
    } else {
      this.startOffset = clamped
    }
  }

  setGain(gain: number): void {
    this.audio.setChannelFader(this.id as 0 | 1, gain)
  }

  setPlaybackRate(rate: number): void {
    this._playbackRate = this._clampRate(rate)
    this._updateSourceRate()
  }

  applyTempo(playbackRate: number): void {
    // If scratching, ignore tempo changes — scratch owns transport
    if (this._isScratching) return

    const newRate = this._clampRate(playbackRate)
    if (newRate === this._playbackRate) return

    if (this._isPlaying) {
      const checkpoint = this.currentTime
      this._stopSource()
      this._playbackRate = newRate
      this.startOffset = checkpoint
      this._createSource()
      if (this.source && this.buffer) {
        this.source.start(0, checkpoint % this.buffer.duration)
        this.startTime = this.audio.context.currentTime
      }
    } else {
      this._playbackRate = newRate
    }
  }

  startNudge(direction: 'forward' | 'backward'): void {
    // If scratching, ignore nudge — scratch owns transport
    if (this._isScratching) return

    if (this._nudging === direction) return

    if (this._isPlaying) {
      const checkpoint = this.currentTime
      this._stopSource()
      this.startOffset = checkpoint
      this._nudging = direction
      this._createSource()
      if (this.source && this.buffer) {
        this.source.start(0, checkpoint % this.buffer.duration)
        this.startTime = this.audio.context.currentTime
      }
    } else {
      this._nudging = direction
    }
  }

  stopNudge(): void {
    if (!this._nudging) return

    if (this._isPlaying) {
      const checkpoint = this.currentTime
      this._stopSource()
      this.startOffset = checkpoint
      this._nudging = null
      this._createSource()
      if (this.source && this.buffer) {
        this.source.start(0, checkpoint % this.buffer.duration)
        this.startTime = this.audio.context.currentTime
      }
    } else {
      this._nudging = null
    }
  }

  setCue(seconds: number): void {
    this._cue = Math.max(0, Math.min(this.duration, seconds))
  }

  // ── M5 Scratch Methods ──────────────────────────────────────────

  /**
   * Start scratch mode.
   * Captures whether the deck was playing and the current position.
   * Stops normal playback source. Returns the captured position.
   */
  startScratch(): number {
    if (!this.buffer) return 0
    if (this._isScratching) return this._scratchPosition

    // Capture state before stopping
    const wasPlaying = this._isPlaying
    const position = this.currentTime

    // Stop normal playback
    if (wasPlaying) {
      this._stopSource()
      this._isPlaying = false
    }

    // Clear nudge during scratch
    this._nudging = null

    // Enter scratch mode
    this._isScratching = true
    this._scratchPosition = position

    return position
  }

  /**
   * Move scratch position by angular delta.
   * Updates logical position and creates/maintains scratch preview source.
   */
  moveScratch(deltaRadians: number, velocity: number): void {
    if (!this._isScratching || !this.buffer) return

    // Apply dead zone for audio preview churn
    if (Math.abs(deltaRadians) < SCRATCH_MIN_DELTA) return

    // Convert angular delta to position delta
    const secondsDelta = scratchDeltaToSeconds(deltaRadians)

    // Update logical position
    this._scratchPosition = clampScratchPosition(
      this._scratchPosition + secondsDelta,
      this.duration,
    )

    // Update scratch preview audio
    this._updateScratchPreview(velocity, deltaRadians > 0 ? 'forward' : 'backward')
  }

  /**
   * End scratch mode.
   * Stops scratch preview, persists final position.
   * Returns the final position.
   */
  endScratch(): number {
    if (!this._isScratching) return this._scratchPosition

    // Stop scratch preview source
    this._stopScratchSource()

    // Persist final position as startOffset for potential resume
    this.startOffset = this._scratchPosition
    this._isScratching = false

    return this._scratchPosition
  }

  /**
   * Force-stop scratch (for STOP during scratch).
   * Stops preview and resets position to 0.
   */
  forceStopScratch(): void {
    if (!this._isScratching) return

    this._stopScratchSource()
    this._isScratching = false
    this._scratchPosition = 0
    this.startOffset = 0
  }

  /**
   * Resume normal playback after scratch.
   * Called by DJEngine based on wasPlayingBeforeScratch state.
   */
  resumeAfterScratch(): void {
    if (!this.buffer) return
    if (this._isScratching) return

    this.audio.ensureRunning()
    this._createSource()
    if (!this.source) return
    this.source.start(0, this.startOffset % this.buffer.duration)
    this.startTime = this.audio.context.currentTime
    this._isPlaying = true
  }

  // ── Private scratch helpers ──────────────────────────────────────

  /**
   * Create/update scratch preview source.
   * Creates a short playback snippet at the current scratch position
   * with a velocity-derived playback rate.
   */
  private _updateScratchPreview(
    velocity: number,
    _direction: 'forward' | 'backward',
  ): void {
    if (!this.buffer) return

    // Stop previous scratch preview
    this._stopScratchSource()

    // Guard: only create preview if audio context is available
    try {
      const ctx = this.audio.context
      if (!ctx) return
    } catch {
      return // AudioContext not available (test environment)
    }

    // Calculate preview rate from velocity
    const rate = scratchVelocityToRate(velocity)

    // Create a new short preview source
    this._scratchSource = this.audio.context.createBufferSource()
    this._scratchSource.buffer = this.buffer
    this._scratchSource.loop = false
    this._scratchSource.playbackRate.value = rate
    this.audio.connectDeckSource(this.id as 0 | 1, this._scratchSource)

    // Start from current scratch position
    const offset = this._scratchPosition % this.buffer.duration
    try {
      this._scratchSource.start(0, offset)
    } catch {
      // Source may already be stopped — ignore
    }
  }

  /** Stop and disconnect scratch preview source */
  private _stopScratchSource(): void {
    const source = this._scratchSource
    if (source) {
      try {
        source.onended = null
        source.stop()
      } catch { /* already stopped */ }
      source.disconnect()
      this._scratchSource = null
    }
  }

  // ── Existing source management ───────────────────────────────────

  private _updateSourceRate(): void {
    if (this.source) {
      try {
        this.source.playbackRate.value = this._getEffectiveRate()
      } catch { /* source may be stopped */ }
    }
  }

  private _createSource(): void {
    const buffer = this.buffer
    if (!buffer) return
    this.source = this.audio.context.createBufferSource()
    this.source.buffer = buffer
    this.source.loop = false
    this.source.playbackRate.value = this._getEffectiveRate()
    this.audio.connectDeckSource(this.id as 0 | 1, this.source)
    this.source.onended = () => {
      if (this._isPlaying && this.startOffset + buffer.duration <= this.duration + 0.01) {
        this._isPlaying = false
        this.startOffset = this.duration
      }
    }
  }

  private _stopSource(): void {
    const source = this.source
    if (source) {
      try {
        source.onended = null
        source.stop()
      } catch { /* already stopped */ }
      source.disconnect()
      this.source = null
    }
  }
}
