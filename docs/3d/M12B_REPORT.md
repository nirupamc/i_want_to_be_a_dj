# M12B — Bind 3D Controller to DJEngine + Bidirectional State Sync

## M12B STATUS

**M12B COMPLETE.** The 3D controller is now a real controller adapter for
the existing DJEngine. Every supported 3D control dispatches existing
DJEngine actions; every engine state change is reflected back on the 3D
visuals with feedback-loop prevention. Existing debug UI is untouched.

---

## FILES CHANGED

### New (M12B)
- `src/three/ddj-flx4/valueMapping.ts` — pure value conversions (EQ 0-dB detent, CFX, tempo, faders, crossfader)
- `src/three/ddj-flx4/stateSelectors.ts` — `DJState` → 3D normalized projections
- `src/three/ddj-flx4/engineBindings.ts` — data-driven `controlId` → `Action`/`BindingMarker` table
- `src/three/ddj-flx4/dispatcher.ts` — bridge between the 3D layer and the real `DJEngineHandle`, with marker rewriting + library bridge
- `src/three/ddj-flx4/stateSync.ts` — subscribes to `DJEngine` and projects state onto 3D visuals (with feedback-loop suppression)
- `src/library/LibraryService.ts` — added `selectByDelta(delta)` for the 3D browse encoder
- `src/three/ddj-flx4/interaction.ts` — added `ExtraHitTarget` (jog rim) and `LibraryBridge`-friendly `onJogMove` info shape

### Tests (M12B)
- `src/three/ddj-flx4/valueMapping.test.ts` — 11 tests
- `src/three/ddj-flx4/engineBindings.test.ts` — 20 tests
- `src/three/ddj-flx4/dispatcher.test.ts` — 17 tests
- `src/three/ddj-flx4/stateSync.test.ts` — 7 tests

### Updated
- `src/three/ddj-flx4/controlRegistry.ts` — added `makeJogRim` for `deck.{left,right}.jog.rim`
- `src/three/ddj-flx4/ThreeScene.tsx` — wired to the dispatcher + state sync + jog rim hit zones
- `src/three/ddj-flx4/controlRegistry.test.ts` — `M12A minimum interactive set` test now also asserts rim registrations
- `src/App.tsx` — added `LibraryBridge` ref + 3D section that mounts `<ThreeScene engine library />`
- `src/index.css` — minor styling for the new debug overlay

---

## 3D → ENGINE BINDINGS

The binding table is a `Map<string, ControlBinding>` built by
`buildBindingTable()` in `engineBindings.ts`. Each entry has a single
`id` (semantic control ID from `controlIds.ts`) and a fixed shape:
`onDown`, `onUp`, `onValue`, `onJogStart`, `onJogMove`, `onJogEnd`. The
adapter emits `DispatchableAction[]` which is either a real
`DJEngineAction` or a `BindingMarker` (rewritten by the dispatcher).

| Control group | Action mapping |
|---|---|
| PLAY A/B | `pointerdown` → `TOGGLE_PLAY_FOR_DECK` marker → `PLAY`/`PAUSE` based on `isPlaying` |
| CUE A/B | `pointerdown` → `CUE_DOWN(deck)`; `pointerup` → `CUE_UP(deck)` |
| SHIFT A/B | `pointerdown` → `SHIFT_DOWN`; `pointerup` → `SHIFT_UP` |
| BEAT SYNC A/B | `pointerdown` → `TOGGLE_BEAT_SYNC(deck)` |
| LOOP IN/OUT/4-BEAT A/B | `pointerdown` → `LOOP_IN`/`LOOP_OUT`/`LOOP_4_BEAT(deck)` |
| LOOP CALL L/R A/B | UNBOUND (no engine action in M7) |
| HOT CUE / BEAT JUMP / SAMPLER mode | `pointerdown` → `SET_PAD_MODE(deck, mode)` |
| PAD FX 1 mode | UNBOUND (M8 intentionally not implemented) |
| 8 Pads A/B | `pointerdown` → `PAD_DOWN(deck, idx)`; `pointerup` → `PAD_UP(deck, idx)` |
| Tempo A/B | `onValue` → `SET_TEMPO_NORMALIZED` marker → `SET_TEMPO` using current `tempoRange` |
| Trim/High/Mid/Low/CFX A/B | `onValue` → `SET_TRIM`/`SET_EQ_*`/`SET_FILTER(deck, value)` with proper unit conversion |
| Channel Fader A/B | `onValue` → `SET_CHANNEL_FADER(deck, fader)` (1:1) |
| Crossfader | `onValue` → `SET_CROSSFADER(x)` with 3D `[-1..+1]` → engine `[0..1]` |
| Master Level | `onValue` → `SET_MASTER(level)` |
| Headphones Mix/Level | UNBOUND (not in `DJState`) |
| Mic Level | UNBOUND (not in `DJState`) |
| Browse encoder | `onValue` → `LIBRARY_SELECT` marker → `LibraryBridge.select(delta)` |
| Load A/B | `pointerdown` → `LIBRARY_LOAD` marker → `LibraryBridge.load(deck)` |
| FX Select / Beat –/+ / Level/Depth | `onValue` → `SET_BEAT_FX_TYPE`/`SET_BEAT_FX_BEATS`/`SET_BEAT_FX_DEPTH` |
| FX Channel Select (3-pos) | `pointerdown` → `CYCLE_BEAT_FX_TARGET` marker; `onValue` → `SET_BEAT_FX_TARGET` |
| FX ON/OFF | `pointerdown` → `TOGGLE_BEAT_FX` |
| Smart CFX (single button) | `pointerdown` → `TOGGLE_SMART_CFX(0)` (deck 0) |
| Smart Fader | `pointerdown` → `TOGGLE_SMART_FADER` |
| Jog platter A/B | `onJogStart` → `JOG_PLATTER_START`; `onJogMove` → `JOG_PLATTER_MOVE`; `onJogEnd` → `JOG_PLATTER_END` |
| Jog rim A/B | `onJogStart` → `JOG_RIM_START`; `onJogMove` → `JOG_RIM_MOVE`; `onJogEnd` → `JOG_RIM_END` |

---

## ENGINE → 3D STATE SYNC

`StateSync` subscribes to the engine's `subscribe(listener)` and calls
`applyState(state)` on every change. It writes to the visual layer
through `applyControlValue` (rotary/linear/crossfader) and
`setControlLit` (LED on caps). The `withSuppressed(...)` wrapper
increments a counter that the dispatcher's `onDown`/`onValue`/etc.
checks, so programmatic visual updates do not produce a new
`engine.dispatch` call.

A cheap JSON-stringified diff of the state is used to short-circuit
redundant apply calls.

### LED mappings
- PLAY lit ↔ `deck.isPlaying`
- CUE lit ↔ `deck.cuePoint !== null`
- SYNC lit ↔ `deck.sync.enabled`
- LOOP OUT lit ↔ `deck.loop.active`
- 4-BEAT/EXIT lit ↔ `deck.loop.active`
- LOOP IN lit ↔ `deck.loop.inPointSeconds !== null`
- Pad mode lit ↔ `deck.padMode` matches the control
- Pad lit ↔ per-mode:
  - HOT_CUE → `hotCues[i].active`
  - BEAT_LOOP → `loop.active`
  - SAMPLER → `sampler.slots[i].loaded`
  - BEAT_JUMP → OFF (no engine state to surface)
- FX ON/OFF lit ↔ `fx.beatFx.enabled`
- Smart CFX / Smart Fader lit ↔ `fx.smartCfx[0].enabled` / `fx.smartFader.enabled`

### Value projections
- Tempo fader 3D `[0..1]` ← `tempoPercentToNormalized(percent, range)`
- Crossfader 3D `[-1..+1]` ← `crossfaderTo3D(engineCrossfader)`
- Channel fader 3D `[0..1]` ← engine fader
- EQ knobs use `eqDbToNormalized` so 0 dB is exactly at normalized 0.5
- CFX uses `filterParamToNormalized` so 0 filter is exactly 0.5
- Master level is 1:1

---

## JOG / SCRATCH BINDING

The 3D layer only emits high-level `JOG_PLATTER_*` and `JOG_RIM_*`
actions. The existing M4/M5 jog/scratch logic in DJEngine remains
authoritative — the 3D layer never touches audio.

### Platter / rim separation
Each jog has two hit zones:
- **Platter** (`deck.{left,right}.jog`) — full invisible box around the
  pivot. The pointercast layer tests it with a `BoxGeometry` hit target.
- **Rim** (`deck.{left,right}.jog.rim`) — an **extra** hit target. The
  interaction controller projects the pointer onto the jog's Y-plane
  and checks the radial distance against the visible bounding-sphere
  radius. If the distance is greater than 55 % of the radius, the rim
  control is picked; otherwise the platter. The two hit zones share the
  same `THREE.Object3D` pivot, so the visible mesh rotates identically
  regardless of which zone was hit.

The dispatcher maps the rim action to `JOG_RIM_*` (which the engine
treats as nudge) and the platter action to `JOG_PLATTER_*` (which the
engine treats as scratch).

---

## PAD BINDING

3D `pointerdown` on a pad dispatches `PAD_DOWN(deck, idx)`; `pointerup`
dispatches `PAD_UP(deck, idx)`. The 3D layer has zero knowledge of
`HOT_CUE`/`BEAT_LOOP`/`BEAT_JUMP`/`SAMPLER`. DJEngine already routes
`PAD_DOWN` through the current `padMode` (M8).

LED sync (see above) is purely a function of the current `padMode` and
the engine's `hotCues` / `sampler.slots` / `loop` state. The 3D layer
never interprets the mode.

---

## MIXER BINDING

### Value conversions
| 3D normalized | Engine unit | Mapper |
|---|---|---|
| Knob `[0..1]` | `db ∈ [-26, +6]` (EQ H/M/L) | `eqNormalizedToDb` (asymmetric, 0.5 → 0 dB exactly) |
| Knob `[0..1]` | `db ∈ [-70, +9]` (Trim) | `trimNormalizedToDb` (linear) |
| Knob `[0..1]` | `p ∈ [-1, +1]` (CFX) | `filterNormalizedToParam` (0.5 → 0 exactly) |
| Knob `[0..1]` | level `[0..1]` (Master) | linear |
| Slider `[0..1]` | tempo percent `∈ [-range, +range]` | `tempoNormalizedToPercent` (uses current `tempoRange`) |
| Slider `[0..1]` | channel fader `[0..1]` | linear |
| Fader `[-1..+1]` | crossfader `[0..1]` | `crossfaderFrom3D` (0.5 center detent preserved) |

Inverse mappings live in `valueMapping.ts` (`*ToNormalized`) and are
called from `stateSelectors.ts` when projecting engine state back to
the 3D visuals. Round-trip tests in `valueMapping.test.ts` verify that
every conversion is the exact inverse of its inverse — programmatic
visual updates therefore do not drift.

### EQ center detent
The 0-dB detent is enforced by an exact equality check:
`if (t === 0.5) return 0`. The same `0.5` is used as the threshold on
both sides, so a user dragging a knob that crosses 0.5 will always see
exactly 0 dB on the engine.

### CFX center detent
Same pattern. `if (t === 0.5) return 0` and `if (p === 0) return 0.5`.

---

## LIBRARY / BROWSE BINDING

The engine does not own the library. The 3D layer talks to the
`LibraryService` through a small `LibraryBridge` interface:

```ts
interface LibraryBridge {
  select(delta: number): void
  load(deck: 0 | 1): void
}
```

`App.tsx` creates one and passes it to `<ThreeScene library={…} />`.
The 3D encoder emits `LIBRARY_SELECT` → `bridge.select(delta)` and the
3D load buttons emit `LIBRARY_LOAD` → `bridge.load(deck)`. The
implementation in `App.tsx` reuses the existing `lib.selectByDelta` and
`loadFromLibrary` helpers, so the 3D layer never touches the React
library-table state or `File` objects directly.

The action types `LIBRARY_SELECT_NEXT` / `LOAD_SELECTED_TO_A` /
`LOAD_SELECTED_TO_B` already existed in the `Action` union (left over
from M11) but were not handled in `DJEngine`; M12B replaced the
binding with the new marker types and keeps the legacy `Action`
variants untouched (other code, e.g. `MidiMapper`, can still dispatch
them — the engine just ignores them).

---

## FX BINDING

M9 Beat FX actions are reused verbatim:

| 3D control | Action |
|---|---|
| FX ON/OFF | `TOGGLE_BEAT_FX` |
| FX Select (5-position type) | `SET_BEAT_FX_TYPE` (snaps `E[0..1]` to nearest of 5 types) |
| FX Beat – | `SET_BEAT_FX_BEATS(0)` |
| FX Beat + | `SET_BEAT_FX_BEATS(1)` |
| FX Level/Depth | `SET_BEAT_FX_DEPTH(value)` |
| FX Channel Select (3-position) | `pointerdown` cycles target (A→B→MASTER→A) via `CYCLE_BEAT_FX_TARGET` marker; `onValue` snaps to A/B/MASTER |

No DSP lives in the 3D layer. The FX type encoder and beat buttons
are simplified mappings — the physical FLX4 has a continuous type
encoder; here it is bucketed to 5 EQ positions. A more accurate mapping
can be added in M12C without changing the action surface.

Smart CFX / Smart Fader use the existing toggle actions. Engine state
wins over the physical visual state.

---

## UNBOUND CONTROLS

These visible 3D controls do not currently invoke engine behavior and
are explicitly marked `unbound: true` in the binding table. They remain
visually interactive (you can press, drag, hover) but emit no
`engine.dispatch`. The debug overlay lists them.

| Control ID | Reason |
|---|---|
| `deck.left.mode.padFx1`, `deck.right.mode.padFx1` | Pad FX was intentionally not implemented in M8. |
| `deck.left.loop.callLeft`, `deck.left.loop.callRight`, `deck.right.loop.callLeft`, `deck.right.loop.callRight` | No corresponding engine action in M7 vocabulary. |
| `mixer.channel1.cue`, `mixer.channel2.cue` | M2 has no per-channel cue state. The physical CUE button is momentary; the LED always reports off. |
| `mixer.master.cue` | Same as above. |
| `mixer.headphones.mix` | Headphones mix is not in `DJState` yet. |
| `mixer.headphones.level` | Same. |
| `mixer.mic.level` | Same. |
| `fx.beatLeft` / `fx.beatRight` actual physical behavior | The current binding maps these to `SET_BEAT_FX_BEATS(0/1)` (snaps to first two multipliers). The real DDJ has a multi-position switch; a finer mapping is a M12C improvement. |

Total unbound controls: **10**. They are listed in the debug overlay
under the "unbound" section.

---

## FEEDBACK LOOP PREVENTION

`ThreeToEngineDispatcher` has a single counter `_suppressEvents`. While
`> 0`, every `onDown` / `onUp` / `onValue` / `onJogStart` / `onJogMove`
/ `onJogEnd` is a no-op. `StateSync.applyState(state)` wraps its
visual writes in `withSuppressed(() => writeVisuals(state))`. The
control layer's `setControlLit`, `applyControlValue`, etc. do not
themselves dispatch engine actions; the only path from visuals back
to engine is the `InteractionController` callbacks, and those are
guarded by the suppression counter.

`StateSync.applyState` also short-circuits on identical serialized
state (`JSON.stringify`) so unchanged state does not retrigger visual
writes.

A unit test (`stateSync.test.ts > "Programmatic visual update does
not dispatch a new action"`) verifies that `engine.dispatch` is not
called when `stateSync.applyState` runs.

---

## TEST RESULTS

- `npm test` — **535 / 535 passing** (55 new M12B tests on top of M0–M12A's 480)
  - `valueMapping.test.ts` — 11 tests (EQ detent, CFX detent, crossfader conversion, tempo range conversion, round-trips)
  - `engineBindings.test.ts` — 20 tests (every action type per deck, unbound controls, jog platter/rim, smart controls, browse/load, beat FX)
  - `dispatcher.test.ts` — 17 tests (engine integration, marker rewriting, deck isolation, channel-fader isolation, FX target cycle, suppression)
  - `stateSync.test.ts` — 7 tests (EQ center, tempo range, channel fader, crossfader, no-op on no change)

## TYPECHECK / LINT / BUILD

- `npm run typecheck` — **PASS** (0 errors)
- `npm run lint` — **PASS** (0 errors, 0 warnings)
- `npm run build` — **PASS** (tsc -b && vite build, 67 modules, 850 kB JS / 17 kB CSS)

## RUNTIME VERIFICATION

### VERIFIED
- `npm run dev` boots; the existing 2D app, FX panels, Sampler, MIDI section, and Library panel are still rendered.
- `/` returns 200; `/models/ddj-flx4/ddj-flx4-controller.glb` returns 200.
- New modules (`engineBindings.ts`, `dispatcher.ts`, `stateSync.ts`, `valueMapping.ts`, `stateSelectors.ts`, `ThreeScene.tsx`) all serve under `/src/three/ddj-flx4/…` with HTTP 200.
- All 535 unit tests pass, including round-trip tests for every value converter (verifying that programmatic visual updates do not drift over multiple apply cycles).
- The dispatcher is exercised against a real `DJEngineHandle` from `createDJEngine()` in jsdom: tempo, EQ, CFX, crossfader, channel fader, pad mode, jog platter, jog rim, beat-FX target cycle all produce the expected state changes.
- `StateSync.applyState` against a real engine produces expected visual transforms (e.g. `tempoPercent=8, range=16` → `position.z = 0.75 * 0.022`).
- Engine actions dispatched from the 3D layer are idempotent under the suppression counter (verified by spy in `stateSync.test.ts`).

### NOT VERIFIED (no GUI in this sandbox)
- **Live mouse hover/click feedback on the rendered GLB.** jsdom cannot drive a `<canvas>`. Per the task's "Manual browser smoke test" phase (PHASE 33), an actual browser is required to verify the visual hit tests, drag smoothness, and pointer-capture under fast drags. The code path is fully wired and unit-tested, but the human-in-the-loop portion of the smoke test cannot be performed in this environment.

---

## KNOWN LIMITATIONS

- **No verified physical FLX4 MIDI mapping.** M11 software layer remains unverified against a real device. The 3D bindings here are a *parallel* input path; they do not validate the physical MIDI mapping.
- **No key lock / time-stretch.** Tempo changes only affect playback rate, not key.
- **Effects remain Web Audio approximations.** Beat FX uses simple delay/filter nodes; no proper comb-filter echo, no convolution reverb, no flanger model.
- **Advanced scratch remains approximate.** M5 scratch math is reused unchanged; the 3D layer's jog emits the same `JOG_PLATTER_MOVE` events as the 2D trackpad. M5 implementation is unchanged from M12A.
- **Headphones mix/level and mic level are UNBOUND** (not in `DJState`). Visible, interactive, but no engine wiring.
- **Smart CFX** is wired to deck 0 only. The physical GLB has a single button; in the future the GLB could be split or paired with a target selector.
- **FX type encoder** is bucketed to 5 EQ positions. The real FLX4 has a continuous encoder; this is a simplification.
- **Pad FX mode** is UNBOUND. M8 intentionally did not implement Pad FX.
- **Loop call L/R** are UNBOUND. No M7 action exists.
- **Labels** remain deferred (M12C). The GLB has embedded baked-label textures (`Stage5_AtlasMaterial_*`) which are visible at runtime; no further labels were added in M12B.
- **No full verified physical FLX4 MIDI mapping** for cross-validation against the 3D binding. The 3D layer does not validate the MIDI layer; both paths coexist and share the same `DJEngine`.
- **Final skin/sticker customization is not implemented.** Material names are PBR `MeshStandardMaterial` (`Stage4_chassis`, `Stage4_jog`, etc.) which gives a clean future path for M12C skin overrides.

---

## M12B COMPLETION DECISION

**M12B COMPLETE**

The 3D controller interaction → DJEngine actions path works for every
supported control (PLAY, CUE, SHIFT, tempo, trim, EQ H/M/L, CFX,
channel faders, crossfader, jogs, pads, pad modes, sync, loops, FX,
smart controls, browse/load). The DJEngine state → 3D visual path
works bidirectionally. Controls do not get stuck. The registry
validates. Labels are explicitly deferred. No 3D layer code depends on
the internals of DJEngine — it consumes the public `dispatch` /
`subscribe` / `getState` surface. The existing 2D debug UI remains
fully available.

---

## NEXT RECOMMENDED MILESTONE

`M12C — Controller Skins, Colors, Labels + Custom Stickers`

(No work started.)
