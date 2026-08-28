import * as THREE from "three";
import { buildControlRegistry, type RuntimeControl } from "./controlRegistry";

export interface BoundController {
  root: THREE.Object3D;
  controls: Record<string, RuntimeControl>;
  missing: string[];
  reset(): void;
  getControl(id: string): RuntimeControl | undefined;
}

export function bindControllerRuntime(root: THREE.Object3D): BoundController {
  const { controls, missing } = buildControlRegistry(root);
  return {
    root,
    controls,
    missing,
    reset: () => {
      for (const c of Object.values(controls)) {
        if (typeof c.defaultValue === "number") {
          switch (c.kind) {
            case "rotary-bounded":
            case "linear":
            case "crossfader":
            case "jog":
              if (c.kind === "rotary-bounded") {
                const base = c.baseRotation ?? c.object.rotation;
                c.object.rotation.copy(base);
              } else if (c.kind === "jog") {
                c.object.rotation.y = c.baseRotation?.y ?? 0;
              } else {
                const axis = c.axis ?? (c.kind === "crossfader" ? "x" : "z");
                const base = c.basePosition?.[axis] ?? c.object.position[axis];
                const min = c.travelMin ?? 0;
                const max = c.travelMax ?? 0;
                const value = typeof c.defaultValue === "number" ? c.defaultValue : 0;
                const normalized = c.kind === "crossfader" ? (value + 1) / 2 : value;
                c.object.position[axis] = base + min + (max - min) * normalized;
              }
              break;
            default:
              break;
          }
        }
      }
    },
    getControl: (id) => controls[id]
  };
}
