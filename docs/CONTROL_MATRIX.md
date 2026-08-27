# CONTROL_MATRIX.md

Source of truth: `ref/DDJ_FLX4_DRI1804A_manual.pdf` (Pioneer DJ, 165 pages).
This file records the physical controls of the DDJ-FLX4 and the subset each
milestone must support.

## Deck section

| # | Control | Primary | SHIFT+action |
|---|---------|---------|--------------|
| 1 | `[IN]` button | Set loop in point | (rekordbox) |
| 2 | `[OUT]` button | Set loop out point, start loop | adjust loop out |
| 3 | `[4 BEAT/EXIT]` button | Start 4-beat Auto Beat Loop | Cancel loop |
| 4 | `[CUE/LOOP CALL <]` button | Call cue/loop; halve loop length | Delete cue/loop |
| 5 | `[CUE/LOOP CALL >]` button | Call cue/loop; double loop length | Save cue/loop |
| 6 | `[BEAT SYNC]` button | Sync tempo/beatgrid to master | **Switch TEMPO slider range** |
| 7 | `[TEMPO]` slider | **Adjust playing speed** | (with SHIFT) range switch |
| 8 | `[HOT CUE]` mode button | Enter Hot Cue mode | Keyboard mode |
| 9 | `[PAD FX1]` mode button | Enter Pad FX mode 1 | Pad FX mode 2 |
| 10 | `[BEAT JUMP]` mode button | Enter Beat Jump mode | Beat Loop mode |
| 11 | `[SAMPLER]` mode button | Enter Sampler mode | Key Shift mode |
| 12 | `Performance Pads` (4x2) | Trigger cues / loops / FX / sampler | Clear / adjust |
| 13 | `[PLAY/PAUSE]` button | **Play / pause track** | return to start |
| 14 | `[CUE]` button | **Set / call cue point** | Return to track start |
| 15 | `[SHIFT]` button | Modifier for all other buttons | - |
| 16 | `Jog wheel` (top + outer) | **Scratch (platter) / Pitch Bend (rim)** | Fast-forward/reverse / Skip mode |

## Mixer section

| # | Control | Primary | SHIFT+action |
|---|---------|---------|--------------|
| 1 | `[TRIM]` knobs (x2) | Adjust each channel's volume | - |
| 2 | `[MASTER LEVEL]` knob | Adjust master output volume | - |
| 3 | `[Headphones CUE]` button (master) | Monitor master in headphones | - |
| 4 | `Bluetooth MIDI indicator` | Connection status | - |
| 5 | `Channel level indicators` | Pre-fader volume meter | - |
| 6 | `[EQ]` knobs HI/MID/LOW (x2) | Boost/cut per band per channel | - |
| 7 | `[MIC LEVEL]` knob | Microphone input volume | - |
| 8 | `[CFX]` knobs (x2) | Sound Color FX / Smart CFX | - |
| 9 | `[SMART CFX]` button | Smart CFX on/off | Change preset |
| 10 | `Headphones CUE` buttons (channel, x2) | Monitor channel in headphones | Tapping function |
| 11 | `[HEADPHONES MIX]` knob | Monitor balance | - |
| 12 | `[HEADPHONES LEVEL]` knob | Headphone volume | - |
| 13 | `[SMART FADER]` button | Smart Fader on/off | Change preset |
| 14 | `Channel faders` (x2) | Channel volume | Fader Start |
| 15 | `Crossfader` | L/R balance | Fader Start |

## Effects section

| # | Control | Primary | SHIFT+action |
|---|---------|---------|--------------|
| 1 | `[BEAT FX CH SELECT]` switch | Change Beat FX target channel | - |
| 2 | `[BEAT FX SELECT]` button | Cycle Beat FX | Reverse cycle |
| 3 | `[BEAT <]` button | Decrease beat count | BPM Auto mode |
| 4 | `[BEAT >]` button | Increase beat count | BPM Tap mode |
| 5 | `[BEAT FX LEVEL/DEPTH]` knob | Adjust FX parameter | - |
| 6 | `[BEAT FX ON/OFF]` button | FX on/off | Release FX on/off |

## Scope gating

### M0 — Architecture + Controller Specification
**Scope**: Documentation only. No controls wired.

### M1 — Dual-Deck Audio Proof
**Scope**: `[PLAY/PAUSE]`, `[CUE]`, `[TEMPO]` slider, track load, seek.

### M2 — Proper Mixer DSP
**Scope**: All mixer controls (TRIM, EQ, CFX, faders, crossfader, master, meters).

### M3 — Transport + Cue + Tempo + Nudge
**Scope**: Enhanced transport, CUE_DOWN/UP, tempo ranges, nudge.

### M4 — Jog Wheel Interaction + Scratch Groundwork
**Scope**: Jog wheel input model (platter + rim zones), angular delta, velocity,
scratch intent state, rim→nudge mapping.

### M5 — Scratch Engine / Audio Scrubbing
**Scope**: All M4 controls + actual scratch audio scrubbing.
- `Jog wheel` platter — **SCRATCH INPUT + AUDIO SCRUB TESTED**
- `Jog wheel` rim — **NUDGE TESTED**
- STOP/PLAY/PAUSE/SEEK during scratch — deterministic behavior tested
- Scratch ignores nudge and tempo changes
- Deck A scratch does not affect Deck B

### M6 — Waveform + BPM + Beatgrid
**Scope**: Track analysis, waveform rendering, BPM estimation, beatgrid.
- **Waveform** — **EXTRACTION + RENDERING TESTED**:
  - Peak + RMS extraction from decoded PCM
  - Overview waveform (full track, position visible)
  - Detailed/scrolling waveform (fixed playhead, Canvas rendering)
  - Beat markers overlaid on waveform
  - Click-to-seek on overview waveform
  - 100 points/second analysis density
  - Stereo handling (mono downmix for analysis)
- **BPM Estimation** — **TESTED**:
  - Energy-envelope onset detection
  - Octave folding to 70–180 BPM range
  - Confidence scoring
  - Manual BPM override (analyzed vs manual source)
  - Beatgrid rebuild from manual BPM
  - Graceful null on silence/unreliable signal
- **Beatgrid** — **TESTED**:
  - Regular beat interval generation from BPM + anchor
  - Beat helpers: findNearestBeat, findPreviousBeat, findNextBeat
  - timeToBeatIndex / beatIndexToTime
  - First-beat anchor estimation from onset alignment
  - Grid on waveform (every-4th-grid marker)
- **Analysis Pipeline** — **TESTED**:
  - Async TrackAnalyzer with stale-result protection
  - Track ID prevents old analysis from overwriting new track
  - Analysis does not block playback
  - Deck A/B isolation
  - Analysis status: idle → analyzing → ready/failed

**Not wired**: `[HOT CUE]`, `[PAD FX]`, `[BEAT JUMP]`, `[SAMPLER]`,
Beat Sync, loops, MIDI.

### M7 — Beat Sync + Beat Loops + Beat Jump
**Scope**: Beat-aware deck behavior using M6 timing foundation.
- `[BEAT SYNC]` — **SYNC TESTED**:
  - Master/slave assignment via `SET_SYNC_MASTER`
  - `TOGGLE_BEAT_SYNC` enables/disables sync
  - Tempo match: `requiredRate = masterBpm / slaveBpm`
  - One-time phase alignment on sync engage
  - Sync rejects when BPM unavailable or out of range
  - Manual tempo takeover (slider disables sync)
  - Master tempo change updates slave
  - Nudge re-applies sync target on release
  - Scratch ignores sync
  - Deck A/B isolation
- `[IN]`/`[OUT]` — **LOOP IN/OUT TESTED**:
  - LOOP_IN captures position, quantizes to beat
  - LOOP_OUT creates loop (validates OUT > IN)
  - Beatgrid quantization when available
- `[4 BEAT/EXIT]` — **AUTO LOOP TESTED**:
  - 4-beat auto loop from nearest beat
  - Exit if loop already active
  - Transport wrapping at loop end
- `[CUE/LOOP CALL <]` — **HALVE LOOP TESTED**:
  - Halves loop length (min 0.25 beats)
- `[CUE/LOOP CALL >]` — **DOUBLE LOOP TESTED**:
  - Doubles loop length (max 32 beats)
- `LOOP EXIT` — **LOOP EXIT TESTED**:
  - Deactivates loop, playback continues
- Beat Jump buttons — **BEAT JUMP TESTED**:
  - ±1, ±2, ±4, ±8 beats via grid indices
  - Boundary clamping (first/last beat)
  - Preserves play/pause state
  - Active loop shifts with beat jump
  - Safe failure without beatgrid
- Waveform loop overlay — **LOOP OVERLAY TESTED**:
  - Loop boundaries shown on overview + detail waveform
  - Loop region shaded

### M8 — Hot Cues + Performance Pads + Sampler
**Scope**: Pad mode architecture, hot cues, beat loop/jump pads, sampler.
- `[HOT CUE]` mode — **HOT CUE TESTED**:
  - 8 hot cue slots per deck
  - Empty pad saves current position
  - Populated pad triggers (seek to cue)
  - SHIFT + populated pad deletes
  - New track resets all hot cues
  - Independent from primary CUE
  - Waveform markers (color-coded numbered)
  - Deck A/B isolation
- `[4 BEAT/EXIT]` via pad mode — **BEAT LOOP PAD TESTED**:
  - 8 pads map to 1/4, 1/2, 1, 2, 4, 8, 16, 32 beats
  - Same-length press exits loop
  - Different-length replaces loop
  - Reuses M7 loop infrastructure
- `[BEAT JUMP]` mode — **BEAT JUMP PAD TESTED**:
  - 8 pads map to -1, +1, -2, +2, -4, +4, -8, +8
  - Reuses M7 beat jump infrastructure
  - Preserves play/pause, boundary clamping, loop shift
- `[SAMPLER]` mode — **SAMPLER TESTED**:
  - 8 global sampler slots
  - Load via file picker → decode → store privately
  - Pad trigger/retrigger: stop previous, fresh source
  - SHIFT + pad → stop slot
  - Unload clears buffer + state
  - Sampler gain control (0..1)
  - Dedicated sampler bus → master → destination
  - Independent from deck transport
  - Source lifecycle safety (no leaks)
- Generic pad routing — **PAD ROUTING TESTED**:
  - PAD_DOWN/PAD_UP routed through engine by padMode
  - 3D/MIDI compatible interface
- SHIFT modifier — **SHIFT TESTED**:
  - SHIFT_DOWN/SHIFT_UP global state
  - SHIFT + hot cue → delete
  - SHIFT + sampler → stop
- Performance Pads section: 8 pads per deck
  - 4 mode selectors: HOT CUE, BEAT LOOP, BEAT JUMP, SAMPLER
  - Pad labels change per mode

### M9 — Beat FX + Release FX + Smart Controls
**Scope**: Effects engine, release FX, smart controls.

- Effects section — **BEAT FX TESTED**:
  - `[BEAT FX SELECT]` — 5 types: Echo, Delay, Reverb, Flanger, Filter
  - `[BEAT FX CH SELECT]` — Target: A, B, MASTER
  - `[BEAT <]`/`[BEAT >]` — Beat multiplier: 1/16..8
  - `[FX LEVEL/DEPTH]` — Wet/dry mix (0..1)
  - `[BEAT FX ON/OFF]` — Enable/disable with tail fade
  - Beat-synced timing from target deck BPM
  - Safe failure without valid BPM
- Release FX — **RELEASE FX TESTED**:
  - Echo Out trigger: momentary echo + dry reduction
  - Auto-decay after ~2 beats
  - Prevents overlapping triggers
- Smart CFX — **SMART CFX TESTED**:
  - Per-channel macro knob (-1..+1)
  - Center = neutral, left = LP, right = HP
  - Manual filter change disables Smart CFX
  - Restore manual values on disable
- Smart Fader — **SMART FADER TESTED**:
  - Crossfader-driven EQ automation
  - Outgoing LOW fades, incoming LOW restores
  - Echo increase near transition end
  - Toggle ON/OFF

### M10 — Track Library + Navigation + Application UX
**Scope**: Application shell, local track library, search/sort/filter.
- Library Panel — **LIBRARY TESTED**:
  - Import multiple local audio files
  - Track list with title, artist, BPM, duration, analysis status
  - Case-insensitive search (title, artist, filename)
  - Sort by title, BPM, duration, added, last played
  - Filter by status (all, analyzed, analyzing, failed)
  - Duplicate prevention (same file → reuse existing)
  - Track removal from library
  - Loaded-track indicators (A/B badges)
  - Recently played tracking
- Deck Loading — **LOAD TESTED**:
  - LOAD A / LOAD B buttons per library row
  - Uses existing DJEngine LOAD_TRACK pipeline
  - Reuses cached analysis
  - Analysis status display
- Application Layout — **LAYOUT TESTED**:
  - Decks + mixer top, effects+sampler collapsible, library bottom
  - Empty state: "Import audio files to begin"
  - Collapsible sections for Effects and Sampler
  - Track count in header
- Library Service — **SERVICE TESTED**:
  - Private File cache (File objects never serialized)
  - Shared analysis cache
  - State serialization
  - 36 library tests

### M11 — MIDI / Physical DDJ-FLX4
- Web MIDI API integration — **LAYER TESTED**:
  - MidiParser: Note On/Off, CC, Pitch Bend — **TESTED**
  - MidiMapper: data-driven routing to DJEngine actions — **TESTED**
  - Normalization: midi7, midi14, bipolar, centered range — **TESTED**
  - Relative encoders: two's complement, binary offset — **TESTED**
  - Soft takeover — **TESTED**
  - Button debounce — **TESTED**
  - Mapping validation (duplicates, ranges) — **TESTED**
  - Mapper reset / disconnect cleanup — **TESTED**
  - 63 MIDI tests
- DDJ-FLX4 Mapping Config — **UNVERIFIED** (all mappings need real device capture)
- MidiManager — **LAYER TESTED** (Web MIDI API requires live browser):
  - Feature detection
  - Permission request
  - Device discovery / hot-plug
  - Disconnect cleanup
  - Learn mode
  - Bounded monitor
- MIDI Debug UI — **PRESENT**:
  - Enable/Disable MIDI
  - Permission status
  - Input device display
  - Last message display
  - Learn target display

**Physical FLX4 verification**: NOT VERIFIED (no physical device available)

### M12+ (future)
See MILESTONES.md for scope details.
