import React, { useCallback, useRef, useState, useEffect } from 'react'
import { createDJEngine, type DJEngineHandle, type DJState } from './engine'
import { LibraryService } from './library/LibraryService'
import type { LibraryState, LibrarySortField } from './library/libraryTypes'
import { getLoadedDeckIds } from './library/libraryHelpers'
import { BEAT_MULTIPLIER_LABELS } from './audio/effects/types'
import { WaveformDisplay } from './components/WaveformDisplay'
import { ThreeScene } from './three/ddj-flx4/ThreeScene'
import type { LibraryBridge } from './three/ddj-flx4/dispatcher'
import type { DeckState } from './types'
import { isEditableTarget } from './input/keyboard'
import './index.css'

const FX_TYPES = ['ECHO', 'DELAY', 'REVERB', 'FLANGER', 'FILTER'] as const
const FX_TARGETS = ['A', 'B', 'MASTER'] as const

type Drawer = 'library' | 'equipment' | 'settings' | null
type EquipmentTab = 'effects' | 'sampler' | 'midi'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function DeckTrackDisplay({ deck, side }: { deck: DeckState; side: 'left' | 'right' }) {
  const bpm = deck.effectiveBpm ?? deck.analysis.manualBpm ?? deck.analysis.analyzedBpm
  const remaining = Math.max(0, deck.duration - deck.position)

  return (
    <section className={`track-display deck-${side}`}>
      <div className="track-deck-label">Deck {deck.id === 0 ? 'A' : 'B'}</div>
      <div className="track-title" title={deck.track?.name ?? 'No track loaded'}>
        {deck.track?.name ?? 'No track loaded'}
      </div>
      <div className="track-meta">
        <span>{bpm != null ? `${bpm.toFixed(1)} BPM` : '-- BPM'}</span>
        <span>{formatTime(deck.position)} / -{formatTime(remaining)}</span>
      </div>
      <div className={`deck-transport-dot ${deck.isPlaying ? 'playing' : ''}`} />
    </section>
  )
}

function TrackDisplayBar({ state, onSeek }: { state: DJState; onSeek: (deck: 0 | 1, percent: number) => void }) {
  return (
    <header className="track-display-bar">
      <DeckTrackDisplay deck={state.decks[0]} side="left" />
      <section className="combined-waveform-area" aria-label="Waveform overview">
        <div className="waveform-lane">
          <span className="waveform-deck-chip deck-a">A</span>
          <WaveformDisplay
            compact
            waveformData={null}
            position={state.decks[0].position}
            duration={state.decks[0].duration}
            loop={state.decks[0].loop}
            hotCues={state.decks[0].hotCues}
            onClick={(percent) => onSeek(0, percent)}
          />
        </div>
        <div className="waveform-lane">
          <span className="waveform-deck-chip deck-b">B</span>
          <WaveformDisplay
            compact
            waveformData={null}
            position={state.decks[1].position}
            duration={state.decks[1].duration}
            loop={state.decks[1].loop}
            hotCues={state.decks[1].hotCues}
            onClick={(percent) => onSeek(1, percent)}
          />
        </div>
      </section>
      <DeckTrackDisplay deck={state.decks[1]} side="right" />
    </header>
  )
}

function StudioToolbar({
  activeDrawer,
  debugEnabled,
  focusMode,
  trackCount,
  shiftPressed,
  onToggleDrawer,
  onToggleDebug,
  onToggleFocus,
  onShiftDown,
  onShiftUp,
}: {
  activeDrawer: Drawer
  debugEnabled: boolean
  focusMode: boolean
  trackCount: number
  shiftPressed: boolean
  onToggleDrawer: (drawer: Exclude<Drawer, null>) => void
  onToggleDebug: () => void
  onToggleFocus: () => void
  onShiftDown: () => void
  onShiftUp: () => void
}) {
  return (
    <nav className="studio-toolbar" aria-label="Studio navigation">
      <div className="toolbar-left">
        <button className={`toolbar-button ${activeDrawer === 'library' ? 'active' : ''}`} onClick={() => onToggleDrawer('library')}>
          Music Library
        </button>
        <button className={`toolbar-button ${activeDrawer === 'equipment' ? 'active' : ''}`} onClick={() => onToggleDrawer('equipment')}>
          Equipment
        </button>
        <button className={`toolbar-button ${activeDrawer === 'settings' ? 'active' : ''}`} onClick={() => onToggleDrawer('settings')}>
          Settings
        </button>
      </div>
      <div className="toolbar-right">
        <span className="toolbar-count">{trackCount} tracks</span>
        <button className={`toolbar-button compact ${focusMode ? 'active' : ''}`} onClick={onToggleFocus}>
          Focus
        </button>
        <button className={`toolbar-button compact ${debugEnabled ? 'active' : ''}`} onClick={onToggleDebug}>
          Debug
        </button>
        <button
          className={`toolbar-button compact shift ${shiftPressed ? 'active' : ''}`}
          onPointerDown={onShiftDown}
          onPointerUp={onShiftUp}
          onPointerCancel={onShiftUp}
        >
          Shift
        </button>
      </div>
    </nav>
  )
}

function LibraryPanel({
  library,
  deckATrackId,
  deckBTrackId,
  onLoadA,
  onLoadB,
  onRemove,
  libRef,
  onRefresh,
}: {
  library: LibraryState
  deckATrackId: string | null
  deckBTrackId: string | null
  onLoadA: (trackId: string) => void
  onLoadB: (trackId: string) => void
  onRemove: (trackId: string) => void
  libRef: React.MutableRefObject<LibraryService | null>
  onRefresh: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !libRef.current) return
    libRef.current.addTracks(Array.from(files))
    onRefresh()
    e.target.value = ''
  }, [libRef, onRefresh])

  const sortHeader = useCallback((field: LibrarySortField, label: string) => {
    const isActive = library.sortField === field
    return (
      <th className={`sortable ${isActive ? 'active' : ''}`} onClick={() => {
        libRef.current?.setSortField(field)
        onRefresh()
      }}>
        {label} {isActive ? (library.sortDirection === 'asc' ? '^' : 'v') : ''}
      </th>
    )
  }, [library.sortField, library.sortDirection, libRef, onRefresh])

  return (
    <div className="library-panel">
      <div className="library-toolbar">
        <div className="library-search">
          <input
            type="text"
            placeholder="Search tracks..."
            value={library.searchQuery}
            onChange={(e) => {
              libRef.current?.setSearchQuery(e.target.value)
              onRefresh()
            }}
          />
        </div>
        <div className="library-filters">
          {(['all', 'ready', 'analyzing', 'failed'] as const).map((mode) => (
            <button
              key={mode}
              className={`filter-btn ${library.filterMode === mode ? 'active' : ''}`}
              onClick={() => {
                libRef.current?.setFilterMode(mode)
                onRefresh()
              }}
            >
              {mode === 'all' ? 'All' : mode === 'ready' ? 'Analyzed' : mode === 'analyzing' ? 'Analyzing' : 'Failed'}
            </button>
          ))}
        </div>
        <div className="library-actions">
          <button className="import-btn" onClick={() => fileInputRef.current?.click()}>Import</button>
          <input ref={fileInputRef} type="file" multiple accept="audio/*" hidden onChange={handleImport} />
        </div>
      </div>

      <div className="library-stats">
        {library.tracks.length} tracks / {library.tracks.filter((t) => t.analysisStatus === 'ready').length} analyzed
      </div>

      {library.tracks.length === 0 ? (
        <div className="library-empty">
          <p>Import audio files to begin.</p>
          <button className="import-btn large" onClick={() => fileInputRef.current?.click()}>Import Audio Files</button>
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
              {library.tracks.map((track) => {
                const { inA, inB } = getLoadedDeckIds(deckATrackId, deckBTrackId, track.id)
                const isSelected = selectedId === track.id || library.selectedTrackId === track.id
                return (
                  <tr
                    key={track.id}
                    className={`library-row ${isSelected ? 'selected' : ''} ${inA || inB ? 'loaded' : ''}`}
                    onClick={() => {
                      setSelectedId(track.id)
                      libRef.current?.selectTrack(track.id)
                      onRefresh()
                    }}
                  >
                    <td className="col-title">{track.title}</td>
                    <td className="col-artist">{track.artist ?? '-'}</td>
                    <td className="col-bpm">{track.analyzedBpm?.toFixed(1) ?? '-'}</td>
                    <td className="col-duration">{track.durationSeconds != null ? formatTime(track.durationSeconds) : '-'}</td>
                    <td className={`col-status status-${track.analysisStatus}`}>
                      {track.analysisStatus === 'ready' ? 'ok' : track.analysisStatus === 'analyzing' ? '...' : track.analysisStatus === 'failed' ? 'x' : '-'}
                    </td>
                    <td className="col-loaded">
                      {inA && <span className="loaded-badge deck-a">A</span>}
                      {inB && <span className="loaded-badge deck-b">B</span>}
                    </td>
                    <td className="col-actions">
                      <button className="load-a-btn" onClick={(e) => { e.stopPropagation(); onLoadA(track.id) }} title="Load to Deck A">A</button>
                      <button className="load-b-btn" onClick={(e) => { e.stopPropagation(); onLoadB(track.id) }} title="Load to Deck B">B</button>
                      <button className="remove-btn" onClick={(e) => { e.stopPropagation(); onRemove(track.id) }} title="Remove from library">x</button>
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

function EquipmentPanel({
  state,
  engine,
  samplerFileRefs,
  activeTab,
  midiSupported,
  midiEnabled,
  midiPermission,
  midiInputName,
  midiLastMessage,
  onSetActiveTab,
  onSamplerLoad,
  onSamplerFile,
  onEnableMidi,
  onDisableMidi,
}: {
  state: DJState
  engine: DJEngineHandle
  samplerFileRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  activeTab: EquipmentTab
  midiSupported: boolean
  midiEnabled: boolean
  midiPermission: string
  midiInputName: string | null
  midiLastMessage: string | null
  onSetActiveTab: (tab: EquipmentTab) => void
  onSamplerLoad: (slot: number) => void
  onSamplerFile: (slot: number, e: React.ChangeEvent<HTMLInputElement>) => void
  onEnableMidi: () => void
  onDisableMidi: () => void
}) {
  const fx = state.fx.beatFx

  return (
    <div className="equipment-panel">
      <div className="drawer-tabs" role="tablist" aria-label="Equipment">
        <button className={`drawer-tab ${activeTab === 'effects' ? 'active' : ''}`} onClick={() => onSetActiveTab('effects')}>Effects</button>
        <button className={`drawer-tab ${activeTab === 'sampler' ? 'active' : ''}`} onClick={() => onSetActiveTab('sampler')}>Sampler</button>
        <button className={`drawer-tab ${activeTab === 'midi' ? 'active' : ''}`} onClick={() => onSetActiveTab('midi')}>MIDI</button>
      </div>

      {activeTab === 'effects' && <section className="drawer-section">
        <h2>Effects</h2>
        <div className="fx-grid">
          <div className="fx-panel compact">
            <div className="fx-header">
              <span className="fx-label">Beat FX</span>
              <button className={`fx-toggle ${fx.enabled ? 'active' : ''}`} onClick={() => engine.dispatch({ type: 'TOGGLE_BEAT_FX' })}>
                {fx.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="fx-controls">
              <label className="fx-control"><span>Type</span>
                <select value={fx.type} onChange={(e) => engine.dispatch({ type: 'SET_BEAT_FX_TYPE', fxType: e.target.value as typeof fx.type })}>
                  {FX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="fx-control"><span>Target</span>
                <select value={fx.target} onChange={(e) => engine.dispatch({ type: 'SET_BEAT_FX_TARGET', target: e.target.value as typeof fx.target })}>
                  {FX_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="fx-control"><span>Beat</span>
                <div className="beat-selector">
                  <button onClick={() => engine.dispatch({ type: 'SET_BEAT_FX_BEATS', multiplierIndex: Math.max(0, fx.beatMultiplierIndex - 1) })}>-</button>
                  <span className="beat-value">{BEAT_MULTIPLIER_LABELS[fx.beatMultiplierIndex]}</span>
                  <button onClick={() => engine.dispatch({ type: 'SET_BEAT_FX_BEATS', multiplierIndex: Math.min(BEAT_MULTIPLIER_LABELS.length - 1, fx.beatMultiplierIndex + 1) })}>+</button>
                </div>
              </label>
              <label className="fx-control"><span>Depth</span>
                <input type="range" min={0} max={1} step={0.01} value={fx.levelDepth} onChange={(e) => engine.dispatch({ type: 'SET_BEAT_FX_DEPTH', depth: parseFloat(e.target.value) })} />
              </label>
            </div>
          </div>

          <div className="fx-panel compact">
            <div className="fx-header"><span className="fx-label">Release FX</span></div>
            <div className="fx-controls">
              <label className="fx-control"><span>Type</span>
                <select value={state.fx.releaseFx.type} onChange={(e) => engine.dispatch({ type: 'SET_RELEASE_FX', fxType: e.target.value as typeof state.fx.releaseFx.type })}>
                  <option value="NONE">None</option>
                  <option value="ECHO_OUT">Echo Out</option>
                </select>
              </label>
              <button className={`release-trigger ${state.fx.releaseFx.active ? 'active' : ''}`} onClick={() => engine.dispatch({ type: 'TRIGGER_RELEASE_FX' })} disabled={state.fx.releaseFx.type === 'NONE'}>
                Trigger
              </button>
            </div>
          </div>

          <div className="fx-panel compact">
            <div className="fx-header"><span className="fx-label">Smart CFX</span></div>
            {[0, 1].map((d) => (
              <div key={d} className="smart-cfx-row">
                <span className="channel-label">CH {d === 0 ? 'A' : 'B'}</span>
                <button className={`fx-toggle small ${state.fx.smartCfx[d].enabled ? 'active' : ''}`} onClick={() => engine.dispatch({ type: 'TOGGLE_SMART_CFX', deck: d as 0 | 1 })}>
                  {state.fx.smartCfx[d].enabled ? 'ON' : 'OFF'}
                </button>
                <input type="range" min={-1} max={1} step={0.01} value={state.fx.smartCfx[d].value} disabled={!state.fx.smartCfx[d].enabled} onChange={(e) => engine.dispatch({ type: 'SET_SMART_CFX_VALUE', deck: d as 0 | 1, value: parseFloat(e.target.value) })} />
              </div>
            ))}
          </div>

          <div className="fx-panel compact">
            <div className="fx-header">
              <span className="fx-label">Smart Fader</span>
              <button className={`fx-toggle ${state.fx.smartFader.enabled ? 'active' : ''}`} onClick={() => engine.dispatch({ type: 'TOGGLE_SMART_FADER' })}>
                {state.fx.smartFader.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      </section>}

      {activeTab === 'sampler' && <section className="drawer-section">
        <h2>Sampler</h2>
        <div className="sampler-inline">
          <label className="sampler-gain">
            Gain
            <input type="range" min={0} max={1} step={0.01} value={state.sampler.gain} onChange={(e) => engine.dispatch({ type: 'SET_SAMPLER_GAIN', gain: parseFloat(e.target.value) })} />
            <span>{(state.sampler.gain * 100).toFixed(0)}%</span>
          </label>
          <div className="sampler-grid">
            {state.sampler.slots.map((slot, i) => (
              <div key={i} className={`sampler-slot ${slot.loaded ? 'loaded' : ''} ${slot.playing ? 'playing' : ''}`}>
                <span className="slot-name">{slot.name ?? `S${i + 1}`}</span>
                <div className="slot-actions">
                  <button className="slot-load-btn" onClick={() => onSamplerLoad(i)}>Load</button>
                  {slot.loaded && (
                    <>
                      <button className="slot-trigger-btn" onPointerDown={() => engine.dispatch({ type: 'PAD_DOWN', deck: 0, padIndex: i })}>Play</button>
                      <button className="slot-stop-btn" onClick={() => engine.dispatch({ type: 'STOP_SAMPLER_SLOT', slot: i })}>Stop</button>
                      <button className="slot-unload-btn" onClick={() => engine.dispatch({ type: 'UNLOAD_SAMPLER_SLOT', slot: i })}>x</button>
                    </>
                  )}
                </div>
                <input ref={(el) => { samplerFileRefs.current[i] = el }} type="file" accept="audio/*" hidden onChange={(e) => onSamplerFile(i, e)} />
              </div>
            ))}
          </div>
        </div>
      </section>}

      {activeTab === 'midi' && <section className="drawer-section">
        <h2>MIDI</h2>
        <div className="midi-panel">
          <div className="midi-status">
            <span>Web MIDI: {midiSupported ? 'SUPPORTED' : 'NOT SUPPORTED'}</span>
            <span>Permission: {midiPermission.toUpperCase()}</span>
            {midiInputName && <span>Input: {midiInputName}</span>}
          </div>
          <div className="midi-actions">
            {!midiEnabled && midiSupported && <button className="midi-enable-btn" onClick={onEnableMidi}>Enable MIDI</button>}
            {midiEnabled && <button className="midi-disable-btn" onClick={onDisableMidi}>Disable MIDI</button>}
          </div>
          {midiLastMessage && <div className="midi-last-msg"><span>Last: {midiLastMessage}</span></div>}
        </div>
      </section>}
    </div>
  )
}

function SettingsPanel({
  state,
  midiSupported,
  debugEnabled,
  onToggleDebug,
  onMasterChange,
}: {
  state: DJState
  midiSupported: boolean
  debugEnabled: boolean
  onToggleDebug: () => void
  onMasterChange: (level: number) => void
}) {
  return (
    <div className="settings-panel">
      <section className="drawer-section">
        <h2>Audio</h2>
        <label className="control">
          <span>Master</span>
          <input type="range" min={0} max={1} step={0.01} value={state.master.level} onChange={(e) => onMasterChange(Number(e.target.value))} />
          <span>{(state.master.level * 100).toFixed(0)}%</span>
        </label>
      </section>

      <section className="drawer-section">
        <h2>Preferences</h2>
        <div className="settings-note">MIDI support: {midiSupported ? 'available' : 'unavailable in this browser'}</div>
      </section>

      <section className="drawer-section">
        <h2>Developer</h2>
        <button className={`toolbar-button ${debugEnabled ? 'active' : ''}`} onClick={onToggleDebug}>
          {debugEnabled ? 'Hide debug overlay' : 'Show debug overlay'}
        </button>
      </section>
    </div>
  )
}

export default function App() {
  const engineRef = useRef<DJEngineHandle | null>(null)
  if (!engineRef.current) engineRef.current = createDJEngine()
  const engine = engineRef.current

  const [state, setState] = useState<DJState>(engine.getState())
  const [activeDrawer, setActiveDrawer] = useState<Drawer>(null)
  const [activeEquipmentTab, setActiveEquipmentTab] = useState<EquipmentTab>('effects')
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [focusMode, setFocusMode] = useState(false)

  useEffect(() => {
    const unsub = engine.subscribe(setState)
    return unsub
  }, [engine])

  const libRef = useRef<LibraryService | null>(null)
  if (!libRef.current) libRef.current = new LibraryService()
  const lib = libRef.current
  const [libState, setLibState] = useState<LibraryState>(lib.getState())
  const refreshLib = useCallback(() => setLibState(lib.getState()), [lib])

  useEffect(() => {
    lib.options.onTrackAdded = () => refreshLib()
    lib.options.onTrackRemoved = () => refreshLib()
    lib.options.onTrackUpdated = () => refreshLib()
  }, [lib, refreshLib])

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

  const libraryBridge = useRef<LibraryBridge | null>(null)
  if (!libraryBridge.current) {
    libraryBridge.current = {
      select: (delta) => {
        lib.selectByDelta(delta)
        refreshLib()
      },
      load: (deck) => {
        const sel = lib.getState().selectedTrackId
        if (sel) loadFromLibrary(sel, deck)
      }
    }
  }

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

  const [midiSupported] = useState(() => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess)
  const [midiEnabled, setMidiEnabled] = useState(false)
  const [midiPermission, setMidiPermission] = useState<string>('unknown')
  const [midiInputName, setMidiInputName] = useState<string | null>(null)
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
          const d = Array.from(event.data).map((b) => b.toString(16).padStart(2, '0')).join(' ')
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

  const handleSeek = useCallback((deck: 0 | 1, percent: number) => {
    const duration = engine.getState().decks[deck].duration
    engine.dispatch({ type: 'SEEK', deck, seconds: (percent / 100) * duration })
  }, [engine])

  const toggleDrawer = useCallback((drawer: Exclude<Drawer, null>) => {
    setActiveDrawer((current) => current === drawer ? null : drawer)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isEditableTarget(event.target)) return
      setActiveDrawer(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={`studio-app ${focusMode ? 'focus-mode' : ''}`}>
      <TrackDisplayBar state={state} onSeek={handleSeek} />
      <StudioToolbar
        activeDrawer={activeDrawer}
        debugEnabled={debugEnabled}
        focusMode={focusMode}
        trackCount={libState.tracks.length}
        shiftPressed={state.shiftPressed}
        onToggleDrawer={toggleDrawer}
        onToggleDebug={() => setDebugEnabled((v) => !v)}
        onToggleFocus={() => setFocusMode((v) => !v)}
        onShiftDown={() => engine.dispatch({ type: 'SHIFT_DOWN' })}
        onShiftUp={() => engine.dispatch({ type: 'SHIFT_UP' })}
      />

      <main className="controller-stage">
        <ThreeScene interactive={true} engine={engine} library={libraryBridge.current!} showDebug={debugEnabled} />
      </main>

      {activeDrawer && <button className="drawer-scrim" aria-label="Close drawer" onClick={() => setActiveDrawer(null)} />}

      <aside className={`studio-drawer ${activeDrawer ? 'open' : ''}`} aria-hidden={!activeDrawer}>
        <div className="drawer-header">
          <h1>{activeDrawer === 'library' ? 'Music Library' : activeDrawer === 'equipment' ? 'Equipment' : 'Settings'}</h1>
          <button className="drawer-close" onClick={() => setActiveDrawer(null)}>Close</button>
        </div>

        {activeDrawer === 'library' && (
          <LibraryPanel
            library={libState}
            deckATrackId={state.decks[0].track?.id ?? null}
            deckBTrackId={state.decks[1].track?.id ?? null}
            onLoadA={(id) => loadFromLibrary(id, 0)}
            onLoadB={(id) => loadFromLibrary(id, 1)}
            onRemove={removeTrack}
            libRef={libRef}
            onRefresh={refreshLib}
          />
        )}
        {activeDrawer === 'equipment' && (
          <EquipmentPanel
            state={state}
            engine={engine}
            samplerFileRefs={samplerFileRefs}
            activeTab={activeEquipmentTab}
            midiSupported={midiSupported}
            midiEnabled={midiEnabled}
            midiPermission={midiPermission}
            midiInputName={midiInputName}
            midiLastMessage={midiLastMessage}
            onSetActiveTab={setActiveEquipmentTab}
            onSamplerLoad={handleSamplerLoad}
            onSamplerFile={handleSamplerFile}
            onEnableMidi={enableMidi}
            onDisableMidi={disableMidi}
          />
        )}
        {activeDrawer === 'settings' && (
          <SettingsPanel
            state={state}
            midiSupported={midiSupported}
            debugEnabled={debugEnabled}
            onToggleDebug={() => setDebugEnabled((v) => !v)}
            onMasterChange={(level) => engine.dispatch({ type: 'SET_MASTER', level })}
          />
        )}
      </aside>
    </div>
  )
}
