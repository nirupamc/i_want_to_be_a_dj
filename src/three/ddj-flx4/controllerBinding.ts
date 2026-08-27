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
              c.object.rotation.y = c.kind === "jog" ? 0 : 0;
              if (c.kind === "linear") c.object.position.z = c.defaultValue * (c.travelMax ?? 0);
              else if (c.kind === "crossfader") c.object.position.x = c.defaultValue * (c.travelMax ?? 0);
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
