import type { DJEngineHandle } from '../types'

export interface DjWaveformPlayerAdapter {
  play(): void
  pause(): void
  getCurrentTime(): number
  getDuration(): number
  seek(time: number): void
  isPlaying(): boolean
  destroy(): void
}

export function createDjWaveformPlayerAdapter(
  engine: DJEngineHandle,
  deck: 0 | 1,
): DjWaveformPlayerAdapter {
  let destroyed = false

  const assertLive = () => {
    if (destroyed) throw new Error('Waveform adapter is destroyed')
  }

  return {
    play() {
      assertLive()
      engine.dispatch({ type: 'PLAY', deck })
    },
    pause() {
      assertLive()
      engine.dispatch({ type: 'PAUSE', deck })
    },
    getCurrentTime() {
      assertLive()
      return engine.getState().decks[deck].position
    },
    getDuration() {
      assertLive()
      return engine.getState().decks[deck].duration
    },
    seek(time) {
      assertLive()
      const duration = engine.getState().decks[deck].duration
      const seconds = Math.max(0, Math.min(duration, time))
      engine.dispatch({ type: 'SEEK', deck, seconds })
    },
    isPlaying() {
      assertLive()
      return engine.getState().decks[deck].isPlaying
    },
    destroy() {
      destroyed = true
    },
  }
}
