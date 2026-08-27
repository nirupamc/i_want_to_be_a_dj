# ARCHITECTURE.md

## Goal

A browser-based DJ application inspired by the Pioneer DDJ-FLX4. The UI is a
virtual front panel; underneath it a deterministic engine produces audio via
the Web Audio API.

## Core rule: no UI touches audio directly

```
  Pointer / Touch / Future 3D Input
        │
        ▼
  ┌─────────────────────────────────┐
  │  Jog Interaction Layer          │  normalizes pointer events to
  │  (src/audio/jogInteraction.ts)  │  angular deltas + velocity
  └───────────────┬─────────────────┘
                  │  { type: 'JOG_PLATTER_MOVE', deltaRadians, velocity, direction }
                  ▼
  ┌─────────────────────────────────┐
  │  UI Layer (React components)    │  emits high-level actions only
  └───────────────┬─────────────────┘
                  │  dispatch({ type: 'SCRATCH_MOVE', deck, deltaRadians, velocity })
                  ▼
  ┌─────────────────────────────────┐
  │  DJ Engine (controller state)   │  owns playback semantics, queues
  │  dispatch(action)                │  actions, publishes serialisable state
  └───────────────┬─────────────────┘
                  │  deck.moveScratch(deltaRadians, velocity)
                  ▼
  ┌─────────────────────────────────┐
  │  Scratch / Transport Layer      │  scratch position, preview source,
  │  DeckEngine (transport)         │  play/pause/seek/tempo/nudge lifecycle
  └───────────────┬─────────────────┘
                  │  AudioBufferSourceNode.gain.linearRamp...
                  ▼
  ┌─────────────────────────────────┐
  │  Audio Engine (audio graph)     │  node wiring + gain + filter + meter
  └───────────────┬─────────────────┘
                  │  GainNode.gain.linearRampToValueAtTime(...)
                  ▼
  ┌─────────────────────────────────┐
  │  Web Audio API                  │
  └─────────────────────────────────┘
```

## Layers

### 1. Jog Interaction Layer (`src/audio/jogInteraction.ts`)

Framework-independent jog wheel input handling. Two zones: platter (scratch
intent) and rim (nudge). Normalizes pointer events to angular deltas and
velocity. Dispatches JOG_PLATTER_* and JOG_RIM_* actions.

### 2. UI Layer (`src/components`)

Pure React components. No `new AudioContext()`, no `AudioBuffer` imports.
Each physical control emits an action. JogWheel dispatches JOG_* actions
via the interaction layer. Scratch debug indicators show active state,
position, direction, velocity, wasPlaying. WaveformDisplay uses Canvas
for efficient waveform rendering.

### 3. DJ Engine (`src/engine`)

`createDJEngine()` factory. Handles all semantic actions including
SCRATCH_START/MOVE/END, LOAD_TRACK, SET_MANUAL_BPM, and analysis actions.
Wires JOG_PLATTER_* to scratch lifecycle. Manages analysis state transitions.

### 4. Audio Engine + DeckEngine (`src/audio`)

- `AudioEngine`: singleton, owns the Web Audio graph.
- `DeckEngine`: per-deck transport. Play/pause/seek/tempo/nudge AND scratch.
- Scratch methods: `startScratch()`, `moveScratch()`, `endScratch()`, `forceStopScratch()`
- Source management: normal source + scratch preview source, never overlapping.

### 5. Analysis Layer (`src/analysis/`)

Framework-independent track analysis. Produces waveform data, BPM estimate,
and beatgrid from decoded PCM. Not in React; consumed as data by UI.

```
src/analysis/
├── analysisTypes.ts   — TrackAnalysis, WaveformData, BeatGrid interfaces
├── waveform.ts        — PCM → peak/RMS waveform arrays
├── bpm.ts             — Energy envelope → onset detection → BPM candidate → octave folding
├── beatgrid.ts        — BPM + anchor → beat timestamps + lookup helpers
├── TrackAnalyzer.ts   — Async pipeline orchestrator with stale-result protection
└── analysis.test.ts   — 41 comprehensive tests
```

## Track Analysis Pipeline

```
AudioBuffer (decoded PCM)
    │
    ▼
TrackAnalyzer.analyze(buffer, trackId)
    │
    ├──→ waveform.ts: extractPeaksRms(buffer, pointsPerSecond)
    │      → downmix stereo to mono
    │      → partition into time buckets
    │      → peak + RMS per bucket
    │      → normalise to [0, 1]
    │
    ├──→ bpm.ts: estimateBpm(buffer)
    │      → downmix + downsample to 11,025 Hz
    │      → windowed energy envelope (512 samples, 256 hop)
    │      → positive onset-strength signal
    │      → adaptive threshold peak detection
    │      → inter-onset interval histogram
    │      → tempo candidate → octave fold to 70–180 BPM
    │      → confidence from vote concentration
    │
    └──→ beatgrid.ts: generateBeatGrid(bpm, firstBeatSec, duration)
           → regular intervals from anchor
           → findNearestBeat / findPreviousBeat / findNextBeat
           → timeToBeatIndex / beatIndexToTime
    │
    ▼
TrackAnalysis { waveform, bpm, bpmConfidence, beatGrid, analysisVersion }
```

## Stale Analysis Protection

Each track loaded receives a unique `trackId`. The analyzer carries this ID
through the async pipeline. When results arrive, the engine verifies the ID
matches the current deck's track before applying. This prevents a slow
analysis from overwriting a newer track's state.

```
User loads Track A → deck.trackId = 'A'
Analysis starts for A
User loads Track B → deck.trackId = 'B'
Analysis for A finishes → deck.trackId !== 'A' → result discarded
Analysis for B finishes → deck.trackId === 'B' → result applied
```

## Manual BPM Override

When manual BPM is set:
- `manualBpm` overrides `analyzedBpm` as the effective source
- Beatgrid is regenerated using `rebuildBeatGridFromManual()`
- `effectiveBpm` recomputes via `sourceBpm * playbackRate`
- Original analyzed result is preserved (not destroyed)

## Data flow: scratch lifecycle

```
UI: JogPlatter.onPointerDown()
  → JogInteraction.handleJogPointerDown()
  → dispatch({ type: 'JOG_PLATTER_START', deck: 0 })
  → DJEngine: handleScratchStart(0)
    → sc.wasPlayingBeforeScratch = d.isPlaying
    → sc.active = true
    → d.startScratch() // pauses normal playback, captures position
    → d.stopNudge()
    → syncDeck()

UI: JogPlatter.onPointerMove()
  → dispatch({ type: 'JOG_PLATTER_MOVE', deck: 0, deltaRadians, velocity, direction })
  → DJEngine: handleScratchMove(0, delta, vel, dir)
    → sc.direction = dir, sc.velocity = vel
    → d.moveScratch(delta, vel)
      → secondsDelta = delta * SCRATCH_SECONDS_PER_RADIAN
      → _scratchPosition = clamp(_scratchPosition + secondsDelta)
      → _updateScratchPreview(vel) // stop old, create new source at position
    → sc.currentPosition = d.currentTime

UI: JogPlatter.onPointerUp()
  → dispatch({ type: 'JOG_PLATTER_END', deck: 0 })
  → DJEngine: handleScratchEnd(0)
    → d.endScratch() // stop preview, persist position
    → if wasPlaying: d.resumeAfterScratch()
    → syncDeck()
```

## Scratch source strategy

**Micro-source recreation**: Each meaningful platter movement stops the
previous scratch preview source and creates a new one at the current
scrub position.

Guarantees:
- Only one scratch preview source active per deck at any time
- Previous source stopped/disconnected before replacement
- Normal transport source and scratch source are mutually exclusive
- After scratch ends, normal playback uses a fresh source node

Future replacement path: The scratch engine can be swapped to use
AudioWorklet + WASM granular DSP without changing the DJEngine or UI layers.
The DeckEngine's `startScratch`/`moveScratch`/`endScratch` interface is
the replacement boundary.

### 6. Beat Engine (`src/analysis/beatEngine.ts`)

Framework-independent beat-aware domain logic. Provides sync, loop, and
beat-jump math. Consumed by DJEngine. All state is serializable.

```
src/analysis/
├── beatEngine.ts      — sync, loop, beat jump domain logic
└── beatEngine.test.ts — 66 comprehensive tests
```

## Beat Sync Design

### Master/slave model

- One deck is explicitly set as master via `SET_SYNC_MASTER`
- Other deck becomes slave when `TOGGLE_BEAT_SYNC` is enabled
- Master deck's effective BPM (manual override > analyzed) drives sync
- Slave's playbackRate is adjusted to match master BPM

### Tempo match

```
requiredRate = masterEffectiveBpm / slaveSourceBpm
requiredTempoPercent = (requiredRate - 1) × 100
```

Clamped to slave's current tempo range. If exceeded, sync is rejected.

### Phase alignment

One-time seek correction on sync engage:
1. Find nearest slave beat to current position
2. Find nearest master beat to that slave beat
3. Calculate offset and seek slave to align

Phase alignment is NOT continuous drift correction (no PLL).

### Interaction with other controls

- Manual tempo slider on slave → disables sync (manual takeover)
- Scratch → ignores sync (scratch owns transport)
- Nudge → temporary deviation; on release, sync target is re-applied
- Master tempo change → slave auto-updates
- Track load → clears sync state

## Loop Engine Design

### Loop lifecycle

```
LOOP_IN → captures quantized position as IN point
LOOP_OUT → creates active loop (OUT must be > IN)
LOOP_4_BEAT → auto 4-beat loop (or exit if already active)
LOOP_HALF → halve loop length (min 0.25 beats)
LOOP_DOUBLE → double loop length (max 32 beats)
LOOP_EXIT → deactivate loop, continue playback
```

### Quantization

When beatgrid exists, IN and OUT points snap to nearest beat.
Auto loops use exact grid boundaries.

### Transport wrapping

During playback, if position >= loop end:
1. Calculate overflow: `overflow = position - loopEnd`
2. Wrap: `newPos = loopStart + (overflow % loopLength)`
3. Seek to wrapped position
4. Preserve overflow to prevent timing loss

### Source lifecycle

Loop wrapping triggers a seek, which recreates the source node.
Old source stopped, fresh source at wrapped position, playbackRate preserved.

## Beat Jump Design

### Grid-index mapping

```
currentIdx = nearest beat index to current position
targetIdx = currentIdx + jumpBeats
targetTime = beatIndexToTime(targetIdx)
```

Uses beatgrid indices (not raw seconds × BPM) for grid alignment.

### Boundary behavior

- Jump before first beat → clamp to first beat
- Jump after last beat → clamp to last beat
- No beatgrid → command rejected (no-op)

### Loop interaction

Beat jump while loop active → shifts the whole loop by beat amount:
```
newLoopStart = oldLoopStart + jumpBeats × beatInterval
newLoopEnd = oldLoopEnd + jumpBeats × beatInterval
```
Clamped to track boundaries.

### 7. Performance Pads (M8)

Generic pad system: 8 pads per deck, mode-routed through DJEngine.
UI/3D only emits `PAD_DOWN(deck, index)` / `PAD_UP(deck, index)`.
The engine inspects current `padMode` and routes accordingly.

```
UI: <Pad onPointerDown={() => dispatch({ type: 'PAD_DOWN', deck: 0, padIndex: 3 })} />
    ↓
DJEngine.handlePadDown(0, 3)
    ↓
  switch (padMode):
    HOT_CUE  → handleHotCuePad(0, 3, shift)
    BEAT_LOOP → handleBeatLoopPad(0, 3) → createAutoLoop(...)
    BEAT_JUMP → handleBeatJumpPad(0, 3) → handleBeatJump(0, +2)
    SAMPLER   → handleSamplerPad(3, shift) → sampler.trigger(3)
```

### 8. Sampler Engine (`src/audio/SamplerEngine.ts`)

Owns 8 sample slots with private AudioBuffer storage.
Dedicated sampler bus → master gain → destination.
Independent from deck transport.

```
SamplerEngine
├── buffers: Map<slot, AudioBuffer>     — private, not serialized
├── sources: Map<slot, SourceNode>      — active playback
├── gainNode: GainNode                  — sampler master bus
└── methods: loadSlot, trigger, stopSlot, unloadSlot, setGain, destroy
```

Audio routing:
```
Sampler Source → Sampler GainNode → Master GainNode → Destination
```

Not routed through deck channel faders. Sampler responds to master gain.

### 9. Effects Engine (`src/audio/effects/`)

Insert-effect architecture for Beat FX, Release FX, Smart CFX, Smart Fader.
Effects are insert effects placed on per-deck or master buses.

```
src/audio/effects/
├── types.ts          — BeatFxType, BeatFxTarget, ReleaseFxType, state interfaces
├── math.ts           — beat timing, wet/dry, impulse gen, smart fader mapping
├── EffectsEngine.ts  — Web Audio effect nodes, routing, enable/disable lifecycle
└── effects.test.ts   — 41 comprehensive tests
```

Beat FX signal flow:
```
Deck output → Effect Input → [dry path] → Effect Output → Master Input
                             [wet path via effect nodes]
```

Effect types: Echo, Delay (with feedback), Reverb (ConvolverNode + procedural IR),
Flanger (DelayNode + LFO + feedback), Filter (bandpass).

Release FX: Echo Out triggers momentary echo with dry reduction, auto-decays.

Smart CFX: Per-channel macro knob drives filter cutoff.
Smart Fader: Crossfader position drives EQ automation across both channels.

### 10. Library Layer (`src/library/`)

Local track library with search/sort/filter. Private File cache.

```
src/library/
├── libraryTypes.ts    — LibraryTrack, LibraryState, sort/filter types
├── libraryHelpers.ts  — search, sort, filter, duplicate detection (framework-independent)
├── LibraryService.ts  — add/remove tracks, File cache, analysis cache, UI state
└── library.test.ts    — 36 comprehensive tests
```

File ownership model:
- `LibraryTrack` (serializable) — metadata only, no File/AudioBuffer
- `LibraryService.fileCache` (private) — `Map<trackId, File>` runtime references
- `LibraryService.analysisCache` (private) — `Map<trackId, TrackAnalysis>` shared analysis

Import flow:
```
Local File → LibraryService.addTrack() → LibraryTrack record → File cached privately
            → analysis starts lazily → metadata updated when ready
```

Deck load flow:
```
Library track ID → getFileForTrack() → existing DJEngine LOAD_TRACK → analysis/waveform reuse
```

## Interfaces

```ts
interface DeckTransport {
  // ... existing methods ...
  startScratch(): number;
  moveScratch(deltaRadians: number, velocity: number): void;
  endScratch(): number;
  forceStopScratch(): void;
  resumeAfterScratch(): void;
  readonly isScratching: boolean;
}
```

## MIDI Layer (M11)

Physical controllers and future 3D controllers connect through a shared semantic action layer:

```
Debug UI ─────────┐
Physical MIDI ────┼──→ DJEngine semantic actions
3D Controller ────┘
```

### Components

- **MidiParser**: Framework-independent 3-byte MIDI message parser (Note On/Off, CC, Pitch Bend)
- **MidiMapper**: Data-driven mapping config → DJEngine actions. Handles normalization, relative encoders, soft takeover, button debounce
- **MidiManager**: Web MIDI API integration — permission, device discovery, hot-plug, monitor, learn mode
- **DDJ-FLX4 mapping**: Configuration file mapping physical controls to actions. All mappings marked UNVERIFIED pending real device capture

### Signal flow

```
Physical Device
↓ (MIDI bytes)
MidiManager
↓ (ParsedMidiMessage)
MidiMapper
↓ (semantic Action)
DJEngine
↓
DeckEngine / AudioEngine
```

### Key rules

- MIDI adapts to the engine, not the other way around
- All FLX4 mappings currently UNVERIFIED — use MIDI Monitor/Learn to capture actual values
- Soft takeover prevents parameter jumps when app state differs from hardware
- Disconnect cleanup releases all held states (SHIFT, pads, jog, cue)
- No second AudioContext for MIDI

## Non-goals

- No backend, no cloud. All audio is local files.
- No key lock. Tempo changes affect pitch.
- No continuous phase-lock PLL.
- No inertia/backspin.
- No granular/WASM scratch DSP.
