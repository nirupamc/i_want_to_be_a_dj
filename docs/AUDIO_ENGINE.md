# AUDIO_ENGINE.md

## Audio graph (per deck)

```
AudioBufferSourceNode (source) ← normal playback OR scratch preview
        │
        ▼
  AnalyserNode (pre-fader peak metering)
        │
        ▼
  TrimGain → EQ Low → EQ Mid → EQ High → CFX LPF → CFX HPF →
  ChannelGain → CrossfadeGain → masterGain → destination
```

Normal playback and scratch preview share the same audio chain (analyser →
trim → EQ → filter → fader → crossfade → master → destination). The source
node is swapped depending on transport mode.

## Source node lifecycle

### Normal playback
One `AudioBufferSourceNode` per deck, managed by `DeckEngine._createSource()`.
Single-use: recreated on play, seek, tempo change, nudge.

### Scratch preview
A separate `AudioBufferSourceNode` managed by `DeckEngine._updateScratchPreview()`.
Created on each meaningful platter movement, stopped on release. Only one
active per deck. Previous source always stopped before replacement.

### Mutual exclusivity
- Normal source active → scratch source stopped
- Scratch source active → normal source stopped
- Never both active simultaneously

## Scratch transport (M5)

### Position mapping

```
secondsDelta = deltaRadians × SCRATCH_SECONDS_PER_RADIAN (0.15)
```

Full 360° rotation (2π) scrubs ~0.94 seconds. Positive = forward,
negative = backward. Position clamped to [0, duration].

### Scratch preview rate

Velocity-derived playback rate for preview audio:
```
rate = SCRATCH_RATE_MIN + t × (SCRATCH_RATE_MAX - SCRATCH_RATE_MIN)
where t = clamp((absVelocity - VEL_MIN) / (VEL_MAX - VEL_MIN))
```
Range: 0.3× (slow) to 2.0× (fast).

### Dead zones

- Jog dead zone: 0.0087 rad (0.5°) — filters pointer jitter
- Scratch audio threshold: 0.005 rad — prevents source churn from micro-movement

### Backward scratch

Web Audio `playbackRate` does not support negative values.
Backward scratch moves logical position correctly but previews with short
forward snippets. True reverse requires AudioWorklet/WASM.

### Lifecycle guarantees

1. Normal source stopped before scratch starts
2. Only one scratch preview source per deck
3. Previous preview stopped before replacement
4. Scratch end stops preview
5. Resume uses fresh normal source
6. No source reused after `stop()`
7. No overlapping runaway sources
8. Deck A lifecycle independent from Deck B

## Existing transport features

### Rate-aware position

```
position = offset + (audioContext.currentTime - startTime) × effectiveRate
```

### Tempo model

```
playbackRate = 1 + tempoPercent / 100
```

Rate clamp: 0.01..4.0.

### Nudge

Temporary ±2% rate offset. Cleared during scratch.

### Cue semantics

CUE_DOWN: paused → set cue, playing → back-cue (seek to cue, pause).
STOP preserves cue. New track resets cue.

## Track analysis (M6)

### Waveform extraction

From decoded PCM AudioBuffer:

1. Downmix stereo to mono (average channels)
2. Partition into time buckets (default: 100 points/second)
3. For each bucket: calculate peak amplitude + RMS energy
4. Normalise both to [0, 1] range

Output: `{ peaks: number[], rms: number[] }`

### BPM estimation

From PCM via energy-based onset detection:

1. Downmix to mono, downsample to 11,025 Hz
2. Windowed energy envelope (512-sample windows, 256-sample hop)
3. Onset-strength signal: positive energy differences only
4. Adaptive threshold peak detection
5. Inter-onset interval → tempo candidate → octave fold to 70–180 BPM
6. Confidence from interval histogram vote concentration

Output: `{ bpm: number | null, bpmConfidence: number | null }`

### Beatgrid generation

From estimated BPM + first-beat anchor:

```
beatInterval = 60 / bpm
beats = [firstBeat, firstBeat + interval, firstBeat + 2×interval, ...]
```

Anchor estimated by testing phase offsets against onset strength peaks.

### Beat helpers (reusable for M7+)

```ts
findNearestBeat(time) → { time, index }
findPreviousBeat(time) → { time, index }
findNextBeat(time) → { time, index }
timeToBeatIndex(time) → number
beatIndexToTime(index) → number
```

### Manual BPM override

When manual BPM is set:
- `manualBpm` overrides `analyzedBpm` as effective source
- Beatgrid rebuilt using `rebuildBeatGridFromManual()`
- Anchor preserved (normalised to first beat)
- `effectiveBpm = sourceBpm × playbackRate`

### Stale analysis protection

Each track receives a unique `trackId` (name + size + lastModified).
Analysis carries this ID through async pipeline. Results are only applied
if the ID matches the current deck's track.

### Analysis integration

```
LOAD_TRACK → deck becomes playable immediately
           → analysis starts async
           → waveform appears when ready
           → BPM/beatgrid appear when ready
           → manual BPM override available at any time
```

## Beat Sync (M7)

### BPM matching

```
requiredRate = masterEffectiveBpm / slaveSourceBpm
requiredTempoPercent = (requiredRate - 1) × 100
```

Applied to slave's playbackRate via existing `applyTempo()` method.
Respects slave's tempo range; rejects sync if required tempo exceeds range.

### Phase alignment

One-time seek correction on sync engage:
1. Find nearest slave beat to current position
2. Find nearest master beat to that slave beat
3. Calculate offset: `masterBeat - slaveBeat`
4. Seek slave to `position + offset`

Not continuous drift correction — BPM match only after initial alignment.

### Sync interaction with transport

- Manual tempo slider on slave → disables sync
- Scratch → ignores sync (scratch owns transport)
- Nudge → temporary deviation; on release, sync target re-applied
- Master tempo change → slave auto-updates
- Track load → clears sync state

## Beat Loops (M7)

### Loop creation

- `LOOP_IN`: quantize position to nearest beat, store as IN point
- `LOOP_OUT`: quantize position, validate OUT > IN, create active loop
- `LOOP_4_BEAT`: auto 4-beat loop from nearest beat to current position
- Loop lengths: 0.25, 0.5, 1, 2, 4, 8, 16, 32 beats (grid-based)

### Transport wrapping

When playback position >= loop end:
```
overflow = position - loopEnd
loopLength = loopEnd - loopStart
newPos = loopStart + (overflow % loopLength)
```

Preserves overflow to prevent timing loss. Triggers source recreation
(old source stopped, fresh source at wrapped position).

### Loop + scratch interaction

- Scratch start → loop remains active (transport suspended)
- Scratch end inside loop → position stays inside loop
- Scratch end outside loop → position may need wrapping

## Beat Jump (M7)

### Grid-index mapping

```
currentIdx = nearest beat index to current position
targetIdx = currentIdx + jumpBeats
targetTime = beatIndexToTime(targetIdx)
```

Supported: ±1, ±2, ±4, ±8 beats.

### Boundary behavior

- Before first beat → clamp to first beat
- After last beat → clamp to last beat
- No beatgrid → command rejected (no-op)

### Beat Jump + active loop

When loop is active, beat jump shifts the entire loop:
```
newLoopStart = oldLoopStart + jumpBeats × beatInterval
newLoopEnd = oldLoopEnd + jumpBeats × beatInterval
```
Clamped to track boundaries.

## Anti-pop / safety

- All gain/param changes ramp over 20 ms
- `cancelScheduledValues` before each ramp
- Source nodes disconnected on stop
- `onended` callback cleared before stop

## AudioContext lifecycle

- Created lazily on first user gesture
- `resume()` called after creation
- Destroyed on app unmount

## Sampler bus (M8)

### Audio routing

```
SamplerEngine Source → Sampler GainNode → Master GainNode → Destination
```

Sampler is NOT routed through deck channel faders. It has its own dedicated
bus. It does respond to the overall master gain.

### Source lifecycle

- Each trigger creates a fresh `AudioBufferSourceNode`
- Retrigger: stop previous source for that slot, create new one
- SHIFT + pad: stop source for that slot
- Unload: stop source + remove buffer from private storage
- `destroy()`: stop all sources, clear all buffers
- Source `onended` callback cleans up reference if source ends naturally

### Gain smoothing

Sampler gain changes ramp over 20 ms (same as deck gains) to avoid clicks.

### Independence

Sampler playback is completely independent from:
- Deck play/pause
- Deck seek
- Deck loops
- Beat Sync
- Scratch
- Nudge

Stopping Deck A does not stop the sampler.

## Beat FX (M9)

### Signal routing

Beat FX are insert effects. They tap from deck output, process, and
reconnect to the master bus:

```
Deck Output (crossfade gain) → FX Input → [dry + wet paths] → FX Output → Master Gain
```

For MASTER target: effect output connects directly to master gain.
For A/B target: deck output connects to effect input, effect output to master.

### Supported effects

| Effect | Nodes | Beat-synced |
|--------|-------|-------------|
| Echo | DelayNode + GainNode (feedback) | Yes |
| Delay | DelayNode + GainNode (feedback) | Yes |
| Reverb | ConvolverNode + procedural IR | No (static) |
| Flanger | DelayNode + OscillatorNode + GainNode | Yes |
| Filter | BiquadFilterNode (bandpass) | Yes |

### Beat timing

```
beatSeconds = (60 / bpm) × beatMultiplier
```

Supported multipliers: 1/16, 1/8, 1/4, 1/2, 1, 2, 4, 8.
BPM source: target deck's manual override > analyzed BPM.

### Wet/dry

Equal-power crossfade: `dry = cos(mix × π/2)`, `wet = sin(mix × π/2)`.
Level/Depth parameter (0..1) controls wet/dry balance.

### Effect tails

When FX is disabled, wet fades out over 0.5s, dry fades in.
Nodes are disconnected after tail fades.

### Feedback safety

Echo/Delay feedback clamped to < 0.85 to prevent runaway.

## Release FX (M9)

Echo Out: momentary echo with dry reduction. Triggered by action,
auto-decays after ~2 beats. Prevents overlapping triggers.

## Node reuse

An `AudioBufferSourceNode` can only be `start()`ed once. To re-trigger,
disconnect and recreate a new source at the desired offset.

An `AudioBufferSourceNode` can only be `start()`ed once. To re-trigger,
disconnect and recreate a new source at the desired offset.
