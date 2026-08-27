import React, { useRef, useCallback } from 'react'
import type { DeckState, Action, PadMode, WaveformData, DJEngineHandle } from '../types'
import { JogWheel } from './JogWheel'
import { WaveformDisplay } from './WaveformDisplay'

const BEAT_LOOP_LABELS = ['1/4', '1/2', '1', '2', '4', '8', '16', '32']
const BEAT_JUMP_LABELS = ['-1', '+1', '-2', '+2', '-4', '+4', '-8', '+8']
const HOT_CUE_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8']
const SAMPLER_LABELS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']

const PAD_MODES: PadMode[] = ['HOT_CUE', 'BEAT_LOOP', 'BEAT_JUMP', 'SAMPLER']

interface DeckProps {
  deck: DeckState
  waveformData: WaveformData | null
  onAction: (action: Action) => void
  engine?: DJEngineHandle // reserved for future direct sampler access
}

export function Deck({ deck, waveformData, onAction, engine: _engine }: DeckProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const ctx = new AudioContext()
          const arrayBuffer = await file.arrayBuffer()
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
          ctx.close()
          onAction({
            type: 'LOAD_TRACK', deck: deck.id,
            track: { id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, buffer: audioBuffer, duration: audioBuffer.duration },
          })
        } catch (err) { console.error('Failed to load track:', err) }
      }
      reader.readAsArrayBuffer(file)
      e.target.value = ''
    },
    [deck.id, onAction],
  )

  const sourceBpm = deck.analysis.manualBpm ?? deck.analysis.analyzedBpm

  const getPadLabels = (): string[] => {
    switch (deck.padMode) {
      case 'HOT_CUE': return HOT_CUE_LABELS
      case 'BEAT_LOOP': return BEAT_LOOP_LABELS
      case 'BEAT_JUMP': return BEAT_JUMP_LABELS
      case 'SAMPLER': return SAMPLER_LABELS
    }
  }

  const getPadStyle = (i: number): React.CSSProperties => {
    switch (deck.padMode) {
      case 'HOT_CUE': {
        const cue = deck.hotCues[i]
        return cue.active
          ? { background: '#1a6b3a', borderColor: '#2be27a', color: '#2be27a' }
          : {}
      }
      case 'BEAT_LOOP': {
        const isActive = deck.loop.active && deck.loop.lengthBeats !== null &&
          Math.abs(deck.loop.lengthBeats - [0.25, 0.5, 1, 2, 4, 8, 16, 32][i]) < 0.01
        return isActive
          ? { background: '#1a4a6b', borderColor: '#4a9eff', color: '#4a9eff' }
          : {}
      }
      case 'SAMPLER': {
        // Use global sampler state from engine if available
        return {}
      }
      default: return {}
    }
  }

  return (
    <div className={`deck ${deck.isPlaying ? 'playing' : ''} ${deck.scratch.active ? 'scratching' : ''}`}>
      <div className="deck-header">
        <span className="deck-label">DECK {deck.id === 0 ? 'A' : 'B'}</span>
        <span className={`play-status ${deck.isPlaying ? 'active' : ''}`}>
          {deck.isPlaying ? '▶ PLAY' : deck.isPaused ? '❚❚ PAUSED' : '■ STOPPED'}
        </span>
      </div>

      <div className="track-info">
        <span className="track-name">{deck.track?.name ?? 'No track loaded'}</span>
        <span className="track-time">{deck.position.toFixed(1)}s / {deck.duration.toFixed(1)}s</span>
      </div>

      <WaveformDisplay
        waveformData={waveformData}
        position={deck.position}
        duration={deck.duration}
        loop={deck.loop}
        hotCues={deck.hotCues}
        onClick={(pos) => {
          const seconds = (pos / 100) * deck.duration
          onAction({ type: 'SEEK', deck: deck.id, seconds })
        }}
      />

      {/* Transport controls */}
      <div className="transport-controls">
        <button className="play-btn" onClick={() => onAction({ type: deck.isPlaying ? 'PAUSE' : 'PLAY', deck: deck.id })}>
          {deck.isPlaying ? '❚❚' : '▶'}
        </button>
        <button className="stop-btn" onClick={() => onAction({ type: 'STOP', deck: deck.id })}>■</button>
        <button
          className="cue-btn"
          onPointerDown={() => onAction({ type: 'CUE_DOWN', deck: deck.id })}
          onPointerUp={() => onAction({ type: 'CUE_UP', deck: deck.id })}
        >CUE</button>
        <button onClick={() => onAction({ type: 'RETURN_TO_START', deck: deck.id })}>⏮</button>
      </div>

      {deck.cuePoint !== null && <div className="cue-display">CUE: {deck.cuePoint.toFixed(2)}s</div>}

      <JogWheel deck={deck} onAction={onAction} />

      {/* Tempo */}
      <div className="tempo-controls">
        <label className="tempo-label">
          TEMPO <span className="tempo-range">±{deck.tempoRange}%</span>
        </label>
        <input type="range" min={-deck.tempoRange} max={deck.tempoRange} step={0.1} value={deck.tempoPercent}
          onChange={(e) => onAction({ type: 'SET_TEMPO', deck: deck.id, percent: parseFloat(e.target.value) })} />
        <span className="tempo-value">{deck.tempoPercent >= 0 ? '+' : ''}{deck.tempoPercent.toFixed(1)}%</span>
        <span className="rate-value">Rate: {deck.playbackRate.toFixed(3)}</span>
      </div>

      {/* BPM display */}
      <div className="bpm-display">
        <span>SRC: {sourceBpm !== null ? sourceBpm.toFixed(1) : '—'}</span>
        <span>EFF: {deck.effectiveBpm !== null ? deck.effectiveBpm.toFixed(1) : '—'}</span>
        <span>{deck.analysis.status.toUpperCase()}</span>
      </div>

      {/* Manual BPM */}
      <div className="manual-bpm">
        <label>BPM Override:</label>
        <input type="number" min={30} max={300} step={0.1} placeholder="auto"
          value={deck.analysis.manualBpm ?? ''}
          onChange={(e) => {
            const val = e.target.value === '' ? null : parseFloat(e.target.value)
            onAction({ type: 'SET_MANUAL_BPM', deck: deck.id, bpm: val })
          }} />
      </div>

      <button className="load-btn" onClick={() => fileRef.current?.click()}>LOAD</button>
      <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Nudge */}
      <div className="nudge-controls">
        <button onPointerDown={() => onAction({ type: 'NUDGE_BACKWARD_START', deck: deck.id })}
          onPointerUp={() => onAction({ type: 'NUDGE_END', deck: deck.id })}>◀◀</button>
        <span className="nudge-status">{deck.nudging ? `Nudge: ${deck.nudging}` : ''}</span>
        <button onPointerDown={() => onAction({ type: 'NUDGE_FORWARD_START', deck: deck.id })}
          onPointerUp={() => onAction({ type: 'NUDGE_END', deck: deck.id })}>▶▶</button>
      </div>

      {/* M7 Sync */}
      <div className="sync-controls">
        <button className={`sync-btn ${deck.sync.enabled ? 'active' : ''}`}
          onClick={() => onAction({ type: 'TOGGLE_BEAT_SYNC', deck: deck.id })}>
          SYNC {deck.sync.enabled ? 'ON' : 'OFF'}
        </button>
        <button className={`master-btn ${deck.sync.isMaster ? 'active' : ''}`}
          onClick={() => onAction({ type: 'SET_SYNC_MASTER', deck: deck.id })}>MASTER</button>
        <div className="sync-info">
          {deck.sync.isMaster && <span className="master-label">★ MASTER</span>}
          {deck.sync.enabled && !deck.sync.isMaster && deck.sync.masterDeck !== null && (
            <span className="slave-label">SLAVE → Deck {deck.sync.masterDeck === 0 ? 'A' : 'B'}</span>
          )}
        </div>
      </div>

      {/* M7 Loop */}
      <div className="loop-controls">
        <button className="loop-btn" onClick={() => onAction({ type: 'LOOP_IN', deck: deck.id })}>IN</button>
        <button className="loop-btn" onClick={() => onAction({ type: 'LOOP_OUT', deck: deck.id })}>OUT</button>
        <button className={`loop-btn ${deck.loop.active ? 'active' : ''}`}
          onClick={() => onAction({ type: 'LOOP_4_BEAT', deck: deck.id })}>4 BEAT</button>
        <button className="loop-btn" onClick={() => onAction({ type: 'LOOP_HALF', deck: deck.id })}
          disabled={!deck.loop.active}>HALF</button>
        <button className="loop-btn" onClick={() => onAction({ type: 'LOOP_DOUBLE', deck: deck.id })}
          disabled={!deck.loop.active}>DOUBLE</button>
        <button className="loop-btn" onClick={() => onAction({ type: 'LOOP_EXIT', deck: deck.id })}
          disabled={!deck.loop.active}>EXIT</button>
        {deck.loop.active && (
          <div className="loop-info">
            <span>LOOP: {deck.loop.lengthBeats} beats</span>
            <span>{deck.loop.startSeconds?.toFixed(2)}s → {deck.loop.endSeconds?.toFixed(2)}s</span>
          </div>
        )}
      </div>

      {/* M7 Beat Jump buttons */}
      <div className="beat-jump-controls">
        {[-8, -4, -2, -1, 1, 2, 4, 8].map((b) => (
          <button key={b} className="beat-jump-btn"
            onClick={() => onAction({ type: 'BEAT_JUMP', deck: deck.id, beats: b })}
            disabled={!deck.analysis.beatGridReady}>
            {b > 0 ? '+' : ''}{b}
          </button>
        ))}
      </div>

      {/* ── M8 Performance Pads ──────────────────────────────────── */}

      {/* Pad mode selectors */}
      <div className="pad-mode-controls">
        {PAD_MODES.map((mode) => (
          <button
            key={mode}
            className={`pad-mode-btn ${deck.padMode === mode ? 'active' : ''}`}
            onClick={() => onAction({ type: 'SET_PAD_MODE', deck: deck.id, mode })}
          >
            {mode.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* 8-pad grid */}
      <div className="pad-grid">
        {getPadLabels().map((label, i) => (
          <button
            key={i}
            className="pad-btn"
            style={getPadStyle(i)}
            onPointerDown={() => onAction({ type: 'PAD_DOWN', deck: deck.id, padIndex: i })}
            onPointerUp={() => onAction({ type: 'PAD_UP', deck: deck.id, padIndex: i })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
