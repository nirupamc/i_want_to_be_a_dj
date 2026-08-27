# DDJ-FLX4 Controller — Integration Guide

This document describes how to consume the Stage 6 controller asset in a React/Three.js app.

The controller has two integration paths:

- **A. Procedural / source path** — keep the TypeScript constructor and runtime in the consuming app. Best for full animation and state binding.
- **B. GLB path** — load `exports/ddj-flx4-controller.glb` with `GLTFLoader`, then re-bind the runtime from `src/export/controllerBinding.ts` using the manifest in `src/export/controlManifest.ts`.

Both paths use the same `controlManifest` IDs, the same axes, and the same scale.

## Scale and axes

- 1 Three.js unit = 1 meter.
- +X = right, +Y = up, +Z = rear.
- Width: 0.482 m. Depth: 0.2728 m. Height reference: 0.0592 m.
- Individual control Y / profile heights remain `SAFE_TO_APPROXIMATE`.

## Root object

The exported root is `ControllerRoot`. All named control nodes are descendants of it. Names follow the existing schema (e.g. `LeftJogWheelPivot`, `LeftTempoFader`, `ChannelCue1`, `LeftPad01`).

## Semantic IDs

All 77 interactive controls carry a stable semantic ID. The authoritative list is in `src/export/controlManifest.ts` (`EXPECTED_IDS`). Highlights:

```
deck.left.jog, deck.right.jog
deck.left.tempo, deck.right.tempo
deck.left.pad.01 ... deck.left.pad.08
deck.right.pad.01 ... deck.right.pad.08
mixer.channel1.trim, mixer.channel1.eq.high, mixer.channel1.eq.mid, mixer.channel1.eq.low
mixer.channel1.cfx, mixer.channel1.fader, mixer.channel1.cue
mixer.channel2.*
mixer.master.level, mixer.mic.level, mixer.headphones.mix, mixer.headphones.level
mixer.crossfader
mixer.master.cue, mixer.smartCfx, mixer.smartFader
browse.encoder, browse.load1, browse.load2
fx.select, fx.beatLeft, fx.beatRight, fx.onOff, fx.channelSelect, fx.levelDepth
deck.left.cue, deck.left.play, deck.left.shift, deck.left.beatSync
deck.left.loop.in, deck.left.loop.out, deck.left.loop.4beatExit
deck.left.loop.callLeft, deck.left.loop.callRight
deck.left.mode.hotCue, deck.left.mode.padFx1, deck.left.mode.beatJump, deck.left.mode.sampler
(plus the mirror set on deck.right.*)
```

## Path A — Procedural source

```ts
import { createControllerBlockout } from "./src/createControllerBlockout";
import { bindControllerRuntime } from "./src/export/controllerBinding";

const { root, runtime } = createControllerBlockout();
scene.add(root);
const parts = bindControllerRuntime(root);
parts.reset();
parts.jogs.left?.setAngle(0.4);
parts.faders.crossfader?.setValue(0.5);
parts.pads.left[0]?.setLit(true);
parts.buttons["deck.left.play"]?.setPressed(true);
```

The procedural path keeps the full animation/rig behavior. Materials, decals, and lights are all internal to `createControllerBlockout`.

## Path B — GLB load + runtime rebind

```ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bindControllerRuntime } from "./src/export/controllerBinding";

const loader = new GLTFLoader();
const gltf = await loader.loadAsync("exports/ddj-flx4-controller.glb");
scene.add(gltf.scene);
const parts = bindControllerRuntime(gltf.scene);
parts.reset();
```

> The GLB does NOT contain JavaScript runtime behavior. The consuming app must attach its own runtime, using `bindControllerRuntime` plus the control IDs in `controlManifest.ts` to recreate animation, button presses, fader travel, pad lit state, etc. The asset is deterministic at rest pose; interaction must be re-bound.

## How to drive each control

```ts
// jog rotation (radians, around Y)
parts.jogs.left?.rotateBy(0.1);
parts.jogs.right?.setAngle(0.4);

// bounded knob (0..1, mapped internally to ±135° around Y)
parts.knobs["mixer.channel1.eq.high"]?.setValue(0.7);

// browse encoder (continuous rotation, no bounds)
parts.browseEncoder?.rotateBy(0.3);
parts.browseEncoder?.setPressed(true);

// linear fader (0..1, along its own axis)
parts.faders.leftTempo?.setValue(0.25);
parts.faders.channel1?.setValue(0.6);

// crossfader (-1..+1)
parts.faders.crossfader?.setValue(0.5);

// button
parts.buttons["deck.left.play"]?.setPressed(true);
parts.buttons["mixer.channel1.cue"]?.setActive(true);

// pad
parts.pads.left[0]?.setLit(true);
parts.pads.right[3]?.setPressed(true);

// switch (3 positions: 0, 1, 2)
parts.switches["fx.channelSelect"]?.setPosition(2);
```

## Reset

`parts.reset()` is deterministic and puts every control in the documented default pose (jog angle 0, knobs 0.5, faders 0.5, crossfader 0, buttons released, pads released/unlit, switch in position 1). Always call reset before exporting or capturing screenshots.

## Hit targets

Hit targets are **omitted from the GLB**. The `controlManifest` provides a list of expected hit-target names (`<ControlName>HitTarget`) and corresponding `controlId`. The consuming app can recreate invisible hit boxes or rely on the rendered geometry for raycasts.

To recreate a hit target from the manifest, see `src/interaction/hitTargets.ts` for the original sizing rules (controlType, control width / depth, 8 mm height, 5 mm Y offset). Most React apps will roll their own pointer handling, in which case the original hit targets can be discarded entirely.

## GLB limitations

- No JavaScript runtime methods are embedded in the GLB.
- Lights, camera, and rig debug panel are excluded.
- `BoxGeometry(1,1,1)` hit-target boxes are excluded.
- The Stage 5 canvas-rendered decal atlas is baked to `exports/textures/controller-label-atlas.png` and embedded into the GLB as a single texture. The decal atlas is 252 × 8 px. Decal UV regions are preserved per entry.
- Materials are exported as PBR `MeshStandardMaterial` (chassis, jog, knob, etc.) and `MeshBasicMaterial` (decals + hit-targets, the latter excluded).

## Procedural source vs GLB workflow

| Need | Use |
| --- | --- |
| Live state binding, hot-reloadable dev | Path A (procedural) |
| Asset for a packaged Three.js scene | Path B (GLB) |
| Both at once | Load GLB in browser, then re-bind runtime from manifest |

## Acceptance

Validated at Stage 6:

- 77 semantic IDs, 0 duplicates, 77 hit targets
- Width 0.482 m, depth 0.2728 m, height 0.07285 m (decals + labels)
- GLB round-trip: all 10 representative nodes discovered, all 16 pads present, 22 materials, 335 meshes
- Raycast resolves `controlId` correctly for the 6 representative controls

## Files

- `src/export/controlManifest.ts` — authoritative control map.
- `src/export/controllerBinding.ts` — `bindControllerRuntime(root)` and `findControllerParts(root)`.
- `scripts/exportController.mjs` — exports `exports/ddj-flx4-controller.glb` and bakes the atlas to `exports/textures/controller-label-atlas.png`.
- `scripts/validateManifest.mjs` — confirms 77 IDs and zero duplicates.
- `scripts/validateRoundTrip.mjs` — GLB → GLTFLoader round-trip test.
- `scripts/validateRaycast.mjs` — hit-target raycast resolution.
