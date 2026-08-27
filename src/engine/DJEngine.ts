import { getAudioEngine, SamplerEngine, SAMPLER_SLOT_COUNT } from '../audio'
import { DeckEngine } from '../audio/DeckEngine'
import { EffectsEngine } from '../audio/effects/EffectsEngine'
import { beatToSeconds, resolveFxBpm, smartFaderEqMapping } from '../audio/effects/math'
import { BEAT_MULTIPLIERS } from '../audio/effects/types'
import { analyzeTrack, nextGeneration } from '../analysis/TrackAnalyzer'
import type { TrackAnalysis } from '../analysis/analysisTypes'
import {
  canSync,
  calculateSyncRate,
  rateToTempoPercent,
  syncExceedsRange,
  calculatePhaseError,
  calculatePhaseAlignPosition,
  createAutoLoop,
  halveLoop,
  doubleLoop,
  wrapLoopPosition,
  calculateBeatJumpPosition,
  shiftLoopByBeats,
  createSyncState,
  createLoopState,
  quantizeToBeat,
} from '../analysis/beatEngine'
import {
  Action,
  ChannelMixerState,
  DeckAnalysisState,
  DeckState,
  DJState,
  DJEngineHandle,
  FXState,
  HotCue,
  JogState,
  MasterState,
  MixerState,
  SamplerState,
  SamplerSlotState,
  ScratchState,
  TempoRange,
  Unsubscribe,
  WaveformCache,
} from '../types'

type Listener = (state: DJState) => void

const METER_POLL_MS = 100

const TEMPO_RANGES: TempoRange[] = [6, 10, 16, 100]

/** Beat loop pad mapping: pad index → loop length in beats */
const BEAT_LOOP_MAP = [0.25, 0.5, 1, 2, 4, 8, 16, 32]

/** Beat jump pad mapping: pad index → jump amount in beats */
const BEAT_JUMP_MAP = [-1, 1, -2, 2, -4, 4, -8, 8]

/** Convert tempoPercent to playbackRate */
function tempoToRate(percent: number): number {
  return 1 + percent / 100
}

/** Clamp tempoPercent to the given range */
function clampTempo(percent: number, range: TempoRange): number {
  return Math.max(-range, Math.min(range, percent))
}

/** Calculate effective BPM from sourceBpm and playbackRate */
function calcEffectiveBpm(sourceBpm: number | null, rate: number): number | null {
  if (sourceBpm === null || sourceBpm <= 0) return null
  return Math.round(sourceBpm * rate * 10) / 10
}

/** Resolve effective source BPM from analysis/manual override */
function resolveSourceBpmLocal(analysis: DeckAnalysisState): number | null {
  if (analysis.manualBpm !== null && analysis.manualBpm > 0) {
    return analysis.manualBpm
  }
  return analysis.analyzedBpm
}

/** Create empty hot cue array */
function createHotCues(): HotCue[] {
  return Array.from({ length: 8 }, (_, i) => ({
    index: i,
    positionSeconds: 0,
    active: false,
  }))
}

/** Create initial sampler slot state */
function createSamplerSlotState(index: number): SamplerSlotState {
  return { index, loaded: false, name: null, durationSeconds: null, playing: false }
}

/** Create initial sampler state */
function createSamplerState(): SamplerState {
  return {
    slots: [
      createSamplerSlotState(0), createSamplerSlotState(1),
      createSamplerSlotState(2), createSamplerSlotState(3),
      createSamplerSlotState(4), createSamplerSlotState(5),
      createSamplerSlotState(6), createSamplerSlotState(7),
    ],
    gain: 0.7,
  }
}

function createFxState(): FXState {
  return {
    beatFx: { enabled: false, type: 'ECHO', target: 'A', beatMultiplierIndex: 4, levelDepth: 0.5 },
    releaseFx: { type: 'ECHO_OUT', active: false },
    smartCfx: [
      { enabled: false, value: 0 },
      { enabled: false, value: 0 },
    ],
    smartFader: { enabled: false, transitionDirection: null },
  }
}

export function createDJEngine(): DJEngineHandle {
  const audio = getAudioEngine()
  const decks: [DeckEngine, DeckEngine] = [
    new DeckEngine({ audio, deck: 0 }),
    new DeckEngine({ audio, deck: 1 }),
  ]
  const sampler = new SamplerEngine({ audio })

  // M9: Effects engine (created lazily on first audio context)
  let effectsEngine: EffectsEngine | null = null

  function ensureEffectsEngine(): EffectsEngine {
    if (effectsEngine) return effectsEngine
    effectsEngine = new EffectsEngine({
      ctx: audio.context,
      getDeckOutput: (deck) => audio.getDeckOutput(deck),
      getMasterInput: () => audio.getMasterInput(),
    })
    return effectsEngine
  }

  const state: DJState = {
    decks: [createDeckState(0), createDeckState(1)],
    mixer: createMixerState(),
    master: { level: 1.0 },
    sampler: createSamplerState(),
    shiftPressed: false,
    fx: createFxState(),
  }

  const waveformCache: WaveformCache = {}
  const listeners: Listener[] = []
  let raf: number | null = null
  let meterTimer: number | null = null

  function publish(): void {
    for (const l of listeners) l(state)
  }

  function startTicker(): void {
    if (raf) return
    const tick = () => {
      state.decks[0].position = decks[0].currentTime
      state.decks[1].position = decks[1].currentTime
      _checkLoopWrap(0)
      _checkLoopWrap(1)
      // Sync sampler playing state
      for (let i = 0; i < SAMPLER_SLOT_COUNT; i++) {
        state.sampler.slots[i].playing = sampler.isSlotPlaying(i)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  function _stopTicker(): void {
    if (raf) { cancelAnimationFrame(raf); raf = null }
  }

  function startMeterPoll(): void {
    if (meterTimer) return
    const poll = () => {
      state.mixer.channels[0].meter = audio.getMeterPeak(0)
      state.mixer.channels[1].meter = audio.getMeterPeak(1)
    }
    poll()
    meterTimer = window.setInterval(poll, METER_POLL_MS)
  }

  function _stopMeterPoll(): void {
    if (meterTimer) { window.clearInterval(meterTimer); meterTimer = null }
  }

  function createDeckState(id: 0 | 1): DeckState {
    return {
      id,
      track: null,
      isPlaying: false,
      isPaused: true,
      cuePoint: null,
      position: 0,
      duration: 0,
      trimDb: 0,
      channelFader: 1.0,
      playbackRate: 1.0,
      tempoPercent: 0,
      tempoRange: 10,
      originalBpm: null,
      effectiveBpm: null,
      nudging: null,
      jog: createJogState(),
      scratch: createScratchState(),
      analysis: createAnalysisState(),
      sync: createSyncState(),
      loop: createLoopState(),
      padMode: 'HOT_CUE',
      hotCues: createHotCues(),
    }
  }

  function createChannelMixer(): ChannelMixerState {
    return {
      trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0,
      filter: 0, channelFader: 1.0, meter: 0,
    }
  }

  function createMixerState(): MixerState {
    return {
      channels: [createChannelMixer(), createChannelMixer()],
      crossfader: 0.5, master: 1.0,
    }
  }

  function syncDeck(index: 0 | 1): void {
    const d = decks[index]
    const s = state.decks[index]
    s.track = d.currentTrack
    s.isPlaying = d.isPlaying
    s.isPaused = !d.isPlaying
    s.cuePoint = d.cue
    s.position = d.currentTime
    s.duration = d.duration
    s.playbackRate = d.playbackRate
    s.nudging = d.nudging
    const sourceBpm = resolveSourceBpmLocal(s.analysis)
    s.originalBpm = sourceBpm
    s.effectiveBpm = calcEffectiveBpm(sourceBpm, d.playbackRate)
  }

  // ── M7 Loop wrapping ──────────────────────────────────────────

  function _checkLoopWrap(deckIndex: 0 | 1): void {
    const s = state.decks[deckIndex]
    const d = decks[deckIndex]
    const loop = s.loop
    if (!loop.active || !d.isPlaying) return
    if (loop.startSeconds === null || loop.endSeconds === null) return
    const pos = d.currentTime
    if (pos >= loop.endSeconds - 0.01) {
      const wrapped = wrapLoopPosition(pos, loop)
      if (wrapped !== null) {
        d.seek(wrapped)
        s.position = wrapped
      }
    }
  }

  // ── M6 Analysis ────────────────────────────────────────────────

  function triggerAnalysis(deckIndex: 0 | 1, trackId: string, generation: number): void {
    const d = decks[deckIndex]
    const s = state.decks[deckIndex]
    const buf = d.currentTrack?.buffer
    if (!buf) return
    s.analysis.status = 'analyzing'
    try {
      const result: TrackAnalysis = analyzeTrack(buf)
      if (s.analysis.generation !== generation) return
      waveformCache[trackId] = result.waveform
      s.analysis.status = 'ready'
      s.analysis.analyzedBpm = result.bpm
      s.analysis.bpmConfidence = result.bpmConfidence
      s.analysis.waveformReady = true
      s.analysis.beatGridReady = result.beatGrid !== null
      s.analysis.beatGrid = result.beatGrid
      const sourceBpm = resolveSourceBpmLocal(s.analysis)
      s.originalBpm = sourceBpm
      s.effectiveBpm = calcEffectiveBpm(sourceBpm, d.playbackRate)
    } catch {
      if (s.analysis.generation !== generation) return
      s.analysis.status = 'failed'
    }
  }

  function handleManualBPM(deckIndex: 0 | 1, bpm: number | null): void {
    const s = state.decks[deckIndex]
    s.analysis.manualBpm = bpm
    const duration = s.duration
    if (bpm !== null && bpm > 0 && duration > 0) {
      const existingGrid = s.analysis.beatGrid
      const anchor = existingGrid?.firstBeatSeconds ?? 0
      const interval = 60 / bpm
      const beats: number[] = []
      let t = anchor
      while (t >= 0) { beats.push(Math.max(0, Math.min(duration, t))); t -= interval }
      beats.reverse()
      t = anchor + interval
      while (t <= duration + interval * 0.01) { beats.push(Math.max(0, Math.min(duration, t))); t += interval }
      const unique = [...new Set(beats.map((b) => Math.round(b * 1000) / 1000))]
        .sort((a, b) => a - b).filter((b) => b >= 0 && b <= duration)
      s.analysis.beatGrid = { bpm, firstBeatSeconds: anchor, beats: unique }
      s.analysis.beatGridReady = true
    } else if (bpm === null) {
      const duration2 = s.duration
      if (s.analysis.analyzedBpm !== null && duration2 > 0) {
        const anchor = s.analysis.beatGrid?.firstBeatSeconds ?? 0
        const interval = 60 / s.analysis.analyzedBpm
        const beats2: number[] = []
        let t2 = anchor
        while (t2 >= 0) { beats2.push(Math.max(0, Math.min(duration2, t2))); t2 -= interval }
        beats2.reverse()
        t2 = anchor + interval
        while (t2 <= duration2 + interval * 0.01) { beats2.push(Math.max(0, Math.min(duration2, t2))); t2 += interval }
        const unique2 = [...new Set(beats2.map((b) => Math.round(b * 1000) / 1000))]
          .sort((a, b) => a - b).filter((b) => b >= 0 && b <= duration2)
        s.analysis.beatGrid = { bpm: s.analysis.analyzedBpm, firstBeatSeconds: anchor, beats: unique2 }
      }
    }
    const sourceBpm = resolveSourceBpmLocal(s.analysis)
    s.originalBpm = sourceBpm
    s.effectiveBpm = calcEffectiveBpm(sourceBpm, decks[deckIndex].playbackRate)
  }

  function handleCueDown(deckIndex: 0 | 1): void {
    const d = decks[deckIndex]
    const s = state.decks[deckIndex]
    if (s.scratch.active) handleScratchEnd(deckIndex)
    if (!d.isPlaying) {
      const pos = d.currentTime
      d.setCue(pos)
      s.cuePoint = pos
    } else {
      const cuePos = d.cue
      if (cuePos !== null) d.seek(cuePos)
      else { const pos = d.currentTime; d.setCue(pos); s.cuePoint = pos; d.seek(pos) }
      d.pause()
    }
  }

  function handleCueUp(_deckIndex: 0 | 1): void {}

  function handleScratchStart(deckIndex: 0 | 1): void {
    const d = decks[deckIndex]
    const s = state.decks[deckIndex]
    const sc = s.scratch
    sc.wasPlayingBeforeScratch = d.isPlaying
    sc.active = true; sc.direction = null; sc.velocity = 0
    const pos = d.startScratch()
    sc.currentPosition = pos
    d.stopNudge(); s.nudging = null
    syncDeck(deckIndex)
  }

  function handleScratchMove(deckIndex: 0 | 1, deltaRadians: number, velocity: number, direction: 'forward' | 'backward' | null): void {
    const d = decks[deckIndex]
    const sc = state.decks[deckIndex].scratch
    if (!sc.active) return
    sc.direction = direction; sc.velocity = velocity
    d.moveScratch(deltaRadians, velocity)
    sc.currentPosition = d.currentTime
    state.decks[deckIndex].position = sc.currentPosition
  }

  function handleScratchEnd(deckIndex: 0 | 1): void {
    const d = decks[deckIndex]
    const s = state.decks[deckIndex]
    const sc = s.scratch
    if (!sc.active) return
    const finalPos = d.endScratch()
    sc.currentPosition = finalPos; sc.active = false; sc.direction = null; sc.velocity = 0
    if (sc.wasPlayingBeforeScratch) d.resumeAfterScratch()
    syncDeck(deckIndex)
  }

  // ── M7 Sync ────────────────────────────────────────────────────

  function handleToggleBeatSync(deckIndex: 0 | 1): void {
    const s = state.decks[deckIndex]
    const sync = s.sync
    const sourceBpm = resolveSourceBpmLocal(s.analysis)
    const otherIndex = deckIndex === 0 ? 1 as 0 | 1 : 0 as 0 | 1
    const otherState = state.decks[otherIndex]
    const otherBpm = resolveSourceBpmLocal(otherState.analysis)
    if (sync.enabled) {
      sync.enabled = false; sync.isMaster = false; sync.targetBpm = null; sync.phaseErrorSeconds = null
      return
    }
    if (sync.isMaster) { sync.enabled = true; sync.targetBpm = sourceBpm; return }
    if (otherState.sync.isMaster && canSync(sourceBpm, otherBpm)) {
      sync.enabled = true; sync.isMaster = false; sync.masterDeck = otherIndex
      const masterEffectiveBpm = otherBpm
      if (masterEffectiveBpm !== null && sourceBpm !== null) {
        const requiredRate = calculateSyncRate(masterEffectiveBpm, sourceBpm)
        const requiredTempo = rateToTempoPercent(requiredRate)
        if (syncExceedsRange(requiredTempo, s.tempoRange)) { sync.enabled = false; sync.targetBpm = null; return }
        sync.targetBpm = masterEffectiveBpm
        s.tempoPercent = clampTempo(requiredTempo, s.tempoRange)
        decks[deckIndex].applyTempo(tempoToRate(s.tempoPercent))
        const masterGrid = otherState.analysis.beatGrid
        const slaveGrid = s.analysis.beatGrid
        if (masterGrid && slaveGrid) {
          const alignPos = calculatePhaseAlignPosition(masterGrid, slaveGrid, decks[deckIndex].currentTime)
          if (alignPos !== null) { decks[deckIndex].seek(alignPos); s.position = alignPos }
          sync.phaseErrorSeconds = calculatePhaseError(masterGrid, slaveGrid, decks[deckIndex].currentTime)
        }
      }
      syncDeck(deckIndex)
      return
    }
    if (canSync(sourceBpm, otherBpm) || otherBpm === null) {
      sync.enabled = true; sync.isMaster = true; sync.masterDeck = deckIndex; sync.targetBpm = sourceBpm
      otherState.sync.masterDeck = deckIndex
      if (otherState.sync.enabled && !otherState.sync.isMaster) _applySyncToSlave(otherIndex)
    }
  }

  function handleSetSyncMaster(deckIndex: 0 | 1): void {
    const s = state.decks[deckIndex]
    const sourceBpm = resolveSourceBpmLocal(s.analysis)
    if (sourceBpm === null || sourceBpm <= 0) return
    const otherIndex = deckIndex === 0 ? 1 as 0 | 1 : 0 as 0 | 1
    state.decks[otherIndex].sync.isMaster = false
    state.decks[otherIndex].sync.masterDeck = deckIndex
    s.sync.enabled = true; s.sync.isMaster = true; s.sync.masterDeck = deckIndex; s.sync.targetBpm = sourceBpm
    if (state.decks[otherIndex].sync.enabled && !state.decks[otherIndex].sync.isMaster) _applySyncToSlave(otherIndex)
  }

  function _applySyncToSlave(slaveIndex: 0 | 1): void {
    const slave = state.decks[slaveIndex]
    const masterIdx = slave.sync.masterDeck
    if (masterIdx === null) return
    const master = state.decks[masterIdx]
    const slaveSourceBpm = resolveSourceBpmLocal(slave.analysis)
    const masterEffectiveBpm = resolveSourceBpmLocal(master.analysis)
    if (!canSync(slaveSourceBpm, masterEffectiveBpm)) { slave.sync.enabled = false; return }
    const requiredRate = calculateSyncRate(masterEffectiveBpm!, slaveSourceBpm!)
    const requiredTempo = rateToTempoPercent(requiredRate)
    if (syncExceedsRange(requiredTempo, slave.tempoRange)) { slave.sync.enabled = false; return }
    slave.sync.targetBpm = masterEffectiveBpm
    slave.tempoPercent = clampTempo(requiredTempo, slave.tempoRange)
    decks[slaveIndex].applyTempo(tempoToRate(slave.tempoPercent))
    const masterGrid = master.analysis.beatGrid
    const slaveGrid = slave.analysis.beatGrid
    if (masterGrid && slaveGrid) {
      const alignPos = calculatePhaseAlignPosition(masterGrid, slaveGrid, decks[slaveIndex].currentTime)
      if (alignPos !== null) { decks[slaveIndex].seek(alignPos); slave.position = alignPos }
      slave.sync.phaseErrorSeconds = calculatePhaseError(masterGrid, slaveGrid, decks[slaveIndex].currentTime)
    }
    syncDeck(slaveIndex)
  }

  // ── M7 Loop handlers ──────────────────────────────────────────

  function handleLoopIn(deckIndex: 0 | 1): void {
    const s = state.decks[deckIndex]
    const pos = decks[deckIndex].currentTime
    const grid = s.analysis.beatGrid
    s.loop.inPointSeconds = quantizeToBeat(pos, grid) ?? pos
  }

  function handleLoopOut(deckIndex: 0 | 1): void {
    const s = state.decks[deckIndex]
    const loop = s.loop
    const pos = decks[deckIndex].currentTime
    if (loop.inPointSeconds === null) return
    const grid = s.analysis.beatGrid
    const outPos = quantizeToBeat(pos, grid) ?? pos
    if (outPos <= loop.inPointSeconds) return
    const beatInterval = grid && grid.bpm > 0 ? 60 / grid.bpm : 0.5
    const lengthBeats = Math.round((outPos - loop.inPointSeconds) / beatInterval)
    s.loop = { active: true, startSeconds: loop.inPointSeconds, endSeconds: outPos, lengthBeats, inPointSeconds: loop.inPointSeconds }
  }

  function handleLoopExit(deckIndex: 0 | 1): void {
    state.decks[deckIndex].loop = createLoopState()
  }

  function handleLoop4Beat(deckIndex: 0 | 1): void {
    const s = state.decks[deckIndex]
    if (s.loop.active) { s.loop = createLoopState(); return }
    const pos = decks[deckIndex].currentTime
    const newLoop = createAutoLoop(pos, 4, s.analysis.beatGrid, s.duration)
    if (newLoop) s.loop = newLoop
  }

  function handleLoopHalf(deckIndex: 0 | 1): void {
    const s = state.decks[deckIndex]
    if (!s.loop.active) return
    const newLoop = halveLoop(s.loop, s.analysis.beatGrid, s.duration)
    if (newLoop) s.loop = newLoop
  }

  function handleLoopDouble(deckIndex: 0 | 1): void {
    const s = state.decks[deckIndex]
    if (!s.loop.active) return
    const newLoop = doubleLoop(s.loop, s.analysis.beatGrid, s.duration)
    if (newLoop) s.loop = newLoop
  }

  // ── M7 Beat Jump handler ──────────────────────────────────────

  function handleBeatJump(deckIndex: 0 | 1, jumpBeats: number): void {
    const s = state.decks[deckIndex]
    const d = decks[deckIndex]
    const grid = s.analysis.beatGrid
    const duration = s.duration
    if (s.loop.active) {
      const newLoop = shiftLoopByBeats(s.loop, jumpBeats, grid, duration)
      if (newLoop) { s.loop = newLoop }
    }
    const targetPos = calculateBeatJumpPosition(d.currentTime, jumpBeats, grid, duration)
    if (targetPos === null) return
    d.seek(targetPos)
    s.position = targetPos
  }

  // ── M9 Beat FX helpers ──────────────────────────────────────

  function _getFxBpm(): number | null {
    const fx = state.fx.beatFx
    const deckIdx = fx.target === 'A' ? 0 : 1
    const deck = state.decks[deckIdx]
    return resolveFxBpm(deck.analysis.manualBpm, deck.analysis.analyzedBpm)
  }

  function _applyBeatFx(): void {
    const fx = state.fx.beatFx
    const bpm = _getFxBpm()
    if (!bpm || bpm <= 0) return
    const beatTime = beatToSeconds(bpm, fx.beatMultiplierIndex)
    const fxEngine = ensureEffectsEngine()
    fxEngine.enableBeatFx(fx.target, fx.type, beatTime, fx.levelDepth)
  }

  function _disableBeatFx(): void {
    const fx = state.fx.beatFx
    const fxEngine = ensureEffectsEngine()
    fxEngine.disableBeatFx(fx.target, fx.type)
  }

  function _triggerReleaseFx(): void {
    const rfx = state.fx.releaseFx
    if (rfx.type === 'NONE') return
    const fx = state.fx.beatFx
    const bpm = _getFxBpm()
    const beatTime = bpm && bpm > 0 ? beatToSeconds(bpm, fx.beatMultiplierIndex) : 0.5
    rfx.active = true
    const fxEngine = ensureEffectsEngine()
    fxEngine.triggerReleaseFx(fx.target, rfx.type, beatTime)
    setTimeout(() => { rfx.active = false; publish() }, beatTime * 2 * 1000 + 500)
  }

  function _applySmartCfx(deckIndex: 0 | 1): void {
    const sc = state.fx.smartCfx[deckIndex]
    if (!sc.enabled) return
    audio.setFilter(deckIndex, sc.value)
  }

  function _restoreManualEQ(): void {
    for (let i = 0; i < 2; i++) {
      audio.setFilter(i as 0 | 1, state.mixer.channels[i].filter)
    }
  }

  function _applySmartFader(): void {
    const sf = state.fx.smartFader
    if (!sf.enabled) return
    const crossfaderPos = state.mixer.crossfader
    const direction: 'A_TO_B' | 'B_TO_A' = crossfaderPos >= 0.5 ? 'A_TO_B' : 'B_TO_A'
    sf.transitionDirection = direction
    const progress = direction === 'A_TO_B' ? (crossfaderPos - 0.5) * 2 : (0.5 - crossfaderPos) * 2
    const [outgoingLow, incomingLow] = smartFaderEqMapping(progress, direction)
    const outgoingIdx = direction === 'A_TO_B' ? 0 as 0 | 1 : 1 as 0 | 1
    const incomingIdx = direction === 'A_TO_B' ? 1 as 0 | 1 : 0 as 0 | 1
    audio.setEQ(outgoingIdx, 'low', outgoingLow)
    audio.setEQ(incomingIdx, 'low', incomingLow)
  }

  // ── M8 Pad mode routing ───────────────────────────────────────

  function handlePadDown(deckIndex: 0 | 1, padIndex: number): void {
    const s = state.decks[deckIndex]
    const shift = state.shiftPressed

    switch (s.padMode) {
      case 'HOT_CUE':
        handleHotCuePad(deckIndex, padIndex, shift)
        break
      case 'BEAT_LOOP':
        handleBeatLoopPad(deckIndex, padIndex)
        break
      case 'BEAT_JUMP':
        handleBeatJumpPad(deckIndex, padIndex)
        break
      case 'SAMPLER':
        handleSamplerPad(padIndex, shift)
        break
    }
  }

  function handlePadUp(_deckIndex: 0 | 1, _padIndex: number): void {
    // Reserved for future gate behaviors
  }

  // ── M8 Hot Cue handlers ───────────────────────────────────────

  function handleHotCuePad(deckIndex: 0 | 1, padIndex: number, shift: boolean): void {
    if (padIndex < 0 || padIndex > 7) return
    const s = state.decks[deckIndex]
    const d = decks[deckIndex]
    const cue = s.hotCues[padIndex]

    if (shift) {
      // SHIFT + hot cue pad → delete
      s.hotCues[padIndex] = { index: padIndex, positionSeconds: 0, active: false }
      return
    }

    if (!cue.active) {
      // Empty slot → save current position
      const pos = d.currentTime
      s.hotCues[padIndex] = { index: padIndex, positionSeconds: pos, active: true }
    } else {
      // Populated slot → trigger (jump to hot cue position)
      // Exit loop if active (M8 policy: hot cue trigger exits loop)
      if (s.loop.active) {
        s.loop = createLoopState()
      }
      d.seek(cue.positionSeconds)
      s.position = cue.positionSeconds
      // If paused, remain paused. If playing, continue playing.
    }
  }

  // ── M8 Beat Loop pad handler ──────────────────────────────────

  function handleBeatLoopPad(deckIndex: 0 | 1, padIndex: number): void {
    if (padIndex < 0 || padIndex > 7) return
    const s = state.decks[deckIndex]
    const loopLength = BEAT_LOOP_MAP[padIndex]

    // If same active length, exit loop
    if (s.loop.active && s.loop.lengthBeats === loopLength) {
      s.loop = createLoopState()
      return
    }

    // Create loop of corresponding length
    const pos = decks[deckIndex].currentTime
    const grid = s.analysis.beatGrid
    const newLoop = createAutoLoop(pos, loopLength, grid, s.duration)
    if (newLoop) s.loop = newLoop
  }

  // ── M8 Beat Jump pad handler ──────────────────────────────────

  function handleBeatJumpPad(deckIndex: 0 | 1, padIndex: number): void {
    if (padIndex < 0 || padIndex > 7) return
    const jumpBeats = BEAT_JUMP_MAP[padIndex]
    handleBeatJump(deckIndex, jumpBeats)
  }

  // ── M8 Sampler pad handler ────────────────────────────────────

  function handleSamplerPad(padIndex: number, shift: boolean): void {
    if (padIndex < 0 || padIndex >= SAMPLER_SLOT_COUNT) return

    if (shift) {
      // SHIFT + sampler pad → stop
      sampler.stopSlot(padIndex)
      state.sampler.slots[padIndex].playing = false
      return
    }

    const slotInfo = sampler.getSlotInfo(padIndex)
    if (!slotInfo.loaded) return

    // Trigger (retrigger)
    sampler.trigger(padIndex)
    state.sampler.slots[padIndex].playing = true
  }

  // ── M8 Sampler load/unload ────────────────────────────────────

  async function loadSample(slot: number, file: File): Promise<void> {
    if (slot < 0 || slot >= SAMPLER_SLOT_COUNT) return
    try {
      await audio.ensureRunning()
      const buffer = await audio.decode(file)
      sampler.loadSlot(slot, buffer, file.name)
      const info = sampler.getSlotInfo(slot)
      state.sampler.slots[slot] = {
        index: slot,
        loaded: info.loaded,
        name: file.name,
        durationSeconds: info.duration,
        playing: false,
      }
      publish()
    } catch (err) {
      console.error('Failed to load sample:', err)
    }
  }

  // ── Main action handler ────────────────────────────────────────

  function handle(action: Action): void {
    switch (action.type) {
      case 'LOAD_TRACK': {
        const d = decks[action.deck]
        const s = state.decks[action.deck]
        d.load(action.track.buffer, action.track)
        s.scratch.active = false
        s.loop = createLoopState()
        s.sync.enabled = false; s.sync.isMaster = false; s.sync.targetBpm = null; s.sync.phaseErrorSeconds = null
        // M8: reset hot cues on new track
        s.hotCues = createHotCues()
        const gen = nextGeneration()
        s.analysis = createAnalysisState()
        s.analysis.generation = gen
        syncDeck(action.deck)
        triggerAnalysis(action.deck, action.track.id, gen)
        syncDeck(action.deck)
        break
      }
      case 'PLAY': {
        const d = decks[action.deck]
        if (state.decks[action.deck].scratch.active) handleScratchEnd(action.deck)
        d.play()
        syncDeck(action.deck)
        startTicker()
        startMeterPoll()
        break
      }
      case 'PAUSE': {
        const d = decks[action.deck]
        if (state.decks[action.deck].scratch.active) { handleScratchEnd(action.deck); d.pause() }
        else d.pause()
        syncDeck(action.deck)
        break
      }
      case 'STOP': {
        const d = decks[action.deck]
        const sc = state.decks[action.deck].scratch
        if (sc.active) { d.forceStopScratch(); sc.active = false; sc.direction = null; sc.velocity = 0; sc.currentPosition = 0 }
        d.pause(); d.stop()
        syncDeck(action.deck)
        break
      }
      case 'SEEK': {
        const d = decks[action.deck]
        if (state.decks[action.deck].scratch.active) handleScratchEnd(action.deck)
        d.seek(action.seconds)
        syncDeck(action.deck)
        break
      }
      case 'CUE_DOWN': { handleCueDown(action.deck); syncDeck(action.deck); break }
      case 'CUE_UP': { handleCueUp(action.deck); syncDeck(action.deck); break }
      case 'SET_CUE': {
        const d = decks[action.deck]
        d.setCue(action.seconds)
        state.decks[action.deck].cuePoint = d.cue
        break
      }
      case 'RETURN_TO_START': {
        const d = decks[action.deck]
        if (state.decks[action.deck].scratch.active) handleScratchEnd(action.deck)
        d.seek(0)
        syncDeck(action.deck)
        break
      }
      case 'SET_TEMPO': {
        const d = decks[action.deck]
        const s = state.decks[action.deck]
        if (s.scratch.active) break
        s.tempoPercent = clampTempo(action.percent, s.tempoRange)
        d.applyTempo(tempoToRate(s.tempoPercent))
        if (s.sync.enabled && !s.sync.isMaster) { s.sync.enabled = false; s.sync.targetBpm = null; s.sync.phaseErrorSeconds = null }
        syncDeck(action.deck)
        break
      }
      case 'CYCLE_TEMPO_RANGE': {
        const s = state.decks[action.deck]
        if (s.scratch.active) break
        const currentIdx = TEMPO_RANGES.indexOf(s.tempoRange)
        s.tempoRange = TEMPO_RANGES[(currentIdx + 1) % TEMPO_RANGES.length]
        s.tempoPercent = clampTempo(s.tempoPercent, s.tempoRange)
        decks[action.deck].applyTempo(tempoToRate(s.tempoPercent))
        syncDeck(action.deck)
        break
      }
      case 'SET_ORIGINAL_BPM': {
        const s = state.decks[action.deck]
        s.analysis.manualBpm = action.bpm
        s.originalBpm = action.bpm
        s.effectiveBpm = calcEffectiveBpm(action.bpm, state.decks[action.deck].playbackRate)
        break
      }
      case 'SET_MANUAL_BPM': { handleManualBPM(action.deck, action.bpm); break }
      case 'NUDGE_FORWARD_START': {
        if (state.decks[action.deck].scratch.active) break
        decks[action.deck].startNudge('forward')
        syncDeck(action.deck)
        break
      }
      case 'NUDGE_BACKWARD_START': {
        if (state.decks[action.deck].scratch.active) break
        decks[action.deck].startNudge('backward')
        syncDeck(action.deck)
        break
      }
      case 'NUDGE_END': {
        if (state.decks[action.deck].scratch.active) break
        decks[action.deck].stopNudge()
        if (state.decks[action.deck].sync.enabled && !state.decks[action.deck].sync.isMaster) {
          const slaveIdx = action.deck
          const masterIdx = state.decks[slaveIdx].sync.masterDeck
          if (masterIdx !== null) {
            const masterEffectiveBpm = resolveSourceBpmLocal(state.decks[masterIdx].analysis)
            const slaveSourceBpm = resolveSourceBpmLocal(state.decks[slaveIdx].analysis)
            if (canSync(slaveSourceBpm, masterEffectiveBpm)) {
              state.decks[slaveIdx].tempoPercent = clampTempo(rateToTempoPercent(calculateSyncRate(masterEffectiveBpm!, slaveSourceBpm!)), state.decks[slaveIdx].tempoRange)
              decks[slaveIdx].applyTempo(tempoToRate(state.decks[slaveIdx].tempoPercent))
            }
          }
        }
        syncDeck(action.deck)
        break
      }
      case 'JOG_PLATTER_START': {
        const j = state.decks[action.deck].jog
        j.touchingPlatter = true; j.moving = true; j.scratchIntent = true
        handleScratchStart(action.deck)
        break
      }
      case 'JOG_PLATTER_MOVE': {
        const j = state.decks[action.deck].jog
        j.direction = action.direction; j.deltaRadians = action.deltaRadians; j.velocity = action.velocity
        j.accumulatedRotation += action.deltaRadians
        handleScratchMove(action.deck, action.deltaRadians, action.velocity, action.direction)
        break
      }
      case 'JOG_PLATTER_END': {
        const j = state.decks[action.deck].jog
        j.touchingPlatter = false; j.moving = false; j.direction = null; j.deltaRadians = 0; j.velocity = 0; j.scratchIntent = false
        handleScratchEnd(action.deck)
        break
      }
      case 'JOG_RIM_START': { state.decks[action.deck].jog.touchingRim = true; state.decks[action.deck].jog.moving = true; break }
      case 'JOG_RIM_MOVE': {
        const j = state.decks[action.deck].jog
        j.direction = action.direction; j.deltaRadians = action.deltaRadians; j.velocity = action.velocity
        if (!state.decks[action.deck].scratch.active) {
          const d = decks[action.deck]
          if (action.direction === 'forward') d.startNudge('forward')
          else if (action.direction === 'backward') d.startNudge('backward')
          else d.stopNudge()
        }
        syncDeck(action.deck)
        break
      }
      case 'JOG_RIM_END': {
        const j = state.decks[action.deck].jog
        j.touchingRim = false; j.moving = false; j.direction = null; j.deltaRadians = 0; j.velocity = 0
        if (!state.decks[action.deck].scratch.active) decks[action.deck].stopNudge()
        syncDeck(action.deck)
        break
      }
      case 'SCRATCH_START': { handleScratchStart(action.deck); break }
      case 'SCRATCH_MOVE': { handleScratchMove(action.deck, action.deltaRadians, action.velocity, action.direction); break }
      case 'SCRATCH_END': { handleScratchEnd(action.deck); break }
      // M7 sync
      case 'TOGGLE_BEAT_SYNC': { handleToggleBeatSync(action.deck); syncDeck(action.deck); break }
      case 'SET_SYNC_MASTER': { handleSetSyncMaster(action.deck); syncDeck(action.deck); break }
      // M7 loop
      case 'LOOP_IN': { handleLoopIn(action.deck); break }
      case 'LOOP_OUT': { handleLoopOut(action.deck); break }
      case 'LOOP_EXIT': { handleLoopExit(action.deck); break }
      case 'LOOP_4_BEAT': { handleLoop4Beat(action.deck); break }
      case 'LOOP_HALF': { handleLoopHalf(action.deck); break }
      case 'LOOP_DOUBLE': { handleLoopDouble(action.deck); break }
      // M7 beat jump
      case 'BEAT_JUMP': { handleBeatJump(action.deck, action.beats); break }
      // M8 pad mode
      case 'SET_PAD_MODE': { state.decks[action.deck].padMode = action.mode; break }
      case 'PAD_DOWN': { handlePadDown(action.deck, action.padIndex); break }
      case 'PAD_UP': { handlePadUp(action.deck, action.padIndex); break }
      // M8 shift
      case 'SHIFT_DOWN': { state.shiftPressed = true; break }
      case 'SHIFT_UP': { state.shiftPressed = false; break }
      // M8 sampler
      case 'STOP_SAMPLER_SLOT': {
        sampler.stopSlot(action.slot)
        state.sampler.slots[action.slot].playing = false
        break
      }
      case 'UNLOAD_SAMPLER_SLOT': {
        sampler.unloadSlot(action.slot)
        state.sampler.slots[action.slot] = { index: action.slot, loaded: false, name: null, durationSeconds: null, playing: false }
        break
      }
      case 'SET_SAMPLER_GAIN': { state.sampler.gain = Math.max(0, Math.min(1, action.gain)); sampler.setGain(action.gain); break }
      // M1/M2 mixer
      case 'SET_TRIM': { audio.setTrim(action.deck, action.db); state.mixer.channels[action.deck].trimDb = action.db; break }
      case 'SET_EQ_LOW': { audio.setEQ(action.deck, 'low', action.db); state.mixer.channels[action.deck].eqLowDb = action.db; break }
      case 'SET_EQ_MID': { audio.setEQ(action.deck, 'mid', action.db); state.mixer.channels[action.deck].eqMidDb = action.db; break }
      case 'SET_EQ_HIGH': { audio.setEQ(action.deck, 'high', action.db); state.mixer.channels[action.deck].eqHighDb = action.db; break }
      case 'SET_FILTER': {
        audio.setFilter(action.deck, action.p)
        state.mixer.channels[action.deck].filter = action.p
        // M9: manual filter change disables Smart CFX on this deck
        if (state.fx.smartCfx[action.deck].enabled) {
          state.fx.smartCfx[action.deck].enabled = false
          state.fx.smartCfx[action.deck].value = 0
        }
        break
      }
      case 'SET_CHANNEL_FADER': {
        audio.setChannelFader(action.deck, action.fader)
        state.mixer.channels[action.deck].channelFader = action.fader
        state.decks[action.deck].channelFader = action.fader
        break
      }
      case 'SET_CROSSFADER': { state.mixer.crossfader = action.x; audio.setCrossfader(action.x); if (state.fx.smartFader.enabled) _applySmartFader(); break }
      case 'SET_MASTER': { state.master.level = action.level; audio.setMaster(action.level); break }
      case 'SET_PLAYBACK_RATE': {
        if (state.decks[action.deck].scratch.active) break
        decks[action.deck].setPlaybackRate(action.rate)
        syncDeck(action.deck)
        break
      }
      // M9 Beat FX
      case 'SET_BEAT_FX_TYPE': {
        const fx = state.fx.beatFx
        const wasEnabled = fx.enabled
        fx.type = action.fxType
        // If FX was enabled, re-enable with new type
        if (wasEnabled) {
          _applyBeatFx()
        }
        break
      }
      case 'SET_BEAT_FX_TARGET': {
        const fx = state.fx.beatFx
        const wasEnabled = fx.enabled
        fx.target = action.target
        if (wasEnabled) {
          _applyBeatFx()
        }
        break
      }
      case 'SET_BEAT_FX_BEATS': {
        state.fx.beatFx.beatMultiplierIndex = Math.max(0, Math.min(BEAT_MULTIPLIERS.length - 1, action.multiplierIndex))
        if (state.fx.beatFx.enabled) _applyBeatFx()
        break
      }
      case 'SET_BEAT_FX_DEPTH': {
        state.fx.beatFx.levelDepth = Math.max(0, Math.min(1, action.depth))
        if (state.fx.beatFx.enabled) _applyBeatFx()
        break
      }
      case 'TOGGLE_BEAT_FX': {
        const fx = state.fx.beatFx
        fx.enabled = !fx.enabled
        if (fx.enabled) {
          _applyBeatFx()
        } else {
          _disableBeatFx()
        }
        break
      }
      // M9 Release FX
      case 'SET_RELEASE_FX': {
        state.fx.releaseFx.type = action.fxType
        break
      }
      case 'TRIGGER_RELEASE_FX': {
        _triggerReleaseFx()
        break
      }
      // M9 Smart CFX
      case 'TOGGLE_SMART_CFX': {
        const sc = state.fx.smartCfx[action.deck]
        sc.enabled = !sc.enabled
        if (!sc.enabled) {
          // Restore manual CFX value (reset smart value)
          sc.value = 0
        }
        break
      }
      case 'SET_SMART_CFX_VALUE': {
        const sc = state.fx.smartCfx[action.deck]
        if (sc.enabled) {
          sc.value = Math.max(-1, Math.min(1, action.value))
          _applySmartCfx(action.deck)
        }
        break
      }
      // M9 Smart Fader
      case 'TOGGLE_SMART_FADER': {
        state.fx.smartFader.enabled = !state.fx.smartFader.enabled
        if (!state.fx.smartFader.enabled) {
          state.fx.smartFader.transitionDirection = null
          // Restore manual EQ values
          _restoreManualEQ()
        }
        break
      }
    }
    publish()
  }

  return {
    getState: () => state,
    dispatch: (a: Action) => handle(a),
    subscribe: (l: Listener): Unsubscribe => {
      listeners.push(l)
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1) }
    },
    loadTrack: (deck, track) => handle({ type: 'LOAD_TRACK', deck, track }),
    loadSample: (slot, file) => loadSample(slot, file),
    destroy: () => {
      _stopTicker(); _stopMeterPoll()
      sampler.destroy()
      audio.destroy()
    },
  }
}

export function createDeckState(id: 0 | 1): DeckState {
  return {
    id, track: null, isPlaying: false, isPaused: true, cuePoint: null,
    position: 0, duration: 0, trimDb: 0, channelFader: 1.0, playbackRate: 1.0,
    tempoPercent: 0, tempoRange: 10, originalBpm: null, effectiveBpm: null,
    nudging: null, jog: createJogState(), scratch: createScratchState(),
    analysis: createAnalysisState(), sync: createSyncState(), loop: createLoopState(),
    padMode: 'HOT_CUE', hotCues: createHotCues(),
  }
}

export function createMixerState(): MixerState {
  return {
    channels: [
      { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1.0, meter: 0 },
      { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1.0, meter: 0 },
    ],
    crossfader: 0.5, master: 1.0,
  }
}

function createJogState(): JogState {
  return { touchingPlatter: false, touchingRim: false, moving: false, direction: null, deltaRadians: 0, velocity: 0, scratchIntent: false, accumulatedRotation: 0 }
}

function createScratchState(): ScratchState {
  return { active: false, wasPlayingBeforeScratch: false, currentPosition: 0, velocity: 0, direction: null }
}

function createAnalysisState(): DeckAnalysisState {
  return { status: 'idle', analyzedBpm: null, manualBpm: null, effectiveSourceBpm: null, bpmConfidence: null, waveformReady: false, beatGridReady: false, beatGrid: null, generation: 0 }
}

export function createMasterState(): MasterState {
  return { level: 1.0 }
}
