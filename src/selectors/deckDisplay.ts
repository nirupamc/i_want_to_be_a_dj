import type { DeckState } from '../types'

export interface BeatMarker {
  seconds: number
  emphasis: 'minor' | 'strong'
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function formatRemaining(position: number, duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return '-00:00'
  return `-${formatTime(Math.max(0, duration - Math.max(0, position)))}`
}

export function resolveDeckBpmLabel(deck: DeckState): string {
  if (deck.analysis.status === 'analyzing') return 'Analyzing...'
  const bpm = deck.analysis.manualBpm ?? deck.analysis.analyzedBpm ?? deck.track?.bpm ?? deck.originalBpm
  return bpm != null && bpm > 0 ? bpm.toFixed(1) : '-'
}

export function getBeatMarkers(deck: DeckState): BeatMarker[] {
  const grid = deck.analysis.beatGrid
  if (!grid || deck.duration <= 0) return []
  return grid.beats
    .filter((seconds) => seconds >= 0 && seconds <= deck.duration)
    .map((seconds, index) => ({
      seconds,
      emphasis: index % 4 === 0 ? 'strong' : 'minor',
    }))
}
