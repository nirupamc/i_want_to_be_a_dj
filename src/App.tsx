import React, { useCallback, useRef, useState, useEffect } from 'react'
import { createDJEngine, type DJEngineHandle, type DJState } from './engine'
import { LibraryService } from './library/LibraryService'
import type { LibraryState, LibrarySortField } from './library/libraryTypes'
import { getLoadedDeckIds } from './library/libraryHelpers'
import { BEAT_MULTIPLIER_LABELS } from './audio/effects/types'
import { getAudioEngine } from './audio'
import { DjWaveform } from './waveform/DjWaveform'
import { formatWaveformBpm } from './waveform/beatOverlay'
import { ThreeScene, type ControllerProjection } from './three/ddj-flx4/ThreeScene'
import type { LibraryBridge } from './three/ddj-flx4/dispatcher'
import type { DeckState } from './types'
import { isEditableTarget } from './input/keyboard'
import { formatRemaining, formatTime } from './selectors/deckDisplay'
import { StickerLayer } from './customization/StickerLayer'
import { ControlLabelsOverlay, type ControlLabelMode } from './components/ControlLabelsOverlay'
import {
  CONTROLLER_THEMES,
  createSticker,
  removeSticker,
  updateSticker,
  type ControllerSticker,
  type ControllerThemeId,
} from './customization/controllerCustomization'
import './index.css'

const FX_TYPES = ['ECHO', 'DELAY', 'REVERB', 'FLANGER', 'FILTER'] as const
const FX_TARGETS = ['A', 'B', 'MASTER'] as const

type Drawer = 'library' | 'equipment' | 'settings' | null
type EquipmentTab = 'effects' | 'sampler' | 'midi'
type SettingsTab = 'audio' | 'appearance' | 'customization' | 'midi' | 'developer'

function DeckTrackDisplay({
  deck,
  side,
  waveformData,
  onSeek,
}: {
  deck: DeckState
  side: 'left' | 'right'
  waveformData: ReturnType<DJEngineHandle['getWaveform']>
  onSeek: (seconds: number) => void
}) {
  const playState = deck.isPlaying ? 'Playing' : deck.isPaused ? 'Paused' : 'Stopped'

  return (
    <section className={`track-display deck-${side}`}>
      <div className="track-display-topline">
        <span className="track-deck-label">Deck {deck.id === 0 ? 'A' : 'B'}</span>
        <span className={`track-state ${deck.isPlaying ? 'playing' : ''}`}>{playState}</span>
      </div>
      <div className="track-title" title={deck.track?.name ?? 'No track loaded'}>
        {deck.track?.title ?? deck.track?.name ?? 'No track loaded'}
      </div>
      <div className="track-artist">{deck.track?.artist ?? 'Unknown artist'}</div>
      <div className="track-meta">
        <span className="bpm-badge">{formatWaveformBpm(deck)}</span>
        <span className="time-pair">
          <span>{formatTime(deck.position)}</span>
          <span>{formatRemaining(deck.position, deck.duration)}</span>
        </span>
      </div>
      <div className="deck-overview-waveform">
        <DjWaveform
          deck={deck.id}
          variant="overview"
          waveformData={waveformData}
          position={deck.position}
          duration={deck.duration}
          beatGrid={deck.analysis.beatGrid}
          loop={deck.loop}
          hotCues={deck.hotCues}
          onSeek={onSeek}
        />
      </div>
    </section>
  )
}

function TrackDisplayBar({ state, engine, onSeek }: { state: DJState; engine: DJEngineHandle; onSeek: (deck: 0 | 1, seconds: number) => void }) {
  const waveformA = state.decks[0].track ? engine.getWaveform(state.decks[0].track.id) : null
  const waveformB = state.decks[1].track ? engine.getWaveform(state.decks[1].track.id) : null

  return (
    <header className="track-display-bar">
      <DeckTrackDisplay deck={state.decks[0]} side="left" waveformData={waveformA} onSeek={(seconds) => onSeek(0, seconds)} />
      <section className="combined-waveform-area" aria-label="Detailed waveforms">
        <div className="waveform-lane">
          <span className="waveform-deck-chip deck-a">A</span>
          <DjWaveform
            deck={0}
            variant="detail"
            waveformData={waveformA}
            position={state.decks[0].position}
            duration={state.decks[0].duration}
            beatGrid={state.decks[0].analysis.beatGrid}
            loop={state.decks[0].loop}
            hotCues={state.decks[0].hotCues}
            onSeek={(seconds) => onSeek(0, seconds)}
          />
        </div>
        <div className="waveform-lane">
          <span className="waveform-deck-chip deck-b">B</span>
          <DjWaveform
            deck={1}
            variant="detail"
            waveformData={waveformB}
            position={state.decks[1].position}
            duration={state.decks[1].duration}
            beatGrid={state.decks[1].analysis.beatGrid}
            loop={state.decks[1].loop}
            hotCues={state.decks[1].hotCues}
            onSeek={(seconds) => onSeek(1, seconds)}
          />
        </div>
      </section>
      <DeckTrackDisplay deck={state.decks[1]} side="right" waveformData={waveformB} onSeek={(seconds) => onSeek(1, seconds)} />
    </header>
  )
}

function StudioToolbar({
  activeDrawer,
  focusMode,
  trackCount,
  midiEnabled,
  labelMode,
  testerMode,
  onToggleDrawer,
  onToggleFocus,
  onCycleLabelMode,
  onToggleTesterMode,
}: {
  activeDrawer: Drawer
  focusMode: boolean
  trackCount: number
  midiEnabled: boolean
  labelMode: ControlLabelMode
  testerMode: boolean
  onToggleDrawer: (drawer: Exclude<Drawer, null>) => void
  onToggleFocus: () => void
  onCycleLabelMode: () => void
  onToggleTesterMode: () => void
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
        <span className={`toolbar-midi ${midiEnabled ? 'active' : ''}`}>MIDI {midiEnabled ? 'on' : 'off'}</span>
        <button className={`toolbar-button toolbar-labels-button ${labelMode !== 'off' ? 'active' : ''}`} onClick={onCycleLabelMode} aria-pressed={labelMode !== 'off'}>
          Labels {labelMode === 'off' ? 'Off' : labelMode === 'minimal' ? 'Minimal' : 'Full'}
        </button>
        <button className={`toolbar-button toolbar-labels-button ${testerMode ? 'active' : ''}`} onClick={onToggleTesterMode} aria-pressed={testerMode}>
          Tester {testerMode ? 'On' : 'Off'}
        </button>
        <button className={`toolbar-icon-button ${focusMode ? 'active' : ''}`} onClick={onToggleFocus} aria-label="Toggle focus view" title="Toggle focus view">
          <span aria-hidden="true" />
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
        {label} {isActive ? (library.sortDirection === 'asc' ? 'up' : 'down') : ''}
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
                <th>Status</th>
                <th>Loaded</th>
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
                      {track.analysisStatus === 'ready' ? 'Ready' : track.analysisStatus === 'analyzing' ? 'Analyzing' : track.analysisStatus === 'failed' ? 'Failed' : 'Idle'}
                    </td>
                    <td className="col-loaded">
                      {inA && <span className="loaded-badge deck-a">A</span>}
                      {inB && <span className="loaded-badge deck-b">B</span>}
                    </td>
                    <td className="col-actions">
                      <button className="load-a-btn" onClick={(e) => { e.stopPropagation(); onLoadA(track.id) }} title="Load to Deck A">Load A</button>
                      <button className="load-b-btn" onClick={(e) => { e.stopPropagation(); onLoadB(track.id) }} title="Load to Deck B">Load B</button>
                      <button className="remove-btn" onClick={(e) => { e.stopPropagation(); onRemove(track.id) }} title="Remove from library">Remove</button>
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
  themeId,
  stickers,
  selectedStickerId,
  stickerEditMode,
  activeTab,
  onToggleDebug,
  onMasterChange,
  onThemeChange,
  onStickerFile,
  onSelectSticker,
  onUpdateSticker,
  onRemoveSticker,
  onToggleStickerEditMode,
  onSetActiveTab,
}: {
  state: DJState
  midiSupported: boolean
  debugEnabled: boolean
  themeId: ControllerThemeId
  stickers: ControllerSticker[]
  selectedStickerId: string | null
  stickerEditMode: boolean
  activeTab: SettingsTab
  onToggleDebug: () => void
  onMasterChange: (level: number) => void
  onThemeChange: (theme: ControllerThemeId) => void
  onStickerFile: (event: React.ChangeEvent<HTMLInputElement>) => void
  onSelectSticker: (id: string | null) => void
  onUpdateSticker: (id: string, patch: Partial<Omit<ControllerSticker, 'id' | 'imageDataUrl'>>) => void
  onRemoveSticker: (id: string) => void
  onToggleStickerEditMode: () => void
  onSetActiveTab: (tab: SettingsTab) => void
}) {
  const stickerFileRef = useRef<HTMLInputElement>(null)
  const selectedSticker = stickers.find((sticker) => sticker.id === selectedStickerId) ?? null

  return (
    <div className="settings-panel">
      <div className="drawer-tabs settings-tabs" role="tablist" aria-label="Settings">
        {(['audio', 'appearance', 'customization', 'midi', 'developer'] as const).map((tab) => (
          <button key={tab} className={`drawer-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => onSetActiveTab(tab)}>
            {tab === 'midi' ? 'MIDI' : tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'audio' && <section className="drawer-section">
        <h2>Audio</h2>
        <label className="control">
          <span>Master</span>
          <input type="range" min={0} max={1} step={0.01} value={state.master.level} onChange={(e) => onMasterChange(Number(e.target.value))} />
          <span>{(state.master.level * 100).toFixed(0)}%</span>
        </label>
      </section>}

      {activeTab === 'appearance' && <section className="drawer-section customization-section">
        <h2>Appearance</h2>
        <div className="theme-options" role="group" aria-label="Controller theme">
          {CONTROLLER_THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-option ${themeId === theme.id ? 'active' : ''}`}
              onClick={() => onThemeChange(theme.id)}
              type="button"
            >
              <span className="theme-preview" style={{ '--theme-accent': theme.accent } as React.CSSProperties} />
              <span>{theme.label}</span>
            </button>
          ))}
        </div>
      </section>}

      {activeTab === 'customization' && <section className="drawer-section customization-section">
        <h2>Customization</h2>
        <div className="sticker-controls">
          <button className="import-btn" type="button" onClick={() => stickerFileRef.current?.click()}>Add sticker</button>
          <button className={`toolbar-button ${stickerEditMode ? 'active' : ''}`} type="button" onClick={onToggleStickerEditMode}>
            {stickerEditMode ? 'Finish editing' : 'Edit stickers'}
          </button>
          <input ref={stickerFileRef} type="file" accept="image/*" hidden onChange={onStickerFile} />
          {stickers.length > 0 && (
            <select value={selectedStickerId ?? ''} onChange={(event) => onSelectSticker(event.target.value || null)} aria-label="Selected sticker">
              <option value="">No sticker selected</option>
              {stickers.map((sticker) => <option key={sticker.id} value={sticker.id}>{sticker.name}</option>)}
            </select>
          )}
        </div>
        {selectedSticker && (
          <div className="sticker-adjustments">
            <label className="control">
              <span>Scale</span>
              <input type="range" min={0.35} max={2.2} step={0.01} value={selectedSticker.scale} onChange={(event) => onUpdateSticker(selectedSticker.id, { scale: Number(event.target.value) })} />
              <span>{selectedSticker.scale.toFixed(2)}x</span>
            </label>
            <label className="control">
              <span>Rotation</span>
              <input type="range" min={-180} max={180} step={1} value={selectedSticker.rotation} onChange={(event) => onUpdateSticker(selectedSticker.id, { rotation: Number(event.target.value) })} />
              <span>{selectedSticker.rotation.toFixed(0)} deg</span>
            </label>
            <label className="control">
              <span>Gloss</span>
              <input type="range" min={0} max={1} step={0.01} value={selectedSticker.gloss} onChange={(event) => onUpdateSticker(selectedSticker.id, { gloss: Number(event.target.value) })} />
              <span>{Math.round(selectedSticker.gloss * 100)}%</span>
            </label>
            <label className="control">
              <span>Finish</span>
              <select value={selectedSticker.finish} onChange={(event) => onUpdateSticker(selectedSticker.id, { finish: event.target.value as ControllerSticker['finish'] })}>
                <option value="matte">Matte</option>
                <option value="glossy">Glossy</option>
                <option value="holographic">Holographic</option>
              </select>
              <span>{selectedSticker.placementMode}</span>
            </label>
            <button className="remove-btn sticker-remove" type="button" onClick={() => onRemoveSticker(selectedSticker.id)}>Remove sticker</button>
          </div>
        )}
      </section>}

      {activeTab === 'midi' && <section className="drawer-section">
        <h2>MIDI</h2>
        <div className="settings-note">Web MIDI is {midiSupported ? 'available' : 'unavailable in this browser'}.</div>
      </section>}

      {activeTab === 'developer' && <section className="drawer-section">
        <h2>Developer</h2>
        <button className={`toolbar-button ${debugEnabled ? 'active' : ''}`} onClick={onToggleDebug}>
          {debugEnabled ? 'Hide debug overlay' : 'Show debug overlay'}
        </button>
      </section>}
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
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('audio')
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [labelMode, setLabelMode] = useState<ControlLabelMode>('off')
  const [testerMode, setTesterMode] = useState(false)
  const [controllerTheme, setControllerTheme] = useState<ControllerThemeId>('default-dark')
  const [stickers, setStickers] = useState<ControllerSticker[]>([])
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null)
  const [stickerEditMode, setStickerEditMode] = useState(false)
  const [controllerProjection, setControllerProjection] = useState<ControllerProjection | null>(null)
  const [hoveredControlId, setHoveredControlId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = engine.subscribe(setState)
    return unsub
  }, [engine])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const globals = globalThis as typeof globalThis & { __LEN_DJ_ENGINE__?: DJEngineHandle }
    globals.__LEN_DJ_ENGINE__ = engine
    return () => {
      if (globals.__LEN_DJ_ENGINE__ === engine) delete globals.__LEN_DJ_ENGINE__
    }
  }, [engine])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const globals = globalThis as typeof globalThis & { __PHASE2_ADD_STICKER__?: (imageDataUrl: string) => void }
    globals.__PHASE2_ADD_STICKER__ = (imageDataUrl: string) => {
      const sticker = createSticker({
        id: `sticker-${Date.now()}-${Math.round(Math.random() * 10000)}`,
        name: 'Phase 2 sticker',
        imageDataUrl,
        x: 0.5,
        y: 0.38,
      })
      setStickers((current) => [...current, sticker])
      setSelectedStickerId(sticker.id)
      setStickerEditMode(true)
    }
    return () => {
      delete globals.__PHASE2_ADD_STICKER__
    }
  }, [])

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
    const libraryTrack = lib.getState().tracks.find((track) => track.id === trackId)
    if (!file) return

    try {
      const audioBuffer = await getAudioEngine().decode(file)

      engine.dispatch({
        type: 'LOAD_TRACK',
        deck: deckIdx,
        track: {
          id: trackId,
          name: libraryTrack?.title ?? file.name,
          buffer: audioBuffer,
          duration: audioBuffer.duration,
          title: libraryTrack?.title ?? file.name,
          artist: libraryTrack?.artist ?? null,
          bpm: libraryTrack?.analyzedBpm ?? null,
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

  const handleSeek = useCallback((deck: 0 | 1, seconds: number) => {
    const duration = engine.getState().decks[deck].duration
    engine.dispatch({ type: 'SEEK', deck, seconds: Math.max(0, Math.min(duration, seconds)) })
  }, [engine])

  const handleStickerFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      if (!result) return
      const sticker = createSticker({
        id: `sticker-${Date.now()}-${Math.round(Math.random() * 10000)}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        imageDataUrl: result,
        x: 0.5,
        y: 0.45,
      })
      setStickers((current) => [...current, sticker])
      setSelectedStickerId(sticker.id)
      setStickerEditMode(true)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }, [])

  const handleStickerChange = useCallback((sticker: ControllerSticker) => {
    setStickers((current) => current.map((entry) => entry.id === sticker.id ? sticker : entry))
  }, [])

  const handleStickerUpdate = useCallback((id: string, patch: Partial<Omit<ControllerSticker, 'id' | 'imageDataUrl'>>) => {
    setStickers((current) => updateSticker(current, id, patch))
  }, [])

  const handleStickerRemove = useCallback((id: string) => {
    setStickers((current) => removeSticker(current, id))
    setSelectedStickerId((current) => current === id ? null : current)
  }, [])

  const toggleDrawer = useCallback((drawer: Exclude<Drawer, null>) => {
    setActiveDrawer((current) => current === drawer ? null : drawer)
  }, [])

  const cycleLabelMode = useCallback(() => {
    setLabelMode((current) => current === 'off' ? 'minimal' : current === 'minimal' ? 'full' : 'off')
  }, [])

  const toggleTesterMode = useCallback(() => {
    setTesterMode((current) => {
      const next = !current
      if (next) setLabelMode('full')
      return next
    })
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
      {state.transportError && <div className="transport-toast" role="alert">{state.transportError}</div>}
      <TrackDisplayBar state={state} engine={engine} onSeek={handleSeek} />
      <StudioToolbar
        activeDrawer={activeDrawer}
        focusMode={focusMode}
        trackCount={libState.tracks.length}
        midiEnabled={midiEnabled}
        labelMode={labelMode}
        testerMode={testerMode}
        onToggleDrawer={toggleDrawer}
        onToggleFocus={() => setFocusMode((v) => !v)}
        onCycleLabelMode={cycleLabelMode}
        onToggleTesterMode={toggleTesterMode}
      />

      <main className="controller-stage">
        <ThreeScene
          interactive={true}
          engine={engine}
          library={libraryBridge.current!}
          showDebug={debugEnabled}
          themeId={controllerTheme}
          onProjectionUpdate={setControllerProjection}
          onHoverControl={setHoveredControlId}
        />
        <ControlLabelsOverlay mode={labelMode} testerMode={testerMode} hoveredId={hoveredControlId} projection={controllerProjection} />
        <StickerLayer
          stickers={stickers}
          selectedId={selectedStickerId}
          editMode={stickerEditMode}
          controllerBounds={controllerProjection?.bounds ?? null}
          onSelect={setSelectedStickerId}
          onChange={handleStickerChange}
        />
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
            themeId={controllerTheme}
            stickers={stickers}
            selectedStickerId={selectedStickerId}
            stickerEditMode={stickerEditMode}
            activeTab={activeSettingsTab}
            onToggleDebug={() => setDebugEnabled((v) => !v)}
            onMasterChange={(level) => engine.dispatch({ type: 'SET_MASTER', level })}
            onThemeChange={setControllerTheme}
            onStickerFile={handleStickerFile}
            onSelectSticker={setSelectedStickerId}
            onUpdateSticker={handleStickerUpdate}
            onRemoveSticker={handleStickerRemove}
            onToggleStickerEditMode={() => setStickerEditMode((value) => !value)}
            onSetActiveTab={setActiveSettingsTab}
          />
        )}
      </aside>
    </div>
  )
}
