import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createDJEngine, type DJEngineHandle, type DJState } from './engine'
import { Deck } from './components/Deck'
import { Mixer } from './components/Mixer'
import { Transport } from './components/Transport'
import { LibraryService } from './library/LibraryService'
import type { LibraryState, LibrarySortField } from './library/libraryTypes'
import { getLoadedDeckIds } from './library/libraryHelpers'
import { BEAT_MULTIPLIER_LABELS } from './audio/effects/types'
import { ThreeScene } from './three/ddj-flx4/ThreeScene'
import './index.css'

const FX_TYPES = ['ECHO', 'DELAY', 'REVERB', 'FLANGER', 'FILTER'] as const
const FX_TARGETS = ['A', 'B', 'MASTER'] as const

// Collapsible section component
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="collapsible-section">
      <button className="section-toggle" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="toggle-arrow">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="section-content">{children}</div>}
    </div>
  )
}

// Library panel component
function LibraryPanel({
  library,
  deckATrackId,
  deckBTrackId,
  onLoadA,
  onLoadB,
  onRemove,
  libRef,
}: {
  library: LibraryState
  deckATrackId: string | null
  deckBTrackId: string | null
  onLoadA: (trackId: string) => void
  onLoadB: (trackId: string) => void
  onRemove: (trackId: string) => void
  libRef: React.MutableRefObject<LibraryService | null>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !libRef.current) return
    libRef.current.addTracks(Array.from(files))
    e.target.value = ''
  }, [libRef])

  const tracks = library.tracks

  const sortHeader = useCallback((field: LibrarySortField, label: string) => {
    const isActive = library.sortField === field
    return (
      <th
        className={`sortable ${isActive ? 'active' : ''}`}
        onClick={() => libRef.current?.setSortField(field)}
      >
        {label} {isActive ? (library.sortDirection === 'asc' ? '▲' : '▼') : ''}
      </th>
    )
  }, [library.sortField, library.sortDirection, libRef])

  return (
    <div className="library-panel">
      <div className="library-toolbar">
        <div className="library-search">
          <input
            type="text"
            placeholder="Search tracks..."
            value={library.searchQuery}
            onChange={(e) => libRef.current?.setSearchQuery(e.target.value)}
          />
        </div>
        <div className="library-filters">
          {(['all', 'ready', 'analyzing', 'failed'] as const).map((mode) => (
            <button
              key={mode}
              className={`filter-btn ${library.filterMode === mode ? 'active' : ''}`}
              onClick={() => libRef.current?.setFilterMode(mode)}
            >
              {mode === 'all' ? 'All' : mode === 'ready' ? 'Analyzed' : mode === 'analyzing' ? 'Analyzing' : 'Failed'}
            </button>
          ))}
        </div>
        <div className="library-actions">
          <button className="import-btn" onClick={() => fileInputRef.current?.click()}>
            + Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </div>
      </div>

      <div className="library-stats">
        {library.tracks.length} tracks · {library.tracks.filter((t) => t.analysisStatus === 'ready').length} analyzed
      </div>

      {tracks.length === 0 ? (
        <div className="library-empty">
          <p>Import audio files to begin.</p>
          <button className="import-btn large" onClick={() => fileInputRef.current?.click()}>
            + Import Audio Files
          </button>
        </div>
      ) : (
        <div className="library-table-container">
          <table className="library-table">
            <thead>
              <tr>
                {sortHeader('title', 'TITLE')}
                {sortHeader('artist', 'ARTIST')}
                {sortHeader('bpm', 'BPM')}
                {sortHeader('duration', 'DURATION')}
                <th>STATUS</th>
                <th>LOADED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => {
                const { inA, inB } = getLoadedDeckIds(deckATrackId, deckBTrackId, track.id)
                const isSelected = selectedId === track.id
                return (
                  <tr
                    key={track.id}
                    className={`library-row ${isSelected ? 'selected' : ''} ${inA || inB ? 'loaded' : ''}`}
                    onClick={() => setSelectedId(track.id)}
                  >
                    <td className="col-title">{track.title}</td>
                    <td className="col-artist">{track.artist ?? '—'}</td>
                    <td className="col-bpm">{track.analyzedBpm?.toFixed(1) ?? '—'}</td>
                    <td className="col-duration">{track.durationSeconds != null ? `${Math.floor(track.durationSeconds / 60)}:${String(Math.floor(track.durationSeconds % 60)).padStart(2, '0')}` : '—'}</td>
                    <td className={`col-status status-${track.analysisStatus}`}>
                      {track.analysisStatus === 'ready' ? '●' : track.analysisStatus === 'analyzing' ? '◌' : track.analysisStatus === 'failed' ? '✕' : '○'}
                    </td>
                    <td className="col-loaded">
                      {inA && <span className="loaded-badge deck-a">A</span>}
                      {inB && <span className="loaded-badge deck-b">B</span>}
                    </td>
                    <td className="col-actions">
                      <button className="load-a-btn" onClick={(e) => { e.stopPropagation(); onLoadA(track.id) }} title="Load to Deck A">A</button>
                      <button className="load-b-btn" onClick={(e) => { e.stopPropagation(); onLoadB(track.id) }} title="Load to Deck B">B</button>
                      <button className="remove-btn" onClick={(e) => { e.stopPropagation(); onRemove(track.id) }} title="Remove from library">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const engineRef = useRef<DJEngineHandle | null>(null)
  if (!engineRef.current) engineRef.current = createDJEngine()
  const engine = engineRef.current

  const [state, setState] = useState<DJState>(engine.getState())
  useEffect(() => {
    const unsub = engine.subscribe(setState)
    return unsub
  }, [engine])

  // Library service
  const libRef = useRef<LibraryService | null>(null)
  if (!libRef.current) libRef.current = new LibraryService()
  const lib = libRef.current
  const [libState, setLibState] = useState<LibraryState>(lib.getState())

  // Sync library state on changes
  const refreshLib = useCallback(() => setLibState(lib.getState()), [lib])

  // Subscribe to library updates
  useEffect(() => {
    lib.options.onTrackAdded = () => refreshLib()
    lib.options.onTrackRemoved = () => refreshLib()
    lib.options.onTrackUpdated = () => refreshLib()
  }, [lib, refreshLib])

  // Load track from library to deck
  const loadFromLibrary = useCallback(async (trackId: string, deckIdx: 0 | 1) => {
    const file = lib.getFileForTrack(trackId)
    if (!file) return

    try {
      const audioCtx = new AudioContext()
      const arrayBuffer = await file.arrayBuffer()
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      audioCtx.close()

      engine.dispatch({
        type: 'LOAD_TRACK',
        deck: deckIdx,
        track: {
          id: trackId,
          name: file.name,
          buffer: audioBuffer,
          duration: audioBuffer.duration,
        },
      })

      lib.markAsPlayed(trackId)
      refreshLib()
    } catch (err) {
      console.error('Failed to load track:', err)
    }
  }, [lib, engine, refreshLib])

  const removeTrack = useCallback((trackId: string) => {
    lib.removeTrack(trackId)
    refreshLib()
  }, [lib, refreshLib])

  // Sampler file inputs
  const samplerFileRefs = useRef<(HTMLInputElement | null)[]>([])
  const handleSamplerLoad = useCallback((slot: number) => {
    samplerFileRefs.current[slot]?.click()
  }, [])

  const handleSamplerFile = useCallback((slot: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    engine.loadSample(slot, file)
    e.target.value = ''
  }, [engine])

  const fx = state.fx.beatFx

  // MIDI state (stub — real MidiManager integration requires Web MIDI API)
  const [midiSupported] = useState(() => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess)
  const [midiEnabled, setMidiEnabled] = useState(false)
  const [midiPermission, setMidiPermission] = useState<string>('unknown')
  const [midiInputName, setMidiInputName] = useState<string | null>(null)
  const [midiLearnTarget] = useState<string | null>(null)
  const [midiLastMessage, setMidiLastMessage] = useState<string | null>(null)

  const enableMidi = useCallback(async () => {
    try {
      const access = await navigator.requestMIDIAccess!({ sysex: false })
      setMidiEnabled(true)
      setMidiPermission('granted')
      const firstInput = access.inputs.values().next().value
      if (firstInput) {
        setMidiInputName(firstInput.name ?? 'Unknown')
        firstInput.onmidimessage = (event) => {
          if (!event.data) return
          const d = Array.from(event.data).map(b => b.toString(16).padStart(2, '0')).join(' ')
          setMidiLastMessage(d)
        }
      }
      access.onstatechange = () => {
        const inp = access.inputs.values().next().value
        setMidiInputName(inp?.name ?? null)
      }
    } catch {
      setMidiPermission('denied')
    }
  }, [])

  const disableMidi = useCallback(() => {
    setMidiEnabled(false)
    setMidiInputName(null)
    setMidiLastMessage(null)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <h1>DJ FLX4</h1>
        <span className="badge">M11 MIDI Integration</span>
        <div className="topbar-right">
          <span className="track-count">{libState.tracks.length} tracks</span>
          <button
            className={`shift-btn ${state.shiftPressed ? 'active' : ''}`}
            onPointerDown={() => engine.dispatch({ type: 'SHIFT_DOWN' })}
            onPointerUp={() => engine.dispatch({ type: 'SHIFT_UP' })}
          >SHIFT</button>
        </div>
      </header>

      {/* Decks row */}
      <main className="layout">
        <section className="deck-col">
          <Deck deck={state.decks[0]} waveformData={null} onAction={(a) => engine.dispatch(a)} engine={engine} />
        </section>
        <section className="mixer-col">
          <Mixer mixer={state.mixer} onAction={(a) => engine.dispatch(a)} />
        </section>
        <section className="deck-col">
          <Deck deck={state.decks[1]} waveformData={null} onAction={(a) => engine.dispatch(a)} engine={engine} />
        </section>
      </main>

      {/* Effects + Sampler in collapsible sections */}
      <section className="controls-row">
        <Section title="EFFECTS" defaultOpen={false}>
          <div className="fx-grid">
            <div className="fx-panel compact">
              <div className="fx-header">
                <span className="fx-label">BEAT FX</span>
                <button className={`fx-toggle ${fx.enabled ? 'active' : ''}`}
                  onClick={() => engine.dispatch({ type: 'TOGGLE_BEAT_FX' })}>{fx.enabled ? 'ON' : 'OFF'}</button>
              </div>
              <div className="fx-controls">
                <label className="fx-control"><span>TYPE</span>
                  <select value={fx.type} onChange={(e) => engine.dispatch({ type: 'SET_BEAT_FX_TYPE', fxType: e.target.value as typeof fx.type })}>
                    {FX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="fx-control"><span>TARGET</span>
                  <select value={fx.target} onChange={(e) => engine.dispatch({ type: 'SET_BEAT_FX_TARGET', target: e.target.value as typeof fx.target })}>
                    {FX_TARGETS.map((t) => <option key={t} value={t}>Deck {t}</option>)}
                  </select>
                </label>
                <label className="fx-control"><span>BEAT</span>
                  <div className="beat-selector">
                    <button onClick={() => engine.dispatch({ type: 'SET_BEAT_FX_BEATS', multiplierIndex: Math.max(0, fx.beatMultiplierIndex - 1) })}>◀</button>
                    <span className="beat-value">{BEAT_MULTIPLIER_LABELS[fx.beatMultiplierIndex]}</span>
                    <button onClick={() => engine.dispatch({ type: 'SET_BEAT_FX_BEATS', multiplierIndex: Math.min(BEAT_MULTIPLIER_LABELS.length - 1, fx.beatMultiplierIndex + 1) })}>▶</button>
                  </div>
                </label>
                <label className="fx-control"><span>DEPTH</span>
                  <input type="range" min={0} max={1} step={0.01} value={fx.levelDepth}
                    onChange={(e) => engine.dispatch({ type: 'SET_BEAT_FX_DEPTH', depth: parseFloat(e.target.value) })} />
                </label>
              </div>
            </div>

            <div className="fx-panel compact">
              <div className="fx-header"><span className="fx-label">RELEASE FX</span></div>
              <div className="fx-controls">
                <label className="fx-control"><span>TYPE</span>
                  <select value={state.fx.releaseFx.type}
                    onChange={(e) => engine.dispatch({ type: 'SET_RELEASE_FX', fxType: e.target.value as typeof state.fx.releaseFx.type })}>
                    <option value="NONE">None</option>
                    <option value="ECHO_OUT">Echo Out</option>
                  </select>
                </label>
                <button className={`release-trigger ${state.fx.releaseFx.active ? 'active' : ''}`}
                  onClick={() => engine.dispatch({ type: 'TRIGGER_RELEASE_FX' })}
                  disabled={state.fx.releaseFx.type === 'NONE'}>TRIGGER</button>
              </div>
            </div>

            <div className="fx-panel compact">
              <div className="fx-header"><span className="fx-label">SMART CFX</span></div>
              {[0, 1].map((d) => (
                <div key={d} className="smart-cfx-row">
                  <span className="channel-label">CH {d === 0 ? 'A' : 'B'}</span>
                  <button className={`fx-toggle small ${state.fx.smartCfx[d].enabled ? 'active' : ''}`}
                    onClick={() => engine.dispatch({ type: 'TOGGLE_SMART_CFX', deck: d as 0 | 1 })}>
                    {state.fx.smartCfx[d].enabled ? 'ON' : 'OFF'}
                  </button>
                  <input type="range" min={-1} max={1} step={0.01} value={state.fx.smartCfx[d].value}
                    disabled={!state.fx.smartCfx[d].enabled}
                    onChange={(e) => engine.dispatch({ type: 'SET_SMART_CFX_VALUE', deck: d as 0 | 1, value: parseFloat(e.target.value) })} />
                </div>
              ))}
            </div>

            <div className="fx-panel compact">
              <div className="fx-header">
                <span className="fx-label">SMART FADER</span>
                <button className={`fx-toggle ${state.fx.smartFader.enabled ? 'active' : ''}`}
                  onClick={() => engine.dispatch({ type: 'TOGGLE_SMART_FADER' })}>
                  {state.fx.smartFader.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="SAMPLER" defaultOpen={false}>
          <div className="sampler-inline">
            <label className="sampler-gain">
              GAIN
              <input type="range" min={0} max={1} step={0.01} value={state.sampler.gain}
                onChange={(e) => engine.dispatch({ type: 'SET_SAMPLER_GAIN', gain: parseFloat(e.target.value) })} />
              <span>{(state.sampler.gain * 100).toFixed(0)}%</span>
            </label>
            <div className="sampler-grid">
              {state.sampler.slots.map((slot, i) => (
                <div key={i} className={`sampler-slot ${slot.loaded ? 'loaded' : ''} ${slot.playing ? 'playing' : ''}`}>
                  <span className="slot-name">{slot.name ?? `S${i + 1}`}</span>
                  <div className="slot-actions">
                    <button className="slot-load-btn" onClick={() => handleSamplerLoad(i)}>Load</button>
                    {slot.loaded && <>
                      <button className="slot-trigger-btn" onPointerDown={() => engine.dispatch({ type: 'PAD_DOWN', deck: 0, padIndex: i })}>▶</button>
                      <button className="slot-stop-btn" onClick={() => engine.dispatch({ type: 'STOP_SAMPLER_SLOT', slot: i })}>■</button>
                      <button className="slot-unload-btn" onClick={() => engine.dispatch({ type: 'UNLOAD_SAMPLER_SLOT', slot: i })}>✕</button>
                    </>}
                  </div>
                  <input ref={(el) => { samplerFileRefs.current[i] = el }} type="file" accept="audio/*" style={{ display: 'none' }}
                    onChange={(e) => handleSamplerFile(i, e)} />
                </div>
              ))}
            </div>
          </div>
        </Section>
        <Section title="MIDI" defaultOpen={false}>
          <div className="midi-panel">
            <div className="midi-status">
              <span>Web MIDI: {midiSupported ? 'SUPPORTED' : 'NOT SUPPORTED'}</span>
              <span>Permission: {midiPermission.toUpperCase()}</span>
              {midiInputName && <span>Input: {midiInputName}</span>}
            </div>
            <div className="midi-actions">
              {!midiEnabled && midiSupported && (
                <button className="midi-enable-btn" onClick={enableMidi}>Enable MIDI</button>
              )}
              {midiEnabled && (
                <button className="midi-disable-btn" onClick={disableMidi}>Disable MIDI</button>
              )}
            </div>
            {midiLearnTarget && (
              <div className="midi-learn">
                <span>Learning: {midiLearnTarget} — press a control...</span>
              </div>
            )}
            {midiLastMessage && (
              <div className="midi-last-msg">
                <span>Last: {midiLastMessage}</span>
              </div>
            )}
          </div>
        </Section>
        <Section title="3D CONTROLLER (M12A)" defaultOpen={false}>
          <div className="three-scene-section">
            <ThreeScene interactive={true} />
          </div>
        </Section>
      </section>

      {/* Library */}
      <section className="library-section">
        <LibraryPanel
          library={libState}
          deckATrackId={state.decks[0].track?.id ?? null}
          deckBTrackId={state.decks[1].track?.id ?? null}
          onLoadA={(id) => loadFromLibrary(id, 0)}
          onLoadB={(id) => loadFromLibrary(id, 1)}
          onRemove={removeTrack}
          libRef={libRef}
        />
      </section>

      <Transport master={state.master} onAction={(a) => engine.dispatch(a)} />
    </div>
  )
}
