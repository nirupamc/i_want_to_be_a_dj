import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { RuntimeControl } from "./controlRegistry";
import { InteractionController, normalizePointerToNdc } from "./interaction";

function control(id: string, x: number): RuntimeControl {
  const pivot = new THREE.Group();
  pivot.name = `${id}Pivot`;
  pivot.position.set(x, 0, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), new THREE.MeshBasicMaterial());
  mesh.position.y = 0.1;
  pivot.add(mesh);
  return { id, kind: "button", object: pivot, pressMesh: mesh, defaultValue: false };
}

function makeDom(): HTMLElement {
  const dom = document.createElement("div");
  Object.defineProperty(dom, "getBoundingClientRect", {
    value: () => ({ left: 100, top: 50, width: 800, height: 400 })
  });
  return dom;
}

describe("3D interaction hit targets", () => {
  it("normalizes pointer coordinates against the canvas rectangle", () => {
    expect(normalizePointerToNdc({ clientX: 500, clientY: 250 }, { left: 100, top: 50, width: 800, height: 400 }).toArray()).toEqual([0, 0]);
  });

  it("updates transformed parent matrices and creates overlapping local hitboxes", () => {
    const scene = new THREE.Scene();
    const left = control("left.play", -1);
    left.object.rotation.y = Math.PI / 4;
    left.object.scale.set(1.5, 1, 0.75);
    scene.add(left.object);
    const controller = new InteractionController({
      dom: makeDom(),
      camera: new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 10),
      scene,
      controls: { [left.id]: left },
      callbacks: {}
    });

    controller.attach();
    const diagnostics = controller.getHitboxDiagnostics();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].overlapRatio).toBeGreaterThan(0.9);
    expect(controller.getRaycastTargets()).toHaveLength(1);
    expect(controller.hitTest(left.id)?.object.uuid).toBe(controller.getRaycastTargets()[0].uuid);
    controller.detach();
  });

  it("keeps adjacent control hitboxes distinct", () => {
    const scene = new THREE.Scene();
    const first = control("pad.01", -1);
    const second = control("pad.02", 1);
    scene.add(first.object, second.object);
    const controller = new InteractionController({
      dom: makeDom(),
      camera: new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 10),
      scene,
      controls: { [first.id]: first, [second.id]: second },
      callbacks: {}
    });
    controller.attach();
    const [a, b] = controller.getHitboxDiagnostics();
    expect(a.hitboxWorldBox.intersectsBox(b.hitboxWorldBox)).toBe(false);
    controller.detach();
  });
});
