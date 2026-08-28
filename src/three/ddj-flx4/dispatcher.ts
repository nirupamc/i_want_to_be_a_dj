/**
 * M12B dispatcher.
 *
 * Connects the binding table to the real DJEngine. Resolves
 * BindingMarker actions into real DJEngine actions using current state,
 * and provides the small library bridge the engine does not own.
 */

import type { DJEngineHandle, DJState, Action } from '../../types'
import type { RuntimeControl } from './controlRegistry'
import { buildBindingTable, ControlAdapter, type DispatchableAction, type BindingMarker } from './engineBindings'

export interface LibraryBridge {
  /** Move library selection by N rows (positive = next, negative = previous). */
  select(delta: number): void
  /** Load the currently selected library track to a deck. */
  load(deck: 0 | 1): void
}

export class ThreeToEngineDispatcher {
  private readonly engine: DJEngineHandle
  private readonly library: LibraryBridge
  readonly adapter: ControlAdapter
  /** True while we are applying a programmatic visual update — used to
   *  prevent the 3D layer from re-dispatching an action that came from
   *  the engine itself. */
  private _suppressEvents = 0

  constructor(engine: DJEngineHandle, library: LibraryBridge) {
    this.engine = engine
    this.library = library
    this.adapter = new ControlAdapter(buildBindingTable())
  }

  getState(): DJState { return this.engine.getState() }

  /** Apply a pointer down. */
  onDown(control: RuntimeControl): void {
    if (this._suppressEvents > 0) return
    const actions = this.adapter.onDown(control)
    this.dispatchAll(actions)
  }

  onUp(control: RuntimeControl): void {
    if (this._suppressEvents > 0) return
    const actions = this.adapter.onUp(control)
    this.dispatchAll(actions)
  }

  onValue(control: RuntimeControl, value: number): void {
    if (this._suppressEvents > 0) return
    const actions = this.adapter.onValue(control, value)
    this.dispatchAll(actions)
  }

  onJogStart(control: RuntimeControl): void {
    if (this._suppressEvents > 0) return
    const actions = this.adapter.onJogStart(control)
    this.dispatchAll(actions)
  }

  onJogMove(control: RuntimeControl, info: { deltaRadians: number; velocity: number; direction: 1 | -1 }): void {
    if (this._suppressEvents > 0) return
    const actions = this.adapter.onJogMove(control, info)
    this.dispatchAll(actions)
  }

  onJogEnd(control: RuntimeControl): void {
    if (this._suppressEvents > 0) return
    const actions = this.adapter.onJogEnd(control)
    this.dispatchAll(actions)
  }

  /** Run a block of work in "programmatic visual update" mode. The 3D
   *  layer can call this around writes that should not produce 3D input
   *  events. */
  withSuppressed<T>(fn: () => T): T {
    this._suppressEvents += 1
    try { return fn() } finally { this._suppressEvents -= 1 }
  }

  /** Convert a binding-marker or real action into the right real action
   *  or a side-effect call (library). */
  private rewrite(a: DispatchableAction): Action | null | "library-select" | "library-load" {
    if (!isMarker(a)) return a
    const state = this.getState()
    switch (a.type) {
      case 'SET_TEMPO_NORMALIZED': {
        const s = state.decks[a.deck]
        const range = s.tempoRange
        const percent = (a.normalized * 2 - 1) * range
        return { type: 'SET_TEMPO', deck: a.deck, percent }
      }
      case 'CYCLE_BEAT_FX_TARGET': {
        const order: Array<'A' | 'B' | 'MASTER'> = ['A', 'B', 'MASTER']
        const current = state.fx.beatFx.target
        const idx = order.indexOf(current)
        const next = order[(idx + 1) % order.length]
        return { type: 'SET_BEAT_FX_TARGET', target: next }
      }
      case 'TOGGLE_PLAY_FOR_DECK': {
        const playing = state.decks[a.deck].isPlaying
        return playing ? { type: 'PAUSE', deck: a.deck } : { type: 'PLAY', deck: a.deck }
      }
      case 'LIBRARY_SELECT': {
        this.library.select(a.delta)
        return null
      }
      case 'LIBRARY_LOAD': {
        this.library.load(a.deck)
        return null
      }
    }
  }

  private dispatchAll(actions: DispatchableAction[]): void {
    for (const a of actions) {
      const real = this.rewrite(a)
      if (real === null) continue
      if (real === "library-select" || real === "library-load") continue
      this.engine.dispatch(real)
    }
  }
}

function isMarker(a: DispatchableAction): a is BindingMarker {
  const t = (a as { type: string }).type
  return t === 'SET_TEMPO_NORMALIZED' || t === 'CYCLE_BEAT_FX_TARGET' || t === 'TOGGLE_PLAY_FOR_DECK' || t === 'LIBRARY_SELECT' || t === 'LIBRARY_LOAD'
}
