import React, { useCallback, useEffect, useRef } from 'react'
import { Action, DeckState, JogState } from '../types'
import {
  handleJogPointerDown,
  handleJogPointerMove,
  handleJogPointerUp,
  handleJogPointerCancel,
  forceClearJogState,
  createJogInteractionState,
  type JogInteractionState,
  type JogInteractionCallbacks,
} from '../audio/jogInteraction'

interface JogWheelProps {
  deck: DeckState
  onAction: (a: Action) => void
}

/**
 * Debug jog wheel component.
 *
 * Two interaction zones:
 *   - Inner platter: scratch-intent + audio scrub
 *   - Outer rim: temporary pitch bend / nudge
 *
 * Scratch debug indicators show position, velocity, direction, and
 * whether the deck was playing before scratch started.
 */
export function JogWheel({ deck, onAction }: JogWheelProps) {
  const interactionRef = useRef<JogInteractionState>(createJogInteractionState(deck.id))
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    interactionRef.current.deck = deck.id
  }, [deck.id])

  const callbacks: JogInteractionCallbacks = useCallback(() => ({
    onPlatterStart: (d: 0 | 1) => onAction({ type: 'JOG_PLATTER_START', deck: d }),
    onPlatterMove: (d: 0 | 1, delta: number, vel: number, dir: 'forward' | 'backward' | null) =>
      onAction({ type: 'JOG_PLATTER_MOVE', deck: d, deltaRadians: delta, velocity: vel, direction: dir }),
    onPlatterEnd: (d: 0 | 1) => onAction({ type: 'JOG_PLATTER_END', deck: d }),
    onRimStart: (d: 0 | 1) => onAction({ type: 'JOG_RIM_START', deck: d }),
    onRimMove: (d: 0 | 1, delta: number, vel: number, dir: 'forward' | 'backward' | null) =>
      onAction({ type: 'JOG_RIM_MOVE', deck: d, deltaRadians: delta, velocity: vel, direction: dir }),
    onRimEnd: (d: 0 | 1) => onAction({ type: 'JOG_RIM_END', deck: d }),
  }), [onAction])()

  useEffect(() => {
    const interaction = interactionRef.current
    return () => {
      forceClearJogState(interaction, callbacks)
    }
  }, [callbacks])

  const onPointerDown = useCallback((zone: 'platter' | 'rim') => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    handleJogPointerDown(interactionRef.current, e as unknown as PointerEvent, el, zone, callbacks)
  }, [callbacks])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    handleJogPointerMove(interactionRef.current, e as unknown as PointerEvent, callbacks)
  }, [callbacks])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    handleJogPointerUp(interactionRef.current, e as unknown as PointerEvent, callbacks)
  }, [callbacks])

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    handleJogPointerCancel(interactionRef.current, e as unknown as PointerEvent, callbacks)
  }, [callbacks])

  const jog: JogState = deck.jog
  const scratch = deck.scratch
  const rotationDeg = (jog.accumulatedRotation * 180) / Math.PI

  return (
    <div className="jog-container">
      <div className="jog-label">JOG WHEEL</div>
      <div
        ref={containerRef}
        className="jog-wheel"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ touchAction: 'none' }}
      >
        <div
          className={`jog-rim ${jog.touchingRim ? 'active' : ''}`}
          onPointerDown={onPointerDown('rim')}
        >
          <div
            className={`jog-platter ${jog.touchingPlatter ? 'active' : ''} ${scratch.active ? 'scratching' : ''}`}
            onPointerDown={onPointerDown('platter')}
            style={{ transform: `rotate(${rotationDeg}deg)` }}
          >
            <div className="jog-platter-inner">
              <div className="jog-indicator" />
            </div>
          </div>
        </div>
      </div>

      {/* M4 debug readout */}
      <div className="jog-debug">
        <div className="jog-debug-row">
          <span>Zone:</span>
          <span>{jog.touchingPlatter ? 'PLATTER' : jog.touchingRim ? 'RIM' : '—'}</span>
        </div>
        <div className="jog-debug-row">
          <span>Direction:</span>
          <span>{jog.direction ?? '—'}</span>
        </div>
        <div className="jog-debug-row">
          <span>Velocity:</span>
          <span>{jog.velocity.toFixed(4)}</span>
        </div>
        <div className="jog-debug-row">
          <span>Nudge:</span>
          <span>{deck.nudging ?? '—'}</span>
        </div>
      </div>

      {/* M5 scratch debug readout */}
      <div className="jog-debug scratch-debug">
        <div className="jog-debug-row scratch-header">
          <span>SCRATCH:</span>
          <span className={scratch.active ? 'active-indicator' : ''}>
            {scratch.active ? 'ACTIVE' : 'off'}
          </span>
        </div>
        <div className="jog-debug-row">
          <span>Position:</span>
          <span>{scratch.currentPosition.toFixed(3)}s</span>
        </div>
        <div className="jog-debug-row">
          <span>Direction:</span>
          <span>{scratch.direction ?? '—'}</span>
        </div>
        <div className="jog-debug-row">
          <span>Velocity:</span>
          <span>{scratch.velocity.toFixed(4)}</span>
        </div>
        <div className="jog-debug-row">
          <span>Was Playing:</span>
          <span>{scratch.wasPlayingBeforeScratch ? 'YES' : 'no'}</span>
        </div>
      </div>
    </div>
  )
}
