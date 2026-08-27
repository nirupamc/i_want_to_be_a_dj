# MILESTONES.md

Each milestone is a shippable slice: docs + code + tests, all green, before
the next begins. A control listed in a milestone's scope must be wired; every
control NOT listed must be absent or disabled.

## Milestone Roadmap

```
M0  Architecture + Controller Spec        COMPLETE
M1  Dual Deck Audio                       COMPLETE
M2  Mixer DSP                             COMPLETE
M3  Transport + Cue + Tempo               COMPLETE
M4  Jog Wheel Interaction                 COMPLETE
M5  Scratch Engine                        COMPLETE
M6  Waveform + BPM + Beatgrid             COMPLETE
M7  Beat Sync + Loops + Beat Jump         COMPLETE
M8  Hot Cues + Performance Pads + Sampler COMPLETE
M9  Effects + Smart Controls              COMPLETE
M10 Library + Navigation + Application UX COMPLETE
M11 MIDI / Physical DDJ-FLX4 CURRENT
M12 3D Controller Integration
M13 Advanced Scratch / AudioWorklet DSP
M14 AI DJ Coach
```

## M0 — Architecture + Controller Specification

- [x] Project scaffold, docs, conventions

## M1 — Dual-Deck Audio Proof

- [x] `[PLAY/PAUSE]`, `[CUE]`, `[TEMPO]`, track load, seek

## M2 — Proper Mixer DSP

- [x] `[TRIM]`, `[EQ]`, `[CFX]`, faders, crossfader, master, meters

## M3 — Transport + Cue + Tempo + Nudge

- [x] Enhanced transport, CUE_DOWN/UP, tempo ranges, nudge

## M4 — Jog Wheel Interaction + Scratch Groundwork

- [x] Jog wheel input model, angular delta, velocity, scratch intent

## M5 — Scratch Engine / Audio Scrubbing

- [x] Scratch lifecycle, delta-to-position, audio preview, source safety

## M6 — Waveform + BPM + Beatgrid

- [x] Waveform extraction, BPM estimation, beatgrid, manual BPM override

## M7 — Beat Sync + Beat Loops + Beat Jump

- [x] Master/slave sync, tempo match, phase alignment
- [x] Beat-based loops, grid-index beat jump

## M8 — Hot Cues + Performance Pads + Sampler

- [x] Hot cues (save/trigger/delete), beat loop/jump pads, sampler engine

## M9 — Effects + Smart Controls

- [x] Beat FX (Echo, Delay, Reverb, Flanger, Filter), Release FX, Smart CFX, Smart Fader

## M10 — Track Library + Navigation + Application UX

Application shell with local track library, search/sort/filter, and improved UX.

**Library domain model:**
- [x] `LibraryTrack` type with serializable metadata (id, title, artist, BPM, duration, analysis status)
- [x] `LibraryService` with private File cache (File objects never in serialized state)
- [x] Duplicate prevention (same name+size+lastModified → reuse existing entry)
- [x] Track add/remove/clear
- [x] Analysis integration (reuse M6 TrackAnalyzer, cache results)
- [x] Track identity: `fileName + fileSize + lastModified`

**Search/Sort/Filter:**
- [x] Case-insensitive search across title, artist, fileName
- [x] Sort by Title, Artist, BPM, Duration, Added, Last Played
- [x] Filter by status: All, Analyzed, Analyzing, Failed
- [x] Null values sort deterministically

**Track loading workflow:**
- [x] LOAD A / LOAD B buttons per library row
- [x] Uses existing DJEngine LOAD_TRACK pipeline
- [x] Reuses cached analysis when available
- [x] Loaded-track indicators (A/B badges)
- [x] Recently played tracking

**Application UX:**
- [x] Reorganized layout: decks top, effects+sampler collapsible, library bottom
- [x] Collapsible sections (Effects, Sampler) — default closed
- [x] Empty state: "Import audio files to begin"
- [x] Library toolbar: search input, filter buttons, import button
- [x] Library table: sortable column headers, loaded indicators, action buttons
- [x] Track count in header
- [x] Multi-file import support

**Tests** (410 total, +36 from M10):
- [x] Track ID generation
- [x] Title inference from filename
- [x] Search matching (title, artist, filename, case-insensitive, whitespace)
- [x] Status filtering
- [x] Sorting (title, BPM, addedAt, null handling)
- [x] Combined query (search + filter + sort)
- [x] Duplicate detection
- [x] Loaded deck ID detection
- [x] State serialization

**M10 Non-goals** (NOT implemented):
- ○ MIDI mapping
- ○ 3D controller integration
- ○ Persistent library (IndexedDB)
- ○ Backend / cloud storage
- ○ ID3 tag parsing
- ○ Virtual scrolling
- ○ Drag-and-drop loading
- ○ Keyboard navigation
- ○ Folder import
- ○ File System Access API

## M11 — MIDI / Physical DDJ-FLX4

- [ ] Web MIDI API integration
- [ ] DDJ-FLX4 MIDI mapping
- [ ] Physical knob/slider/button binding
- [ ] Jog wheel MIDI input

## M12 — 3D Controller Integration

- [ ] Three.js DDJ-FLX4 model
- [ ] 3D jog wheel interaction
- [ ] Visual pad feedback
- [ ] Animated controls

## M13 — Advanced Scratch / AudioWorklet DSP

- [ ] AudioWorklet/WASM granular scratch
- [ ] True reverse playback
- [ ] Inertia/backspin simulation

## M14 — AI DJ Coach

- [ ] Practice mode with feedback
- [ ] Transition scoring
- [ ] Beatmatch assistance
