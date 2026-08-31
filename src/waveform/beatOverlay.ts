import type { DeckState, HotCue, LoopState } from '../types'

export interface TimeWindow {
  start: number
  end: number
}

export interface WaveformMarker {
  seconds: number
  x: number
}

export interface BeatGridMarker extends WaveformMarker {
  emphasis: 'minor' | 'strong'
}

export interface LoopRegion {
  startSeconds: number
  endSeconds: number
  x: number
  width: number
}

export function resolveWaveformBpm(deck: DeckState): number | null {
  const bpm = deck.analysis.manualBpm ?? deck.analysis.analyzedBpm ?? deck.track?.bpm ?? deck.originalBpm
  return bpm != null && bpm > 0 && Number.isFinite(bpm) ? bpm : null
}

export function formatWaveformBpm(deck: DeckState): string {
  if (deck.analysis.status === 'analyzing') return 'Analyzing'
  const bpm = resolveWaveformBpm(deck)
  return bpm == null ? '- BPM' : `${bpm.toFixed(1)} BPM`
}

export function timeToX(seconds: number, window: TimeWindow, width: number): number {
  if (width <= 0 || window.end <= window.start) return 0
  return ((seconds - window.start) / (window.end - window.start)) * width
}

export function xToTime(x: number, window: TimeWindow, width: number): number {
  if (width <= 0 || window.end <= window.start) return window.start
  const t = Math.max(0, Math.min(1, x / width))
  return window.start + t * (window.end - window.start)
}

export function overviewWindow(duration: number): TimeWindow {
  return { start: 0, end: Math.max(0, duration) }
}

export function detailWindow(position: number, duration: number, secondsVisible = 8): TimeWindow {
  const span = Math.max(1, secondsVisible)
  if (duration <= 0) return { start: 0, end: span }
  const center = Math.max(0, Math.min(duration, position))
  return { start: center - span / 2, end: center + span / 2 }
}

export function beatGridMarkers(
  beats: number[] | null | undefined,
  window: TimeWindow,
  width: number,
): BeatGridMarker[] {
  if (!beats || width <= 0) return []
  return beats
    .map((seconds, index) => ({ seconds, index }))
    .filter(({ seconds }) => seconds >= window.start && seconds <= window.end)
    .map(({ seconds, index }) => ({
      seconds,
      x: timeToX(seconds, window, width),
      emphasis: index % 4 === 0 ? 'strong' : 'minor',
    }))
}

export function hotCueMarkers(
  hotCues: HotCue[] | null | undefined,
  window: TimeWindow,
  width: number,
): Array<WaveformMarker & { index: number }> {
  if (!hotCues || width <= 0) return []
  return hotCues
    .filter((cue) => cue.active && cue.positionSeconds >= window.start && cue.positionSeconds <= window.end)
    .map((cue) => ({
      index: cue.index,
      seconds: cue.positionSeconds,
      x: timeToX(cue.positionSeconds, window, width),
    }))
}

export function loopRegion(loop: LoopState | undefined, window: TimeWindow, width: number): LoopRegion | null {
  if (!loop?.active || loop.startSeconds === null || loop.endSeconds === null) return null
  const start = Math.max(loop.startSeconds, window.start)
  const end = Math.min(loop.endSeconds, window.end)
  if (end <= start) return null
  const x = timeToX(start, window, width)
  return {
    startSeconds: loop.startSeconds,
    endSeconds: loop.endSeconds,
    x,
    width: Math.max(1, timeToX(end, window, width) - x),
  }
}
