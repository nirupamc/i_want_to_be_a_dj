import * as THREE from "three";
import { CONTROL_IDS, padId } from "./controlIds";

export type ControlKind =
  | "jog"
  | "rotary-bounded"
  | "rotary-relative"
  | "linear"
  | "crossfader"
  | "button"
  | "pad"
  | "switch"
  | "static";

export type Axis = "x" | "y" | "z";

export interface RuntimeControl {
  id: string;
  kind: ControlKind;
  object: THREE.Object3D;
  hitTarget?: THREE.Object3D;
  axis?: Axis;
  minValue?: number;
  maxValue?: number;
  defaultValue: number | boolean;
  rotationMin?: number;
  rotationMax?: number;
  travelMin?: number;
  travelMax?: number;
  // Per-mesh override for lit (emissive) state. Falls back to defaults.
  litMesh?: THREE.Mesh;
  // Per-mesh override for press travel.
  pressMesh?: THREE.Object3D;
}

const NEG_INF = -Number.POSITIVE_INFINITY;
const POS_INF = Number.POSITIVE_INFINITY;

// All knobs share the same DDJ-FLX4-style bounded rotation (±135°).
const ROTARY_MIN = -2.356194490192345;
const ROTARY_MAX = 2.356194490192345;

// All faders travel 0.022 m on a local axis (per handoff).
const FADER_TRAVEL = 0.022;
const CROSSFADER_TRAVEL = 0.026;

function firstByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

function firstDescendantMesh(root: THREE.Object3D): THREE.Mesh | null {
  let m: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!m && (o as THREE.Mesh).isMesh) m = o as THREE.Mesh;
  });
  return m;
}

export interface RegistryBuildResult {
  controls: Record<string, RuntimeControl>;
  byKind: Record<ControlKind, RuntimeControl[]>;
  missing: string[];
  groups: {
    root: THREE.Object3D;
    jogLeft?: RuntimeControl;
    jogRight?: RuntimeControl;
    padsLeft: RuntimeControl[];
    padsRight: RuntimeControl[];
  };
}

function add(rc: RuntimeControl, controls: Record<string, RuntimeControl>, missing: string[]): void {
  if (!rc.object) {
    missing.push(rc.id);
    return;
  }
  controls[rc.id] = rc;
}

function makeKnob(id: string, pivotName: string, root: THREE.Object3D, controls: Record<string, RuntimeControl>, missing: string[]): void {
  const pivot = firstByName(root, pivotName);
  if (!pivot) {
    missing.push(id);
    return;
  }
  const lit = firstByName(root, `${pivotName.replace(/Pivot$/, "")}TopCap`) as THREE.Mesh | null;
  add(
    {
      id,
      kind: "rotary-bounded",
      object: pivot,
      litMesh: lit ?? undefined,
      axis: "y",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0.5,
      rotationMin: ROTARY_MIN,
      rotationMax: ROTARY_MAX
    },
    controls,
    missing
  );
}

function makeLinearFader(id: string, faderName: string, root: THREE.Object3D, controls: Record<string, RuntimeControl>, missing: string[]): void {
  const fader = firstByName(root, faderName);
  if (!fader) {
    missing.push(id);
    return;
  }
  add(
    {
      id,
      kind: "linear",
      object: fader,
      axis: "z",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0.5,
      travelMin: 0,
      travelMax: FADER_TRAVEL
    },
    controls,
    missing
  );
}

function makeCrossfader(root: THREE.Object3D, controls: Record<string, RuntimeControl>, missing: string[]): void {
  const fader = firstByName(root, "Crossfader");
  if (!fader) {
    missing.push(CONTROL_IDS.mixer.crossfader);
    return;
  }
  add(
    {
      id: CONTROL_IDS.mixer.crossfader,
      kind: "crossfader",
      object: fader,
      axis: "x",
      minValue: -1,
      maxValue: 1,
      defaultValue: 0,
      travelMin: -CROSSFADER_TRAVEL,
      travelMax: CROSSFADER_TRAVEL
    },
    controls,
    missing
  );
}

function makeJog(id: string, side: "left" | "right", root: THREE.Object3D, controls: Record<string, RuntimeControl>, missing: string[]): void {
  const pivot = firstByName(root, `${side === "left" ? "Left" : "Right"}JogWheelPivot`);
  if (!pivot) {
    missing.push(id);
    return;
  }
  add(
    {
      id,
      kind: "jog",
      object: pivot,
      axis: "y",
      minValue: NEG_INF,
      maxValue: POS_INF,
      defaultValue: 0
    },
    controls,
    missing
  );
}

function makeJogRim(id: string, side: "left" | "right", root: THREE.Object3D, controls: Record<string, RuntimeControl>, missing: string[]): void {
  // The rim shares the same pivot as the platter; the interaction layer
  // uses an extra-hit target with a different controlId to disambiguate.
  const pivot = firstByName(root, `${side === "left" ? "Left" : "Right"}JogWheelPivot`);
  if (!pivot) {
    missing.push(id);
    return;
  }
  add(
    {
      id,
      kind: "jog",
      object: pivot,
      axis: "y",
      minValue: NEG_INF,
      maxValue: POS_INF,
      defaultValue: 0
    },
    controls,
    missing
  );
}

function makeButton(id: string, objectName: string, root: THREE.Object3D, controls: Record<string, RuntimeControl>, missing: string[]): void {
  const obj = firstByName(root, objectName);
  if (!obj) {
    missing.push(id);
    return;
  }
  // The pressable mesh sits one level below (e.g. LeftPlayPauseMesh).
  const pressMesh = firstDescendantMesh(obj) ?? undefined;
  add(
    {
      id,
      kind: "button",
      object: obj,
      pressMesh,
      defaultValue: false
    },
    controls,
    missing
  );
}

function makePad(id: string, objectName: string, root: THREE.Object3D, controls: Record<string, RuntimeControl>, missing: string[]): void {
  const obj = firstByName(root, objectName);
  if (!obj) {
    missing.push(id);
    return;
  }
  const pressMesh = firstDescendantMesh(obj) ?? undefined;
  const topCap = firstByName(root, `${objectName}Top`) as THREE.Mesh | null;
  add(
    {
      id,
      kind: "pad",
      object: obj,
      pressMesh,
      litMesh: topCap ?? undefined,
      defaultValue: false
    },
    controls,
    missing
  );
}

export function buildControlRegistry(root: THREE.Object3D): RegistryBuildResult {
  const controls: Record<string, RuntimeControl> = {};
  const missing: string[] = [];

  // Jogs
  makeJog(CONTROL_IDS.decks.left.jog, "left", root, controls, missing);
  makeJog(CONTROL_IDS.decks.right.jog, "right", root, controls, missing);
  // Jog rim — same pivot, separate hit target registered in the interaction layer.
  makeJogRim(`${CONTROL_IDS.decks.left.jog}.rim`, "left", root, controls, missing);
  makeJogRim(`${CONTROL_IDS.decks.right.jog}.rim`, "right", root, controls, missing);

  // Tempo faders
  makeLinearFader(CONTROL_IDS.decks.left.tempo, "LeftTempoFader", root, controls, missing);
  makeLinearFader(CONTROL_IDS.decks.right.tempo, "RightTempoFader", root, controls, missing);

  // Channel faders
  makeLinearFader(CONTROL_IDS.mixer.channel1.fader, "ChannelFader1", root, controls, missing);
  makeLinearFader(CONTROL_IDS.mixer.channel2.fader, "ChannelFader2", root, controls, missing);

  // Crossfader
  makeCrossfader(root, controls, missing);

  // Mixer knobs
  for (const channel of [1, 2] as const) {
    const side = channel === 1 ? "1" : "2";
    const c = channel === 1 ? CONTROL_IDS.mixer.channel1 : CONTROL_IDS.mixer.channel2;
    makeKnob(c.trim, `Trim${side}Pivot`, root, controls, missing);
    makeKnob(c.eqHigh, `High${side}Pivot`, root, controls, missing);
    makeKnob(c.eqMid, `Mid${side}Pivot`, root, controls, missing);
    makeKnob(c.eqLow, `Low${side}Pivot`, root, controls, missing);
    makeKnob(c.cfx, `CFX${side}Pivot`, root, controls, missing);
  }

  // Master / Mic / Headphones
  makeKnob(CONTROL_IDS.mixer.master.level, "MasterLevelPivot", root, controls, missing);
  makeKnob(CONTROL_IDS.mixer.mic.level, "MicLevelPivot", root, controls, missing);
  makeKnob(CONTROL_IDS.mixer.headphones.mix, "HeadphonesMixPivot", root, controls, missing);
  makeKnob(CONTROL_IDS.mixer.headphones.level, "HeadphonesLevelPivot", root, controls, missing);

  // FX knobs
  makeKnob(CONTROL_IDS.fx.levelDepth, "BeatFxLevelDepthPivot", root, controls, missing);

  // Browse encoder — relative rotary
  {
    const pivot = firstByName(root, "BrowseEncoderPivot");
    if (!pivot) {
      missing.push(CONTROL_IDS.browse.encoder);
    } else {
      add(
        {
          id: CONTROL_IDS.browse.encoder,
          kind: "rotary-relative",
          object: pivot,
          axis: "y",
          minValue: NEG_INF,
          maxValue: POS_INF,
          defaultValue: 0
        },
        controls,
        missing
      );
    }
  }

  // FX channel select switch
  {
    const obj = firstByName(root, "BeatFxChannelSelect");
    if (!obj) {
      missing.push(CONTROL_IDS.fx.channelSelect);
    } else {
      add(
        {
          id: CONTROL_IDS.fx.channelSelect,
          kind: "switch",
          object: obj,
          defaultValue: 1
        },
        controls,
        missing
      );
    }
  }

  // Deck buttons — left and right
  for (const [id, name] of [
    [CONTROL_IDS.decks.left.play, "LeftPlayPause"],
    [CONTROL_IDS.decks.left.cue, "LeftCue"],
    [CONTROL_IDS.decks.left.shift, "LeftShift"],
    [CONTROL_IDS.decks.left.sync, "LeftBeatSync"],
    [CONTROL_IDS.decks.left.loopIn, "LeftIn"],
    [CONTROL_IDS.decks.left.loopOut, "LeftOut"],
    [CONTROL_IDS.decks.left.fourBeatExit, "LeftFourBeatExit"],
    [CONTROL_IDS.decks.left.callLeft, "LeftCueLoopCallLeft"],
    [CONTROL_IDS.decks.left.callRight, "LeftCueLoopCallRight"],
    [CONTROL_IDS.decks.left.hotCueMode, "LeftHotCueMode"],
    [CONTROL_IDS.decks.left.padFx1Mode, "LeftPadFX1Mode"],
    [CONTROL_IDS.decks.left.beatJumpMode, "LeftBeatJumpMode"],
    [CONTROL_IDS.decks.left.samplerMode, "LeftSamplerMode"],
    [CONTROL_IDS.mixer.channel1.cue, "ChannelCue1"],
    [CONTROL_IDS.mixer.master.cue, "MasterCue"],
    [CONTROL_IDS.browse.load1, "Load1"],
    [CONTROL_IDS.fx.onOff, "BeatFxOnOff"],
    [CONTROL_IDS.fx.select, "BeatFxSelect"],
    [CONTROL_IDS.mixer.smartCfx, "SmartCFX"],
    [CONTROL_IDS.mixer.smartFader, "SmartFader"]
  ] as Array<[string, string]>) {
    makeButton(id, name, root, controls, missing);
  }
  for (const [id, name] of [
    [CONTROL_IDS.decks.right.play, "RightPlayPause"],
    [CONTROL_IDS.decks.right.cue, "RightCue"],
    [CONTROL_IDS.decks.right.shift, "RightShift"],
    [CONTROL_IDS.decks.right.sync, "RightBeatSync"],
    [CONTROL_IDS.decks.right.loopIn, "RightIn"],
    [CONTROL_IDS.decks.right.loopOut, "RightOut"],
    [CONTROL_IDS.decks.right.fourBeatExit, "RightFourBeatExit"],
    [CONTROL_IDS.decks.right.callLeft, "RightCueLoopCallLeft"],
    [CONTROL_IDS.decks.right.callRight, "RightCueLoopCallRight"],
    [CONTROL_IDS.decks.right.hotCueMode, "RightHotCueMode"],
    [CONTROL_IDS.decks.right.padFx1Mode, "RightPadFX1Mode"],
    [CONTROL_IDS.decks.right.beatJumpMode, "RightBeatJumpMode"],
    [CONTROL_IDS.decks.right.samplerMode, "RightSamplerMode"],
    [CONTROL_IDS.mixer.channel2.cue, "ChannelCue2"],
    [CONTROL_IDS.browse.load2, "Load2"],
    [CONTROL_IDS.fx.beatLeft, "BeatLeft"],
    [CONTROL_IDS.fx.beatRight, "BeatRight"]
  ] as Array<[string, string]>) {
    makeButton(id, name, root, controls, missing);
  }

  // Pads
  const padsLeft: RuntimeControl[] = [];
  const padsRight: RuntimeControl[] = [];
  for (let i = 1; i <= 8; i += 1) {
    const idL = padId("left", i);
    const idR = padId("right", i);
    makePad(idL, `LeftPad${String(i).padStart(2, "0")}`, root, controls, missing);
    makePad(idR, `RightPad${String(i).padStart(2, "0")}`, root, controls, missing);
    const cL = controls[idL];
    const cR = controls[idR];
    if (cL) padsLeft.push(cL);
    if (cR) padsRight.push(cR);
  }

  // Tally by kind
  const byKind: Record<ControlKind, RuntimeControl[]> = {
    jog: [],
    "rotary-bounded": [],
    "rotary-relative": [],
    linear: [],
    crossfader: [],
    button: [],
    pad: [],
    switch: [],
    static: []
  };
  for (const c of Object.values(controls)) byKind[c.kind].push(c);

  return {
    controls,
    byKind,
    missing,
    groups: {
      root,
      jogLeft: controls[CONTROL_IDS.decks.left.jog],
      jogRight: controls[CONTROL_IDS.decks.right.jog],
      padsLeft,
      padsRight
    }
  };
}
