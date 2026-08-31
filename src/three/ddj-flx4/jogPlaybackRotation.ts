const DEFAULT_ROTATIONS_PER_SECOND = 33.333333 / 60
const TAU = Math.PI * 2

export interface JogPlaybackVisualState {
  isPlaying: boolean
  positionSeconds: number
  touchingPlatter: boolean
  touchingRim: boolean
  scratching: boolean
}

export function getJogPlaybackAngle(
  positionSeconds: number,
  rotationsPerSecond = DEFAULT_ROTATIONS_PER_SECOND,
): number {
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(rotationsPerSecond)) return 0
  const raw = positionSeconds * rotationsPerSecond * TAU
  return ((raw % TAU) + TAU) % TAU
}

export function shouldPlaybackOwnJogVisual(state: JogPlaybackVisualState): boolean {
  return state.isPlaying && !state.touchingPlatter && !state.touchingRim && !state.scratching
}

export function shouldManualOwnJogVisual(state: Pick<JogPlaybackVisualState, 'touchingPlatter' | 'touchingRim' | 'scratching'>): boolean {
  return state.touchingPlatter || state.touchingRim || state.scratching
}

export function selectJogPlaybackAngles(
  left: JogPlaybackVisualState,
  right: JogPlaybackVisualState,
  rotationsPerSecond = DEFAULT_ROTATIONS_PER_SECOND,
): { left: number | null; right: number | null } {
  return {
    left: shouldPlaybackOwnJogVisual(left) ? getJogPlaybackAngle(left.positionSeconds, rotationsPerSecond) : null,
    right: shouldPlaybackOwnJogVisual(right) ? getJogPlaybackAngle(right.positionSeconds, rotationsPerSecond) : null,
  }
}
