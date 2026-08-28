import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildControlRegistry } from "./controlRegistry";
import { CONTROL_IDS, allExpectedIds, padId } from "./controlIds";
import { buildManifest, diffManifestAgainstExpected } from "./controlManifest";

// Builds an in-memory fake "GLB" tree that matches the names that the
// registry expects, so we can validate the registry without loading the real
// .glb file (jsdom can't parse glb anyway).
function makeFakeRoot(): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = "ControllerRoot";
  const child = new THREE.Object3D();
  child.name = "LeftDeck";
  root.add(child);
  return root;
}

function addPivot(parent: THREE.Object3D, name: string): THREE.Object3D {
  const p = new THREE.Object3D();
  p.name = name;
  parent.add(p);
  return p;
}

function addMesh(parent: THREE.Object3D, name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.01), new THREE.MeshBasicMaterial());
  m.name = name;
  parent.add(m);
  return m;
}

function addLinearFader(parent: THREE.Object3D, name: string, axis: "x" | "z"): void {
  const rail = new THREE.Mesh(
    axis === "z" ? new THREE.BoxGeometry(0.01, 0.002, 0.1) : new THREE.BoxGeometry(0.1, 0.002, 0.01),
    new THREE.MeshBasicMaterial()
  );
  rail.name = `${name}Track`;
  parent.add(rail);
  const handle = new THREE.Object3D();
  handle.name = `${name}Handle`;
  const cap = new THREE.Mesh(
    axis === "z" ? new THREE.BoxGeometry(0.02, 0.006, 0.012) : new THREE.BoxGeometry(0.012, 0.006, 0.02),
    new THREE.MeshBasicMaterial()
  );
  cap.name = `${name}HandleBody`;
  handle.add(cap);
  parent.add(handle);
}

function buildFakeModel(): THREE.Object3D {
  const root = makeFakeRoot();
  const left = new THREE.Object3D(); left.name = "LeftDeck"; root.add(left);
  const right = new THREE.Object3D(); right.name = "RightDeck"; root.add(right);
  const mixer = new THREE.Object3D(); mixer.name = "Mixer"; root.add(mixer);

  // Jogs
  addPivot(left, "LeftJogWheelPivot");
  addPivot(right, "RightJogWheelPivot");

  // Tempo
  const leftTempo = addPivot(left, "LeftTempoFader"); addLinearFader(leftTempo, "LeftTempoFader", "z");
  const rightTempo = addPivot(right, "RightTempoFader"); addLinearFader(rightTempo, "RightTempoFader", "z");

  // Channel faders + crossfader
  const channel1 = addPivot(mixer, "ChannelFader1"); addLinearFader(channel1, "ChannelFader1", "z");
  const channel2 = addPivot(mixer, "ChannelFader2"); addLinearFader(channel2, "ChannelFader2", "z");
  const crossfader = addPivot(mixer, "Crossfader"); addLinearFader(crossfader, "Crossfader", "x");

  // Knobs
  for (const side of [1, 2]) {
    for (const name of ["Trim", "High", "Mid", "Low", "CFX"]) {
      const p = addPivot(mixer, `${name}${side}Pivot`);
      addMesh(p, `${name}${side}TopCap`);
    }
  }
  addPivot(mixer, "MasterLevelPivot"); addMesh(mixer.children[mixer.children.length - 1] as THREE.Object3D, "MasterLevelTopCap");
  addPivot(mixer, "MicLevelPivot"); addMesh(mixer.children[ mixer.children.length - 1] as THREE.Object3D, "MicLevelTopCap");
  addPivot(mixer, "HeadphonesMixPivot"); addMesh(mixer.children[mixer.children.length - 1] as THREE.Object3D, "HeadphonesMixTopCap");
  addPivot(mixer, "HeadphonesLevelPivot"); addMesh(mixer.children[mixer.children.length - 1] as THREE.Object3D, "HeadphonesLevelTopCap");
  addPivot(mixer, "BeatFxLevelDepthPivot"); addMesh(mixer.children[mixer.children.length - 1] as THREE.Object3D, "BeatFxLevelDepthTopCap");
  addPivot(mixer, "BrowseEncoderPivot");
  addPivot(mixer, "BeatFxChannelSelect");

  // Buttons
  for (const side of ["Left", "Right"] as const) {
    for (const name of ["PlayPause", "Cue", "Shift", "BeatSync", "In", "Out", "FourBeatExit", "CueLoopCallLeft", "CueLoopCallRight", "HotCueMode", "PadFX1Mode", "BeatJumpMode", "SamplerMode"]) {
      const grp = addPivot(side === "Left" ? left : right, `${side}${name}`);
      const mesh = addPivot(grp, `${side}${name}Mesh`);
      addMesh(mesh, `${side}${name}Body`);
      addMesh(mesh, `${side}${name}Top`);
    }
    for (let i = 1; i <= 8; i += 1) {
      const id = String(i).padStart(2, "0");
      const grp = addPivot(side === "Left" ? left : right, `${side}Pad${id}`);
      const mesh = addPivot(grp, `${side}Pad${id}Mesh`);
      addMesh(mesh, `${side}Pad${id}Body`);
      addMesh(mesh, `${side}Pad${id}Top`);
    }
  }
  addPivot(mixer, "ChannelCue1"); const cm1 = addPivot(mixer.children[mixer.children.length - 1] as THREE.Object3D, "ChannelCue1Mesh"); addMesh(cm1, "ChannelCue1Body");
  addPivot(mixer, "ChannelCue2"); const cm2 = addPivot(mixer.children[mixer.children.length - 1] as THREE.Object3D, "ChannelCue2Mesh"); addMesh(cm2, "ChannelCue2Body");
  addPivot(mixer, "MasterCue"); const mcm = addPivot(mixer.children[mixer.children.length - 1] as THREE.Object3D, "MasterCueMesh"); addMesh(mcm, "MasterCueBody");
  addPivot(mixer, "Load1"); const l1m = addPivot(mixer.children[mixer.children.length - 1] as THREE.Object3D, "Load1Mesh"); addMesh(l1m, "Load1Body");
  addPivot(mixer, "Load2"); const l2m = addPivot(mixer.children[mixer.children.length - 1] as THREE.Object3D, "Load2Mesh"); addMesh(l2m, "Load2Body");
  addPivot(mixer, "BeatFxOnOff");
  addPivot(mixer, "BeatFxSelect");
  addPivot(mixer, "BeatLeft");
  addPivot(mixer, "BeatRight");
  addPivot(mixer, "SmartCFX");
  addPivot(mixer, "SmartFader");

  return root;
}

describe("M12A control registry", () => {
  it("binds every expected control to a real Object3D", () => {
    const root = buildFakeModel();
    const { controls, missing } = buildControlRegistry(root);
    expect(missing).toEqual([]);
    const expected = new Set(allExpectedIds());
    const bound = new Set(Object.keys(controls));
    for (const id of expected) expect(bound.has(id), `missing registry entry: ${id}`).toBe(true);
  });

  it("has no duplicate IDs", () => {
    const root = buildFakeModel();
    const { controls } = buildControlRegistry(root);
    const ids = Object.keys(controls);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fader travel ranges are ordered (min < max)", () => {
    const root = buildFakeModel();
    const { controls } = buildControlRegistry(root);
    for (const id of Object.keys(controls)) {
      const c = controls[id];
      if (c.kind === "linear" || c.kind === "crossfader") {
        expect(c.travelMax).toBeGreaterThan(c.travelMin!);
      }
      if (c.kind === "rotary-bounded") {
        expect(c.rotationMax).toBeGreaterThan(c.rotationMin!);
      }
    }
  });

  it("retains authored fader positions and rotary pivot rotations", () => {
    const root = buildFakeModel();
    const channelFader = root.getObjectByName("ChannelFader1")!;
    const crossfader = root.getObjectByName("Crossfader")!;
    const high = root.getObjectByName("High1Pivot")!;
    channelFader.position.z = -0.069;
    crossfader.position.x = 0.004;
    high.rotation.set(0.1, 0.2, 0.3);

    const { controls } = buildControlRegistry(root);
    expect(controls["mixer.channel1.fader"].basePosition?.z).toBeCloseTo(0);
    expect(controls["mixer.crossfader"].basePosition?.x).toBeCloseTo(0);
    expect(controls["mixer.channel1.eq.high"].baseRotation?.toArray()).toEqual([0.1, 0.2, 0.3, "XYZ"]);
  });

  it("pads exactly cover indices 0..7 per deck", () => {
    const root = buildFakeModel();
    const { controls } = buildControlRegistry(root);
    for (const side of ["left", "right"] as const) {
      for (let i = 1; i <= 8; i += 1) {
        const id = padId(side, i);
        expect(controls[id]?.kind).toBe("pad");
      }
    }
  });

  it("no control accidentally points to scene root", () => {
    const root = buildFakeModel();
    const { controls } = buildControlRegistry(root);
    for (const c of Object.values(controls)) {
      expect(c.object).not.toBe(root);
      // And the resolved object must actually be inside the root tree.
      let cur: THREE.Object3D | null = c.object;
      let inTree = false;
      while (cur) {
        if (cur === root) { inTree = true; break; }
        cur = cur.parent;
      }
      expect(inTree).toBe(true);
    }
  });

  it("manifest diff against EXPECTED_IDS is clean", () => {
    const root = buildFakeModel();
    const m = buildManifest(root);
    const diff = diffManifestAgainstExpected(m);
    expect(diff.missing).toEqual([]);
    // M12B adds two extra jog-rim virtual controls; the manifest diff
    // flags them as "unexpected" because the canonical expected set is
    // a strict M12A list. They are allowed here.
    const extraAllowed = [`${CONTROL_IDS.decks.left.jog}.rim`, `${CONTROL_IDS.decks.right.jog}.rim`];
    const unexpectedFiltered = diff.unexpected.filter((id) => !extraAllowed.includes(id));
    expect(unexpectedFiltered).toEqual([]);
    expect(diff.duplicates).toEqual([]);
  });

  it("validates the M12A minimum interactive set is present", () => {
    const root = buildFakeModel();
    const { controls } = buildControlRegistry(root);
    const must: string[] = [
      CONTROL_IDS.decks.left.play, CONTROL_IDS.decks.right.play,
      CONTROL_IDS.decks.left.cue, CONTROL_IDS.decks.right.cue,
      CONTROL_IDS.decks.left.tempo, CONTROL_IDS.decks.right.tempo,
      CONTROL_IDS.mixer.channel1.trim, CONTROL_IDS.mixer.channel2.trim,
      CONTROL_IDS.mixer.channel1.eqHigh, CONTROL_IDS.mixer.channel1.eqMid, CONTROL_IDS.mixer.channel1.eqLow,
      CONTROL_IDS.mixer.channel2.eqHigh, CONTROL_IDS.mixer.channel2.eqMid, CONTROL_IDS.mixer.channel2.eqLow,
      CONTROL_IDS.mixer.channel1.cfx, CONTROL_IDS.mixer.channel2.cfx,
      CONTROL_IDS.mixer.channel1.fader, CONTROL_IDS.mixer.channel2.fader,
      CONTROL_IDS.mixer.crossfader,
      CONTROL_IDS.decks.left.jog, CONTROL_IDS.decks.right.jog,
      `${CONTROL_IDS.decks.left.jog}.rim`, `${CONTROL_IDS.decks.right.jog}.rim`
    ];
    for (let i = 1; i <= 8; i += 1) {
      must.push(padId("left", i), padId("right", i));
    }
    for (const id of must) {
      expect(controls[id], `must have ${id}`).toBeDefined();
    }
  });
});
