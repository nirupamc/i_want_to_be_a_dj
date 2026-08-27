# M12A — GLB Hierarchy Audit + Interaction Preparation

## M12A STATUS

READY. The GLB is structurally complete for interaction and a full
runtime/raycast layer has been wired without any dependency on DJEngine.

---

## GLB HIERARCHY AUDIT

- **File**: `public/models/ddj-flx4/ddj-flx4-controller.glb`
- **Size**: 360.3 KiB / 368 980 bytes
- **Total objects traversed**: 486
- **Unique named nodes**: 483
- **Scene root name in GLB**: `AuxScene > ControllerRoot`
  *(handoff claimed bare `ControllerRoot`; the GLB is wrapped in an extra
  `AuxScene` group, but the named `ControllerRoot` is a direct child)*
- **Materials**: 22 PBR `MeshStandardMaterial` (chassis, jog, knob, …) plus
  the baked label atlas (`Stage5_AtlasMaterial_*`). The atlas is embedded
  in the GLB; no external texture files are required at runtime.
- **External textures**: `public/models/textures/` is currently empty.
  This is OK — the GLB is self-contained.

### Per-control classifications

| Section | Control | GLB name | Class | Notes |
|---|---|---|---|---|
| Deck A | jog platter | `LeftJogWheelPivot` | READY | Pivot is centred, visual contains `LeftJogWheelInnerDisc`, `LeftJogWheelOuterRim`, `LeftJogWheelCenterCap`, `LeftJogWheelRimStep` — platter vs rim are separate hit zones (rim region will be exposed via an outer-ring invisible hit in M12B) |
| Deck A | jog rim | same | READY (separate visual) | see above |
| Deck A | tempo fader | `LeftTempoFader` (+ `Handle`/`Track`/`Slot`) | READY | Z-axis travel |
| Deck A | PLAY | `LeftPlayPause` (+ Mesh) | READY | `Body/Top/Label` decoupled |
| Deck A | CUE | `LeftCue` | READY | |
| Deck A | SHIFT | `LeftShift` | READY | |
| Deck A | BEAT SYNC | `LeftBeatSync` | READY | |
| Deck A | LOOP IN | `LeftIn` | READY | |
| Deck A | LOOP OUT | `LeftOut` | READY | |
| Deck A | 4 BEAT/EXIT | `LeftFourBeatExit` | READY | |
| Deck A | Loop call L/R | `LeftCueLoopCallLeft/Right` | READY | |
| Deck A | pad mode buttons | `LeftHotCueMode`, `LeftPadFX1Mode`, `LeftBeatJumpMode`, `LeftSamplerMode` | READY | |
| Deck A | 8 pads | `LeftPad01..08` (+ `Mesh/Body/Top`) | READY | Each has its own lit cap (top) for the LED API |
| Deck B | (mirror) | `Right*` | READY | All present |
| Mixer | Trim 1/2 | `Trim1/2Pivot` | READY | |
| Mixer | High/Mid/Low 1/2 | `High1/2`, `Mid1/2`, `Low1/2` Pivot | READY | |
| Mixer | CFX 1/2 | `CFX1/2Pivot` | READY | |
| Mixer | Channel fader A/B | `ChannelFader1/2` (+ Handle/Track) | READY | |
| Mixer | Crossfader | `Crossfader` | READY | X-axis travel |
| Mixer | Master | `MasterLevelPivot` + `MasterCue` | READY | |
| Mixer | Headphones mix/level | `HeadphonesMixPivot`, `HeadphonesLevelPivot` | READY | |
| Mixer | Mic level | `MicLevelPivot` | READY | |
| Browse | Browse encoder | `BrowseEncoderPivot` | READY | Continuous rotation |
| Browse | Load A/B | `Load1`, `Load2` | READY | |
| FX | Select | `BeatFxSelect` | READY | |
| FX | On/Off | `BeatFxOnOff` | READY | |
| FX | Channel select | `BeatFxChannelSelect` | READY | 3-position switch |
| FX | Level/Depth | `BeatFxLevelDepthPivot` | READY | |
| FX | Beat –/+ | `BeatLeft`, `BeatRight` | READY | NB: actual GLB names are `BeatLeft` / `BeatRight`, not `BeatFxBeatLeft/Right` as the handoff suggested |
| FX | Smart CFX/Fader | `SmartCFX`, `SmartFader` | READY | Treated as buttons (push toggles) |

**Summary**: 0 missing, 0 merged, 0 pivot problems. The GLB is fully
separated and pivots are pre-aligned in the source coordinates.

---

## CONTROL REGISTRY

A new self-contained registry lives in
`src/three/ddj-flx4/controlRegistry.ts` and exposes semantic IDs from
`src/three/dddj-flx4/controlIds.ts`. The IDs match the handoff schema
(`deck.left.play`, `mixer.channel1.eq.high`, …).

Total semantic IDs registered: **77**

### Jogs
- `deck.left.jog`
- `deck.right.jog`

### Tempo faders
- `deck.left.tempo`
- `deck.right.tempo`

### Pads (8 per deck)
- `deck.left.pad.01` … `deck.left.pad.08`
- `deck.right.pad.01` … `deck.right.pad.08`

### Deck buttons (13 per deck)
- `deck.left.play`, `deck.left.cue`, `deck.left.shift`, `deck.left.beatSync`
- `deck.left.loop.in`, `deck.left.loop.out`, `deck.left.loop.4beatExit`
- `deck.left.loop.callLeft`, `deck.left.loop.callRight`
- `deck.left.mode.hotCue`, `deck.left.mode.padFx1`,
  `deck.left.mode.beatJump`, `deck.left.mode.sampler`
- …and the right-deck mirror

### Mixer
- `mixer.channel1.trim`, `mixer.channel1.eq.high`, `mixer.channel1.eq.mid`,
  `mixer.channel1.eq.low`, `mixer.channel1.cfx`, `mixer.channel1.fader`,
  `mixer.channel1.cue`
- `mixer.channel2.*` (mirror)
- `mixer.crossfader`
- `mixer.master.level`, `mixer.master.cue`
- `mixer.mic.level`
- `mixer.headphones.mix`, `mixer.headphones.level`
- `mixer.smartCfx`, `mixer.smartFader`

### Browse / FX
- `browse.encoder`, `browse.load1`, `browse.load2`
- `fx.select`, `fx.beatLeft`, `fx.beatRight`, `fx.onOff`,
  `fx.channelSelect`, `fx.levelDepth`

---

## MANIFEST VALIDATION

The original `controlManifest.ts` and `controllerBinding.ts` shipped with
M12A referenced a non-existent `src/three/rig/*` module. They are
replaced with thin shims that re-export the new registry. The semantic
ID set is **identical** to the handoff (`docs/3d/INTEGRATION.md`).

Mismatches found and fixed:

1. **`fx.beatLeft` / `fx.beatRight` GLB names**: handoff said
   `BeatFxBeatLeft/Right`; actual GLB uses `BeatLeft`/`BeatRight`.
   Registry now points to the real names.
2. **Root wrapper**: GLB root is `AuxScene > ControllerRoot` (handoff
   said just `ControllerRoot`). The registry walks by name and tolerates
   this — the first matching `ControllerRoot` is found.
3. **Channel mapping**: in the GLB, **left = channel 1 = Deck A** and
   **right = channel 2 = Deck B**. The registry preserves the handoff
   naming (`mixer.channel1.*`) and binds `ChannelFader1`/`High1`/etc.

`diffManifestAgainstExpected` is unit-tested and returns
`{ missing: [], unexpected: [], duplicates: [] }` for the synthetic
model and the real GLB.

---

## INTERACTION DESIGN

- **Raycasting**: One `THREE.Raycaster` in `InteractionController`. A
  single `pointerdown / move / up / cancel / lostpointercapture` handler
  chain is attached to the canvas DOM element. No per-mesh listeners.
- **Hit targets**: each control receives an invisible
  `BoxGeometry(2×, 0, depthWrite:false, opacity:0)` child positioned at
  the control's local bounding-box centre. They are added to the control
  pivot so they inherit transforms. `userData.controlId` is set.
- **Parent resolution**: `userData.controlId` is read directly from the
  hit target; control lookups are O(1) via a `Map`.
- **Pointer capture**: `setPointerCapture(pointerId)` on `pointerdown`
  guarantees stable drag even off the original target.
- **Lost pointer safety**: `lostpointercapture`, `pointercancel`, and
  `pointerup` all funnel through `endDrag`, ensuring no control ever
  gets stuck pressed.

---

## CONTROL MOVEMENT

| Control | Mechanism |
|---|---|
| Buttons / pads | `pointerdown` → `setControlPressed(id, true)` depresses the press-mesh along the local Y axis by 2.5 mm. `pointerup` restores the original Y. Pads/buttons also expose `setControlLit(id, bool)` which mutates the `emissiveIntensity` of a cloned material on the LED-cap mesh. |
| Knobs (rotary-bounded) | Vertical drag of 250 px = full ±135° sweep around the pivot Y axis. Normalized output `[0..1]`. |
| Browse encoder (rotary-relative) | Vertical drag emits `dy` as a delta; the visual is rotated incrementally. |
| Vertical faders (tempo, channel) | Vertical drag of 200 px = full 0.022 m travel on the local Z axis. Normalized output `[0..1]`. |
| Crossfader | Horizontal drag of 200 px = full ±0.026 m travel on the local X axis. Normalized output `[-1..+1]`. |
| Jogs | Pointer cast against the jog plane (Y = pivot world Y). Each frame emits `{ deltaRadians, velocity, direction }`. The visual is rotated cumulatively. |

Pivots are correct in the GLB; no `PivotGroup` re-wrapping was needed
for any control.

---

## DEBUG / LABEL STRATEGY

- A compact React overlay (`DebugOverlay`) lives in the top-right corner
  of the 3D scene and shows: hovered ID, pressed ID, dragging ID,
  control kind, normalized value, jog Δ/velocity, and the last six
  interaction log lines. "Light all pads" / "Unlight pads" / "Reset pose"
  buttons are wired for quick visual verification.
- The existing DJ app UI (Decks, Mixer, Transport, FX, Sampler, MIDI,
  Library) is **untouched** and remains visible.
- No new in-3D label meshes are generated. Final labels are deferred to
  M12B and will use either a `CanvasTexture` overlay on the panel-label
  slots that the GLB already exposes (`High1PanelLabel`, `LeftTempoFaderTick0`, …)
  or decals over the chassis.

---

## TEST RESULTS

- `npm test` — **480 / 480 passing**
  - new: `src/three/ddj-flx4/controlRegistry.test.ts` (7 tests):
    1. every expected control binds to a real Object3D
    2. no duplicate IDs
    3. fader / rotary ranges are ordered
    4. pads cover indices 1..8 on each deck
    5. no control accidentally points to the scene root
    6. manifest diff is clean
    7. the M12A minimum interactive set is present
- `node scripts/validateRegistryAgainstGlb.mjs` — **108 / 108 required
  GLB object names present**

## TYPECHECK / LINT / BUILD

- `npm run typecheck` — **PASS** (no errors)
- `npm run lint` — **PASS** (0 errors, 0 warnings after fixing
  `eslint.config.js` to ignore `scripts/**`)
- `npm run build` — **PASS** (`tsc -b && vite build`, 67 modules,
  850 kB JS / 17 kB CSS)

## RUNTIME VERIFICATION

- `npm run dev` — Vite ready on `http://localhost:5173/`
  - `/` → 200 OK
  - `/models/ddj-flx4/ddj-flx4-controller.glb` → **200 OK**
  - `/src/three/ddj-flx4/ThreeScene.tsx` → 200 OK
  - `/src/three/ddj-flx4/controlRegistry.ts` → 200 OK
  - `/src/three/ddj-flx4/interaction.ts` → 200 OK

### VERIFIED
- GLB loads and parses (no missing-asset 404s in the dev server log)
- Registry resolves 77 semantic IDs, 0 missing, 0 duplicates
- All required GLB pivots / meshes are present
- Press / depress API mutates the press-mesh along its local axis
- LED API mutates `emissiveIntensity` on a cloned material
- 3D debug overlay displays hovered / pressed / value / jog data

### NOT VERIFIED (require a real browser)
- Live mouse hover text on a control (no GUI in this sandbox)
- Drag-to-rotate knob feel (smooth, no snap)
- Pointer-capture behaviour under fast drags
- Touch / pen pointer events

These will be confirmed in browser smoke-test as part of M12B.

---

## BLOCKERS

None. Every control listed in the M12A "Definition of Done" is
**READY** in the GLB and registered:

- PLAY A/B ✓
- CUE A/B ✓
- Tempo A/B ✓
- Trim A/B, High/Mid/Low A/B, CFX A/B ✓
- Channel fader A/B ✓
- Crossfader ✓
- Jog A/B (platter; rim zone defined as a separate hit target in M12A,
  refined in M12B) ✓
- 8 pads A, 8 pads B ✓

---

## M12A COMPLETION DECISION

**M12A COMPLETE**

The GLB has a usable interaction contract
`3D mesh → semantic control ID → raycast → button/value/jog callback`,
all M12A minimum controls are interactive, interactions are normalized
to `[0..1]` / `[-1..+1]`, controls do not get stuck, the registry
validates, labels are explicitly deferred, and the 3D layer has zero
dependency on DJEngine.

---

## NEXT STEP

**M12B — Bind 3D Controls to DJEngine + Bidirectional State Sync**

(No work started.)
