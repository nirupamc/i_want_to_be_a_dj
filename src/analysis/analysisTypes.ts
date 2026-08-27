/**
 * Track analysis types for M6.
 *
 * All types are serializable — no AudioBuffer, AudioContext, or DOM objects.
 * Designed for deterministic analysis and future Web Worker migration.
 */

/** Analysis status for a deck */
export type AnalysisStatus = 'idle' | 'analyzing' | 'ready' | 'failed'

/** Version constant for cache invalidation */
export const ANALYSIS_VERSION = 'waveform-bpm-v1'

/** Reduced waveform data extracted from PCM */
export interface WaveformData {
  /** Analysis sample rate used for waveform extraction (Hz) */
  sampleRate: number
  /** Number of waveform points per second */
  pointsPerSecond: number
  /** Peak amplitude per time bucket, normalized to 0..1 */
  peaks: number[]
  /** Optional RMS per time bucket, normalized to 0..1 */
  rms?: number[]
}

/** Beat grid: regular beat timestamps aligned to estimated BPM */
export interface BeatGrid {
  /** Estimated BPM for this grid */
  bpm: number
  /** Time of the first beat anchor (seconds) */
  firstBeatSeconds: number
  /** Ascending beat timestamps in seconds, clamped to [0, duration] */
  beats: number[]
}

/** Complete analysis result for a track */
export interface TrackAnalysis {
  /** Track duration in seconds */
  durationSeconds: number

  /** Waveform data */
  waveform: WaveformData

  /** Estimated BPM (null if unreliable) */
  bpm: number | null
  /** Confidence score: 0.0 = unreliable, 1.0 = strong periodic evidence */
  bpmConfidence: number | null

  /** Beat grid (null if BPM not detected) */
  beatGrid: BeatGrid | null

  /** Analysis algorithm version */
  analysisVersion: string
}

/** Analysis state stored per deck in DJState */
export interface DeckAnalysisState {
  /** Current analysis status */
  status: AnalysisStatus
  /** Analyzed BPM from automatic detection */
  analyzedBpm: number | null
  /** Manual BPM override (user-provided, null = use analyzed) */
  manualBpm: number | null
  /** Effective source BPM (manual override takes precedence) */
  effectiveSourceBpm: number | null
  /** BPM confidence from analysis */
  bpmConfidence: number | null
  /** Whether waveform data is ready */
  waveformReady: boolean
  /** Whether beatgrid is ready */
  beatGridReady: boolean
  /** Beat grid data (cached for lookups) */
  beatGrid: BeatGrid | null
  /** Generation token for stale-result protection */
  generation: number
}
