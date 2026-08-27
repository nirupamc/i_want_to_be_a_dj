export interface Track {
  id: string
  name: string
  buffer: AudioBuffer
  duration: number
}

// Tempo range in percent: ±6%, ±10%, ±16%, or WIDE (±100%)
export type TempoRange = 6 | 10 | 16 | 100

// M6 analysis types (re-exported from analysis module)
export type AnalysisStatus = 'idle' | 'analyzing' | 'ready' | 'failed'

export interface DeckAnalysisState {
  status: AnalysisStatus
  analyzedBpm: number | null
  manualBpm: number | null
  effectiveSourceBpm: number | null
  bpmConfidence: number | null
  waveformReady: boolean
  beatGridReady: boolean
  beatGrid: {
    bpm: number
    firstBeatSeconds: number
    beats: number[]
  } | null
  generation: number
}

export interface WaveformData {
  sampleRate: number
  pointsPerSecond: number
  peaks: number[]
  rms?: number[]
}

// M7 sync state
export interface SyncState {
  enabled: boolean
  isMaster: boolean
  masterDeck: 0 | 1 | null
  targetBpm: number | null
  phaseErrorSeconds: number | null
}

// M7 loop state
export interface LoopState {
  active: boolean
  startSeconds: number | null
  endSeconds: number | null
  lengthBeats: number | null
  inPointSeconds: number | null
}

// M8 pad mode
export type PadMode = 'HOT_CUE' | 'BEAT_LOOP' | 'BEAT_JUMP' | 'SAMPLER'

// M8 hot cue slot
export interface HotCue {
  index: number
  positionSeconds: number
  active: boolean
}

// M8 pad visual state
export type PadVisualState = 'OFF' | 'AVAILABLE' | 'ACTIVE' | 'PLAYING' | 'SELECTED'

// M8 sampler slot (serializable metadata only)
export interface SamplerSlotState {
  index: number
  loaded: boolean
  name: string | null
  durationSeconds: number | null
  playing: boolean
}

export interface DeckState {
  id: 0 | 1
  track: Track | null
  isPlaying: boolean
  isPaused: boolean
  cuePoint: number | null // seconds, primary cue point
  position: number // seconds
  duration: number // seconds
  trimDb: number // dB, -70..+9, 0 = unity
  channelFader: number // 0..1
  playbackRate: number // computed from tempo
  // M3 tempo model
  tempoPercent: number // -100..+100 (offset from 100%)
  tempoRange: TempoRange // ±6%, ±10%, ±16%, WIDE(±100%)
  originalBpm: number | null // known BPM from metadata/analysis
  effectiveBpm: number | null // originalBpm * playbackRate
  // M3 nudge
  nudging: 'forward' | 'backward' | null
  // M4 jog state
  jog: JogState
  // M5 scratch state
  scratch: ScratchState
  // M6 analysis state
  analysis: DeckAnalysisState
  // M7 sync state
  sync: SyncState
  // M7 loop state
  loop: LoopState
  // M8 pad state
  padMode: PadMode
  hotCues: HotCue[]
}

export interface JogState {
  touchingPlatter: boolean
  touchingRim: boolean
  moving: boolean
  direction: 'forward' | 'backward' | null
  deltaRadians: number
  velocity: number
  scratchIntent: boolean
  accumulatedRotation: number
}

export interface ScratchState {
  active: boolean
  wasPlayingBeforeScratch: boolean
  currentPosition: number
  velocity: number
  direction: 'forward' | 'backward' | null
}

export interface ChannelMixerState {
  trimDb: number
  eqLowDb: number
  eqMidDb: number
  eqHighDb: number
  filter: number
  channelFader: number
  meter: number
}

export interface MixerState {
  channels: [ChannelMixerState, ChannelMixerState]
  crossfader: number
  master: number
}

export interface MasterState {
  level: number
}

// M8 global sampler state
export interface SamplerState {
  slots: [SamplerSlotState, SamplerSlotState, SamplerSlotState, SamplerSlotState,
          SamplerSlotState, SamplerSlotState, SamplerSlotState, SamplerSlotState]
  gain: number
}

// M9 effects state
import type { BeatFxType, BeatFxTarget, ReleaseFxType } from './audio/effects/types'

export interface BeatFxState {
  enabled: boolean
  type: BeatFxType
  target: BeatFxTarget
  beatMultiplierIndex: number
  levelDepth: number
}

export interface ReleaseFxState {
  type: ReleaseFxType
  active: boolean
}

export interface SmartCfxState {
  enabled: boolean
  value: number // -1..+1
}

export interface SmartFaderState {
  enabled: boolean
  transitionDirection: 'A_TO_B' | 'B_TO_A' | null
}

export interface FXState {
  beatFx: BeatFxState
  releaseFx: ReleaseFxState
  smartCfx: [SmartCfxState, SmartCfxState] // per channel
  smartFader: SmartFaderState
}

export interface DJState {
  decks: [DeckState, DeckState]
  mixer: MixerState
  master: MasterState
  sampler: SamplerState
  shiftPressed: boolean
  fx: FXState
}

export type Action =
  | { type: 'LOAD_TRACK'; deck: 0 | 1; track: Track }
  | { type: 'PLAY'; deck: 0 | 1 }
  | { type: 'PAUSE'; deck: 0 | 1 }
  | { type: 'STOP'; deck: 0 | 1 }
  | { type: 'SEEK'; deck: 0 | 1; seconds: number }
  | { type: 'CUE_DOWN'; deck: 0 | 1 }
  | { type: 'CUE_UP'; deck: 0 | 1 }
  | { type: 'SET_CUE'; deck: 0 | 1; seconds: number }
  | { type: 'RETURN_TO_START'; deck: 0 | 1 }
  // M3 tempo actions
  | { type: 'SET_TEMPO'; deck: 0 | 1; percent: number }
  | { type: 'CYCLE_TEMPO_RANGE'; deck: 0 | 1 }
  | { type: 'SET_ORIGINAL_BPM'; deck: 0 | 1; bpm: number | null }
  // M3 nudge actions
  | { type: 'NUDGE_FORWARD_START'; deck: 0 | 1 }
  | { type: 'NUDGE_BACKWARD_START'; deck: 0 | 1 }
  | { type: 'NUDGE_END'; deck: 0 | 1 }
  // M4 jog actions
  | { type: 'JOG_PLATTER_START'; deck: 0 | 1 }
  | { type: 'JOG_PLATTER_MOVE'; deck: 0 | 1; deltaRadians: number; velocity: number; direction: 'forward' | 'backward' | null }
  | { type: 'JOG_PLATTER_END'; deck: 0 | 1 }
  | { type: 'JOG_RIM_START'; deck: 0 | 1 }
  | { type: 'JOG_RIM_MOVE'; deck: 0 | 1; deltaRadians: number; velocity: number; direction: 'forward' | 'backward' | null }
  | { type: 'JOG_RIM_END'; deck: 0 | 1 }
  // M5 scratch actions
  | { type: 'SCRATCH_START'; deck: 0 | 1 }
  | { type: 'SCRATCH_MOVE'; deck: 0 | 1; deltaRadians: number; velocity: number; direction: 'forward' | 'backward' | null }
  | { type: 'SCRATCH_END'; deck: 0 | 1 }
  // M6 analysis actions
  | { type: 'SET_MANUAL_BPM'; deck: 0 | 1; bpm: number | null }
  // M7 sync actions
  | { type: 'TOGGLE_BEAT_SYNC'; deck: 0 | 1 }
  | { type: 'SET_SYNC_MASTER'; deck: 0 | 1 }
  // M7 loop actions
  | { type: 'LOOP_IN'; deck: 0 | 1 }
  | { type: 'LOOP_OUT'; deck: 0 | 1 }
  | { type: 'LOOP_EXIT'; deck: 0 | 1 }
  | { type: 'LOOP_4_BEAT'; deck: 0 | 1 }
  | { type: 'LOOP_HALF'; deck: 0 | 1 }
  | { type: 'LOOP_DOUBLE'; deck: 0 | 1 }
  // M7 beat jump actions
  | { type: 'BEAT_JUMP'; deck: 0 | 1; beats: number }
  // M8 pad mode actions
  | { type: 'SET_PAD_MODE'; deck: 0 | 1; mode: PadMode }
  | { type: 'PAD_DOWN'; deck: 0 | 1; padIndex: number }
  | { type: 'PAD_UP'; deck: 0 | 1; padIndex: number }
  // M8 shift actions
  | { type: 'SHIFT_DOWN' }
  | { type: 'SHIFT_UP' }
  // M8 sampler actions
  | { type: 'STOP_SAMPLER_SLOT'; slot: number }
  | { type: 'UNLOAD_SAMPLER_SLOT'; slot: number }
  | { type: 'SET_SAMPLER_GAIN'; gain: number }
  // M9 Beat FX actions
  | { type: 'SET_BEAT_FX_TYPE'; fxType: BeatFxType }
  | { type: 'SET_BEAT_FX_TARGET'; target: BeatFxTarget }
  | { type: 'SET_BEAT_FX_BEATS'; multiplierIndex: number }
  | { type: 'SET_BEAT_FX_DEPTH'; depth: number }
  | { type: 'TOGGLE_BEAT_FX' }
  // M9 Release FX actions
  | { type: 'SET_RELEASE_FX'; fxType: ReleaseFxType }
  | { type: 'TRIGGER_RELEASE_FX' }
  // M9 Smart CFX actions
  | { type: 'TOGGLE_SMART_CFX'; deck: 0 | 1 }
  | { type: 'SET_SMART_CFX_VALUE'; deck: 0 | 1; value: number }
  // M9 Smart Fader actions
  | { type: 'TOGGLE_SMART_FADER' }
  // Legacy M1/M2 actions
  | { type: 'SET_TRIM'; deck: 0 | 1; db: number }
  | { type: 'SET_EQ_LOW'; deck: 0 | 1; db: number }
  | { type: 'SET_EQ_MID'; deck: 0 | 1; db: number }
  | { type: 'SET_EQ_HIGH'; deck: 0 | 1; db: number }
  | { type: 'SET_FILTER'; deck: 0 | 1; p: number }
  | { type: 'SET_CHANNEL_FADER'; deck: 0 | 1; fader: number }
  | { type: 'SET_CROSSFADER'; x: number }
  | { type: 'SET_MASTER'; level: number }
  | { type: 'SET_PLAYBACK_RATE'; deck: 0 | 1; rate: number }
  // M11 MIDI / library navigation actions
  | { type: 'LIBRARY_SELECT_NEXT'; delta: number }
  | { type: 'LOAD_SELECTED_TO_A'; deck: 0 | 1 }
  | { type: 'LOAD_SELECTED_TO_B'; deck: 0 | 1 }

export type Unsubscribe = () => void

export interface DJEngineHandle {
  getState: () => DJState
  dispatch: (action: Action) => void
  subscribe: (listener: (state: DJState) => void) => Unsubscribe
  loadTrack: (deck: 0 | 1, track: Track) => void
  loadSample: (slot: number, file: File) => void
  destroy: () => void
}

export interface DeckTransport {
  readonly id: number
  load(buffer: AudioBuffer, track?: Track): void
  play(): void
  pause(): void
  stop(): void
  seek(seconds: number): void
  setGain(gain: number): void
  setPlaybackRate(rate: number): void
  applyTempo(playbackRate: number): void
  startNudge(direction: 'forward' | 'backward'): void
  stopNudge(): void
  readonly nudging: 'forward' | 'backward' | null
  startScratch(): number
  moveScratch(deltaRadians: number, velocity: number): void
  endScratch(): number
  forceStopScratch(): void
  readonly isScratching: boolean
  readonly isPlaying: boolean
  readonly currentTime: number
  readonly duration: number
  readonly cue: number | null
  readonly playbackRate: number
  readonly currentTrack: Track | null
}

// Waveform cache: stores waveform data by track ID (not in global state)
export interface WaveformCache {
  [trackId: string]: WaveformData
}
