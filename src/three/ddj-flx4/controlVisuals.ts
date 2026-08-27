import * as THREE from "three";
import type { RuntimeControl } from "./controlRegistry";

// ---------------------------------------------------------------------------
// Visual state — how pressed / lit is reflected on the GLB meshes.
// ---------------------------------------------------------------------------

// Cloned-once material cache. We mutate emissiveIntensity to light pads/buttons
// without allocating new materials each frame.
const LIT_INTENSITY = 0.9;
const UNLIT_INTENSITY = 0.0;
const PRESS_DEPTH = 0.0025; // metres of travel when a button/pad is pressed

type LitClone = THREE.MeshStandardMaterial & { __litOwner?: THREE.Mesh };

function ensureMaterialClone(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  const cached = (mesh as THREE.Mesh & { __litClone?: LitClone }).__litClone;
  if (cached) return cached;
  const cloned = (mesh.material as THREE.MeshStandardMaterial).clone();
  cloned.emissive = new THREE.Color(0xff6a00);
  cloned.emissiveIntensity = UNLIT_INTENSITY;
  (mesh as THREE.Mesh & { __litClone?: LitClone }).__litClone = cloned;
  mesh.material = cloned;
  return cloned;
}

export function setControlLit(control: RuntimeControl, lit: boolean): void {
  if (!control.litMesh) return;
  const mat = ensureMaterialClone(control.litMesh);
  mat.emissiveIntensity = lit ? LIT_INTENSITY : UNLIT_INTENSITY;
}

export function setControlPressed(control: RuntimeControl, pressed: boolean): void {
  if (!control.pressMesh) return;
  if (control.kind !== "button" && control.kind !== "pad") return;
  const target = control.pressMesh;
  const axis = (control as RuntimeControl & { pressAxis?: "y" | "z" }).pressAxis ?? "y";
  if (!target.userData.__pressBase) {
    target.userData.__pressBase = target.position[axis];
  }
  const base = target.userData.__pressBase as number;
  target.position[axis] = pressed ? base - PRESS_DEPTH : base;
}

// ---------------------------------------------------------------------------
// Movement — apply normalized value (0..1 or -1..1) to a control's pivot.
// ---------------------------------------------------------------------------

const ROTARY_RANGE = (3 * Math.PI) / 4; // ±135°

export function applyControlValue(control: RuntimeControl, normalized: number): void {
  switch (control.kind) {
    case "rotary-bounded": {
      const t = THREE.MathUtils.clamp(normalized, 0, 1);
      const angle = ROTARY_RANGE * (t * 2 - 1);
      control.object.rotation.y = angle;
      break;
    }
    case "rotary-relative": {
      // setValue is meaningless for a relative encoder; rotateBy drives it.
      break;
    }
    case "linear": {
      const t = THREE.MathUtils.clamp(normalized, 0, 1);
      const travel = (control.travelMax ?? 0) - (control.travelMin ?? 0);
      const offset = (control.travelMin ?? 0) + travel * t;
      control.object.position.z = offset;
      break;
    }
    case "crossfader": {
      const t = THREE.MathUtils.clamp(normalized, -1, 1);
      const travel = (control.travelMax ?? 0) - (control.travelMin ?? 0);
      const offset = (control.travelMin ?? 0) + (travel * (t + 1)) / 2;
      control.object.position.x = offset;
      break;
    }
    case "jog": {
      control.object.rotation.y = normalized;
      break;
    }
    default:
      break;
  }
}

export function resetControl(control: RuntimeControl): void {
  if (typeof control.defaultValue === "number") {
    applyControlValue(control, control.defaultValue);
  }
  setControlLit(control, false);
  setControlPressed(control, false);
}

export function resetAll(controls: RuntimeControl[]): void {
  for (const c of controls) resetControl(c);
}
