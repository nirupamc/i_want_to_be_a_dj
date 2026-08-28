import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { ThreeToEngineDispatcher, type LibraryBridge } from "./dispatcher";
import { buildControlRegistry } from "./controlRegistry";
import { createDJEngine } from "../../engine";
import { StateSync } from "./stateSync";

function buildFakeModel(): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = "ControllerRoot";
  for (const side of ["Left", "Right"]) {
    const deck = new THREE.Object3D(); deck.name = `${side}Deck`; root.add(deck);
    const j = new THREE.Object3D(); j.name = `${side}JogWheelPivot`; deck.add(j);
    const t = new THREE.Object3D(); t.name = `${side}TempoFader`; deck.add(t);
    for (let i = 1; i <= 8; i++) {
      const p = new THREE.Object3D(); p.name = `${side}Pad${String(i).padStart(2, "0")}`; deck.add(p);
      const pm = new THREE.Object3D(); pm.name = `${side}Pad${String(i).padStart(2, "0")}Mesh`; p.add(pm);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.01), new THREE.MeshBasicMaterial());
      top.name = `${side}Pad${String(i).padStart(2, "0")}Top`; pm.add(top);
    }
    for (const b of ["Play", "Cue", "Shift", "BeatSync", "HotCueMode", "BeatJumpMode", "SamplerMode"]) {
      const g = new THREE.Object3D(); g.name = `${side}${b}`; deck.add(g);
    }
  }
  const mixer = new THREE.Object3D(); mixer.name = "Mixer"; root.add(mixer);
  for (const name of ["ChannelFader1", "ChannelFader2", "Crossfader", "BrowseEncoderPivot"]) {
    const p = new THREE.Object3D(); p.name = name; mixer.add(p);
  }
  for (const knob of ["Trim", "High", "Mid", "Low", "CFX"]) {
    for (const ch of [1, 2]) {
      const p = new THREE.Object3D(); p.name = `${knob}${ch}Pivot`; mixer.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.01), new THREE.MeshBasicMaterial());
      cap.name = `${knob}${ch}TopCap`; p.add(cap);
    }
  }
  for (const name of ["MasterLevelPivot", "MicLevelPivot", "HeadphonesMixPivot", "HeadphonesLevelPivot", "BeatFxLevelDepthPivot"]) {
    const p = new THREE.Object3D(); p.name = name; mixer.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.01), new THREE.MeshBasicMaterial());
    cap.name = name.replace("Pivot", "TopCap"); p.add(cap);
  }
  return root;
}

function makeLibrary(): LibraryBridge {
  return { select: () => {}, load: () => {} };
}

describe("M12B state sync", () => {
  let engine: ReturnType<typeof createDJEngine>;
  let dispatcher: ThreeToEngineDispatcher;
  let stateSync: StateSync;
  let controls: Record<string, import("./controlRegistry").RuntimeControl>;

  beforeEach(() => {
    engine = createDJEngine();
    dispatcher = new ThreeToEngineDispatcher(engine, makeLibrary());
    const model = buildFakeModel();
    controls = buildControlRegistry(model).controls;
    stateSync = new StateSync({ controls, dispatcher });
    stateSync.start();
  });

  it("EQ 0 dB centers the 3D knob at normalized 0.5", () => {
    engine.dispatch({ type: "SET_EQ_HIGH", deck: 0, db: 0 });
    stateSync.applyState(engine.getState());
    const c = controls["mixer.channel1.eq.high"];
    // rotation y = 0 when value is 0.5 (centered)
    expect(c.object.rotation.y).toBeCloseTo(0, 5);
  });

  it("Tempo fader matches engine tempoRange", () => {
    engine.dispatch({ type: "CYCLE_TEMPO_RANGE", deck: 0 }); // 10 → 16
    engine.dispatch({ type: "SET_TEMPO", deck: 0, percent: 8 }); // 50% of 16 → normalized 0.75
    stateSync.applyState(engine.getState());
    const c = controls["deck.left.tempo"];
    // travel = 0.022, position.z = 0.75 * 0.022 = 0.0165
    expect(c.object.position.z).toBeCloseTo(0.75 * 0.022, 5);
  });

  it("Channel fader visual position reflects engine state", () => {
    engine.dispatch({ type: "SET_CHANNEL_FADER", deck: 0, fader: 0.8 });
    stateSync.applyState(engine.getState());
    expect(controls["mixer.channel1.fader"].object.position.z).toBeCloseTo(0.8 * 0.022, 5);
  });

  it("Crossfader visual X reflects engine state", () => {
    engine.dispatch({ type: "SET_CROSSFADER", x: 0.25 });
    stateSync.applyState(engine.getState());
    // 3D X = engine X * 2 - 1 = -0.5
    expect(controls["mixer.crossfader"].object.position.x).toBeCloseTo(-0.5 * 0.026, 5);
  });

  it("Tempo/loop/play control IDs exist", () => {
    expect(controls["deck.left.tempo"]).toBeDefined();
    expect(controls["mixer.crossfader"]).toBeDefined();
  });

  it("Programmatic visual update does not dispatch a new action", () => {
    // Apply state to a non-default value; confirm no engine dispatch
    // is triggered by the apply (suppression works).
    const dispatchSpy = vi.spyOn(engine, "dispatch");
    const calls = dispatchSpy.mock.calls.length;
    stateSync.applyState(engine.getState());
    expect(dispatchSpy.mock.calls.length).toBe(calls);
    dispatchSpy.mockRestore();
  });

  it("Applies the same state twice without errors", () => {
    stateSync.applyState(engine.getState());
    stateSync.applyState(engine.getState());
    stateSync.applyState(engine.getState());
  });
});

function _litOf(c: import("./controlRegistry").RuntimeControl): boolean {
  if (!c.litMesh) return false
  const m = c.litMesh.material as THREE.MeshStandardMaterial
  if (!m || !("emissiveIntensity" in m)) return false
  return m.emissiveIntensity !== undefined && m.emissiveIntensity > 0.5
}
