/**
 * DeckMeter — a compact hardware-style level meter driven by real audio data.
 *
 * The meter value (0..1 peak) comes from DJState.mixer.channels[i].meter,
 * which is polled every 100 ms from an AnalyserNode in the AudioEngine.
 * No fake data — if the deck is silent the meter reads 0.
 *
 * Visual design mirrors reference hardware:
 *   - 10 segments
 *   - green  (0–6):   normal signal
 *   - yellow (7–8):   high signal
 *   - red    (9):     clip warning
 *   - segments illuminate proportionally to the peak level
 */
import { type CSSProperties } from 'react'

const TOTAL_SEGMENTS = 10
const YELLOW_THRESHOLD = 7  // segments 7–8 are yellow
const RED_THRESHOLD    = 9  // segment 9 is red

function segmentColor(index: number): string {
  if (index >= RED_THRESHOLD)    return 'var(--meter-red)'
  if (index >= YELLOW_THRESHOLD) return 'var(--meter-yellow)'
  return 'var(--meter-green)'
}

export interface DeckMeterProps {
  /** Peak level 0..1 from DJState.mixer.channels[deck].meter */
  level: number
  /** 'left' renders segments right-to-left (deck A); 'right' is normal */
  side: 'left' | 'right'
  /** Whether the deck is currently playing (adds a playing CSS class) */
  isPlaying: boolean
}

export function DeckMeter({ level, side, isPlaying }: DeckMeterProps): JSX.Element {
  // How many segments should light up
  const lit = Math.round(level * TOTAL_SEGMENTS)

  return (
    <div
      className={`deck-meter deck-meter-${side} ${isPlaying ? 'playing' : ''}`}
      role="meter"
      aria-label={`Deck ${side === 'left' ? 'A' : 'B'} level`}
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => {
        const segIndex = side === 'left' ? TOTAL_SEGMENTS - 1 - i : i
        const active   = segIndex < lit
        const color    = segmentColor(segIndex)
        return (
          <span
            key={segIndex}
            className={`deck-meter-seg ${active ? 'active' : ''}`}
            style={{ '--seg-color': color } as CSSProperties}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
}
