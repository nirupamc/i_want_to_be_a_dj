/**
 * Jog interaction layer.
 *
 * Handles pointer events on jog wheel zones (platter + rim) and dispatches
 * semantic DJEngine actions. This layer normalizes DOM input into
 * framework-independent angular data before dispatching.
 *
 * Architecture:
 *   Pointer/Touch/Future 3D Input
 *     ↓
 *   JogInteraction (this module)
 *     ↓
 *   DJEngine semantic commands
 *     ↓
 *   DeckEngine / Transport
 *     ↓
 *   AudioEngine
 */

import {
  pointToAngle,
  angleDelta,
  angularVelocity,
  smoothVelocity,
  clampVelocity,
  deltaDirection,
  JOG_DEAD_ZONE,
} from './jogMath'

export type JogZone = 'platter' | 'rim'

export interface JogInteractionCallbacks {
  onPlatterStart(deck: 0 | 1): void
  onPlatterMove(deck: 0 | 1, deltaRadians: number, velocity: number, direction: 'forward' | 'backward' | null): void
  onPlatterEnd(deck: 0 | 1): void
  onRimStart(deck: 0 | 1): void
  onRimMove(deck: 0 | 1, deltaRadians: number, velocity: number, direction: 'forward' | 'backward' | null): void
  onRimEnd(deck: 0 | 1): void
}

export interface JogInteractionState {
  active: boolean
  deck: 0 | 1
  zone: JogZone | null
  pointerId: number | null
  centerX: number
  centerY: number
  prevAngle: number | null
  prevTimestamp: number | null
  smoothedVelocity: number
  accumulatedRotation: number
}

/**
 * Create a fresh jog interaction state for a given deck.
 */
export function createJogInteractionState(deck: 0 | 1): JogInteractionState {
  return {
    active: false,
    deck,
    zone: null,
    pointerId: null,
    centerX: 0,
    centerY: 0,
    prevAngle: null,
    prevTimestamp: null,
    smoothedVelocity: 0,
    accumulatedRotation: 0,
  }
}

/**
 * Handle pointer down on a jog zone.
 * Sets up interaction state and dispatches start action.
 */
export function handleJogPointerDown(
  state: JogInteractionState,
  event: PointerEvent,
  element: HTMLElement,
  zone: JogZone,
  callbacks: JogInteractionCallbacks,
): void {
  // If already active, ignore (shouldn't happen with proper pointer capture)
  if (state.active) return

  const rect = element.getBoundingClientRect()
  state.active = true
  state.zone = zone
  state.pointerId = event.pointerId
  state.centerX = rect.left + rect.width / 2
  state.centerY = rect.top + rect.height / 2
  state.prevAngle = pointToAngle(event.clientX, event.clientY, state.centerX, state.centerY)
  state.prevTimestamp = event.timeStamp
  state.smoothedVelocity = 0
  state.accumulatedRotation = 0

  // Capture pointer to track movement outside element bounds
  element.setPointerCapture(event.pointerId)

  if (zone === 'platter') {
    callbacks.onPlatterStart(state.deck)
  } else {
    callbacks.onRimStart(state.deck)
  }
}

/**
 * Handle pointer move during active jog interaction.
 * Calculates angular delta, velocity, and direction. Dispatches move actions.
 */
export function handleJogPointerMove(
  state: JogInteractionState,
  event: PointerEvent,
  callbacks: JogInteractionCallbacks,
): void {
  if (!state.active || state.pointerId !== event.pointerId) return
  if (state.prevAngle === null || state.prevTimestamp === null) return

  const currentAngle = pointToAngle(event.clientX, event.clientY, state.centerX, state.centerY)
  const delta = angleDelta(state.prevAngle, currentAngle)
  const elapsed = event.timeStamp - state.prevTimestamp

  // Update state
  state.prevAngle = currentAngle
  state.prevTimestamp = event.timeStamp

  // Apply dead zone
  const absDelta = Math.abs(delta)
  if (absDelta < JOG_DEAD_ZONE) return

  // Calculate velocity
  const rawVelocity = angularVelocity(delta, elapsed)
  state.smoothedVelocity = smoothVelocity(rawVelocity, state.smoothedVelocity)
  const clampedVelocity = clampVelocity(state.smoothedVelocity)

  // Track accumulated rotation for visual feedback
  state.accumulatedRotation += delta

  const dir = deltaDirection(delta)

  if (state.zone === 'platter') {
    callbacks.onPlatterMove(state.deck, delta, clampedVelocity, dir)
  } else {
    callbacks.onRimMove(state.deck, delta, clampedVelocity, dir)
  }
}

/**
 * Handle pointer up / release during active jog interaction.
 * Clears state and dispatches end action.
 */
export function handleJogPointerUp(
  state: JogInteractionState,
  event: PointerEvent,
  callbacks: JogInteractionCallbacks,
): void {
  if (!state.active || state.pointerId !== event.pointerId) return

  const zone = state.zone

  // Clear state
  state.active = false
  state.zone = null
  state.pointerId = null
  state.prevAngle = null
  state.prevTimestamp = null
  state.smoothedVelocity = 0

  if (zone === 'platter') {
    callbacks.onPlatterEnd(state.deck)
  } else if (zone === 'rim') {
    callbacks.onRimEnd(state.deck)
  }
}

/**
 * Handle pointer cancel / interruption.
 * Same as pointer up but for error/interrupt cases.
 */
export function handleJogPointerCancel(
  state: JogInteractionState,
  event: PointerEvent,
  callbacks: JogInteractionCallbacks,
): void {
  handleJogPointerUp(state, event, callbacks)
}

/**
 * Force-clear jog state (for component unmount, window blur, etc.)
 * Dispatches end actions for any active zone.
 */
export function forceClearJogState(
  state: JogInteractionState,
  callbacks: JogInteractionCallbacks,
): void {
  if (!state.active) return

  const zone = state.zone

  state.active = false
  state.zone = null
  state.pointerId = null
  state.prevAngle = null
  state.prevTimestamp = null
  state.smoothedVelocity = 0

  if (zone === 'platter') {
    callbacks.onPlatterEnd(state.deck)
  } else if (zone === 'rim') {
    callbacks.onRimEnd(state.deck)
  }
}
