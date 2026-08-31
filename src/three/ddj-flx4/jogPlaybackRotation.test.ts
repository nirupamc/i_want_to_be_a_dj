import { describe, expect, it } from 'vitest'
import {
  getJogPlaybackAngle,
  selectJogPlaybackAngles,
  shouldManualOwnJogVisual,
  shouldPlaybackOwnJogVisual,
  type JogPlaybackVisualState,
} from './jogPlaybackRotation'

const playing = (positionSeconds: number): JogPlaybackVisualState => ({
  isPlaying: true,
  positionSeconds,
  touchingPlatter: false,
  touchingRim: false,
  scratching: false,
})

describe('jog playback rotation math', () => {
  it('starts at the base angle at position 0', () => {
    expect(getJogPlaybackAngle(0)).toBe(0)
  })

  it('derives a changed deterministic angle from position', () => {
    const angle = getJogPlaybackAngle(1)

    expect(angle).toBeGreaterThan(0)
    expect(getJogPlaybackAngle(1)).toBe(angle)
  })

  it('wraps angle within one full turn', () => {
    const angle = getJogPlaybackAngle(1000)

    expect(angle).toBeGreaterThanOrEqual(0)
    expect(angle).toBeLessThan(Math.PI * 2)
  })

  it('keeps A/B angle selection independent', () => {
    const angles = selectJogPlaybackAngles(playing(1), { ...playing(4), isPlaying: false })

    expect(angles.left).toBe(getJogPlaybackAngle(1))
    expect(angles.right).toBeNull()
  })

  it('does not advance visual angle while paused', () => {
    expect(shouldPlaybackOwnJogVisual({ ...playing(10), isPlaying: false })).toBe(false)
    expect(selectJogPlaybackAngles({ ...playing(10), isPlaying: false }, playing(2)).left).toBeNull()
  })

  it('gives manual jog/scratch ownership during interaction', () => {
    expect(shouldPlaybackOwnJogVisual({ ...playing(1), touchingPlatter: true })).toBe(false)
    expect(shouldPlaybackOwnJogVisual({ ...playing(1), touchingRim: true })).toBe(false)
    expect(shouldPlaybackOwnJogVisual({ ...playing(1), scratching: true })).toBe(false)
    expect(shouldManualOwnJogVisual({ touchingPlatter: true, touchingRim: false, scratching: false })).toBe(true)
  })
})
