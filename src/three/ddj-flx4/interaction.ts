import * as THREE from "three";
import type { RuntimeControl } from "./controlRegistry";

export interface ExtraHitTarget {
  /** Control ID to report when this hit target is picked. */
  controlId: string;
  /** Bounding-sphere radius in local units. */
  radius: number;
  /** Bounding-sphere center in local space (relative to control.object). */
  center: THREE.Vector3;
  /** Optional "rim" — only hits if the pointer's distance from the center
   *  is at least `innerRadius`. If omitted the hit is a full disc. */
  innerRadius?: number;
}

export interface InteractionCallbacks {
  onControlDown?: (id: string) => void;
  onControlUp?: (id: string) => void;
  onControlValue?: (id: string, normalized: number) => void;
  onJogStart?: (id: string) => void;
  onJogMove?: (id: string, info: { deltaRadians: number; velocity: number; direction: 1 | -1 }) => void;
  onJogEnd?: (id: string) => void;
  onHoverChange?: (id: string | null) => void;
}

interface DragSession {
  control: RuntimeControl;
  pointerId: number;
  // Anchor state for stable drag-start.
  startX: number;
  startY: number;
  startValue: number;
  jogAngle: number;
  jogLastAngle: number;
  jogLastTime: number;
  jogCenter: THREE.Vector3;
  pressRestore?: () => void;
}

const KNOB_PIXELS_PER_FULL_TURN = 250; // 1 full turn requires 250 px of vertical drag
const FADER_PIXELS_PER_FULL_TRAVEL = 200;

export function normalizePointerToNdc(
  e: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number }
): THREE.Vector2 {
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
}

function visibleWorldBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && !(object as THREE.Mesh).userData.__interactionHitbox) {
      box.expandByObject(object);
    }
  });
  return box;
}

function localBoundsFromWorldBounds(worldBox: THREE.Box3, parent: THREE.Object3D): THREE.Box3 {
  parent.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  for (const x of [worldBox.min.x, worldBox.max.x]) {
    for (const y of [worldBox.min.y, worldBox.max.y]) {
      for (const z of [worldBox.min.z, worldBox.max.z]) {
        points.push(parent.worldToLocal(new THREE.Vector3(x, y, z)));
      }
    }
  }
  return new THREE.Box3().setFromPoints(points);
}

function makeHitBox(control: RuntimeControl, sizeMultiplier = 2.2, _height = 0.012): THREE.Mesh | null {
  if (!(control.object as THREE.Mesh).isMesh && !firstDescendantBox(control.object)) {
    return null;
  }
  control.object.updateMatrixWorld(true);
  const visualWorldBox = visibleWorldBounds(control.object);
  if (!isFinite(visualWorldBox.min.x)) return null;
  const box = localBoundsFromWorldBounds(visualWorldBox, control.object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  if (control.hitboxCenter && control.hitboxSize) {
    const geometry = new THREE.BoxGeometry(
      Math.max(control.hitboxSize.x, 0.005),
      Math.max(control.hitboxSize.y, _height),
      Math.max(control.hitboxSize.z, 0.005)
    );
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(control.hitboxCenter);
    mesh.userData.controlId = control.id;
    mesh.userData.controlKind = control.kind;
    mesh.userData.control = control;
    mesh.userData.__interactionHitbox = true;
    mesh.userData.visualWorldBox = visualWorldBox.clone();
    mesh.name = `${control.object.name ?? control.id}Hit`;
    return mesh;
  }
  const geo = new THREE.BoxGeometry(
    Math.max(size.x, 0.005) * sizeMultiplier,
    Math.max(size.y * sizeMultiplier, _height),
    Math.max(size.z, 0.005) * sizeMultiplier
  );
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(center);
  mesh.userData.controlId = control.id;
  mesh.userData.controlKind = control.kind;
  mesh.userData.control = control;
  mesh.userData.__interactionHitbox = true;
  mesh.userData.visualWorldBox = visualWorldBox.clone();
  mesh.name = `${control.object.name ?? control.id}Hit`;
  return mesh;
}

function firstDescendantBox(root: THREE.Object3D): THREE.Mesh | null {
  let m: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!m && (o as THREE.Mesh).isMesh) m = o as THREE.Mesh;
  });
  return m;
}

export class InteractionController {
  private readonly dom: HTMLElement;
  private readonly camera: THREE.Camera;
  private readonly scene: THREE.Scene;
  private readonly hitGroup = new THREE.Group();
  private readonly controls: Record<string, RuntimeControl>;
  private readonly callbacks: InteractionCallbacks;
  private readonly extraHits: ExtraHitTarget[] = [];
  private readonly hitByControl = new Map<string, THREE.Mesh>();
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerCancel: (e: PointerEvent) => void;
  private readonly onLostPointerCapture: (e: PointerEvent) => void;
  private readonly onContextMenu: (e: Event) => void;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private drag: DragSession | null = null;
  private hoveredId: string | null = null;
  private debugVisualization = false;

  constructor(opts: {
    dom: HTMLElement;
    camera: THREE.Camera;
    scene: THREE.Scene;
    controls: Record<string, RuntimeControl>;
    callbacks: InteractionCallbacks;
    extraHits?: ExtraHitTarget[];
  }) {
    this.dom = opts.dom;
    this.camera = opts.camera;
    this.scene = opts.scene;
    this.controls = opts.controls;
    this.callbacks = opts.callbacks;
    this.extraHits = opts.extraHits ?? [];
    this.onPointerMove = (e) => this.handleMove(e);
    this.onPointerDown = (e) => this.handleDown(e);
    this.onPointerUp = (e) => this.handleUp(e);
    this.onPointerCancel = (e) => this.handleCancel(e);
    this.onLostPointerCapture = (e) => this.handleLostCapture(e);
    this.onContextMenu = (e) => e.preventDefault();
  }

  /** Attach invisible hit boxes for every interactive control. */
  attach(): void {
    this.scene.updateMatrixWorld(true);
    for (const control of Object.values(this.controls)) {
      const hit = this.createHitTarget(control);
      if (!hit) continue;
      this.hitByControl.set(control.id, hit);
      // Add the hitbox as a child of the control pivot so transforms follow.
      control.object.add(hit);
    }
    this.scene.updateMatrixWorld(true);
    this.updateDebugMaterials();
    // Listen on the DOM element (canvas) — one centralized handler.
    this.dom.addEventListener("pointerdown", this.onPointerDown);
    this.dom.addEventListener("pointermove", this.onPointerMove);
    this.dom.addEventListener("pointerup", this.onPointerUp);
    this.dom.addEventListener("pointercancel", this.onPointerCancel);
    this.dom.addEventListener("lostpointercapture", this.onLostPointerCapture);
    this.dom.addEventListener("contextmenu", this.onContextMenu);
  }

  detach(): void {
    for (const hit of this.hitByControl.values()) {
      hit.parent?.remove(hit);
    }
    this.hitByControl.clear();
    this.dom.removeEventListener("pointerdown", this.onPointerDown);
    this.dom.removeEventListener("pointermove", this.onPointerMove);
    this.dom.removeEventListener("pointerup", this.onPointerUp);
    this.dom.removeEventListener("pointercancel", this.onPointerCancel);
    this.dom.removeEventListener("lostpointercapture", this.onLostPointerCapture);
    this.dom.removeEventListener("contextmenu", this.onContextMenu);
  }

  setDebugVisualization(enabled: boolean): void {
    this.debugVisualization = enabled;
    this.updateDebugMaterials();
  }

  setHoveredControl(id: string | null): void {
    this.hoveredId = id;
    this.updateDebugMaterials();
  }

  getRaycastTargets(): THREE.Mesh[] {
    return [...this.hitByControl.values()];
  }

  getHitboxDiagnostics(): Array<{ id: string; hitboxUuid: string; targetName: string; parentName: string; visualWorldBox: THREE.Box3; hitboxWorldBox: THREE.Box3; overlapRatio: number }> {
    this.scene.updateMatrixWorld(true);
    return [...this.hitByControl.entries()].map(([id, hitbox]) => {
      const visualWorldBox = (hitbox.userData.visualWorldBox as THREE.Box3).clone();
      const hitboxWorldBox = new THREE.Box3().setFromObject(hitbox);
      const visualSize = visualWorldBox.getSize(new THREE.Vector3());
      const intersection = visualWorldBox.clone().intersect(hitboxWorldBox);
      const intersectionSize = intersection.getSize(new THREE.Vector3());
      const visualVolume = visualSize.x * visualSize.y * visualSize.z;
      const intersectionVolume = intersectionSize.x * intersectionSize.y * intersectionSize.z;
      return {
      id,
      hitboxUuid: hitbox.uuid,
      targetName: this.controls[id].object.name,
      parentName: hitbox.parent?.name ?? "",
      visualWorldBox,
      hitboxWorldBox,
      overlapRatio: visualVolume > 0 ? intersectionVolume / visualVolume : 0
      };
    });
  }

  private updateDebugMaterials(): void {
    for (const [id, hitbox] of this.hitByControl) {
      const material = hitbox.material as THREE.MeshBasicMaterial;
      material.depthTest = false;
      material.wireframe = this.debugVisualization;
      material.transparent = true;
      material.opacity = this.debugVisualization ? (id === this.hoveredId ? 0.42 : 0.14) : 0;
      material.color.set(id === this.hoveredId ? 0xffd166 : 0x38bdf8);
    }
  }

  /** Synthesise a hit test result for a particular control id (e.g. for tests). */
  hitTest(controlId: string): THREE.Intersection | null {
    const hit = this.hitByControl.get(controlId);
    if (!hit) return null;
    return { object: hit, distance: 0 } as unknown as THREE.Intersection;
  }

  /** Force-release any in-flight drag (e.g. on unmount). */
  releaseDrag(): void {
    if (!this.drag) return;
    this.endDrag(this.drag);
    this.drag = null;
  }

  private createHitTarget(control: RuntimeControl): THREE.Mesh | null {
    let sizeMultiplier = 1.8;
    let height = 0.012;
    if (control.kind === "pad" || control.kind === "button") {
      sizeMultiplier = control.kind === "pad" ? 1.1 : 1.25;
      height = 0.02;
    } else if (control.kind === "jog") {
      // Use the entire pivot bounding sphere for a single disc hit.
      sizeMultiplier = 1.0;
      height = 0.012;
    } else if (control.kind === "linear") {
      // Keep vertical faders generous along travel while avoiding adjacent EQ knobs.
      sizeMultiplier = 1.0;
    } else {
      sizeMultiplier = control.kind === "crossfader" ? 1.25 : 1.35;
    }
    return makeHitBox(control, sizeMultiplier, height);
  }

  private updateNDC(e: PointerEvent): void {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.copy(normalizePointerToNdc(e, rect));
  }

  private pick(): RuntimeControl | null {
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits: THREE.Intersection[] = [];
    for (const hit of this.hitByControl.values()) hits.push(...this.raycaster.intersectObject(hit, false));
    hits.sort((a, b) => a.distance - b.distance);
    if (hits.length > 0) {
      const hit = hits[0];
      const id = hit.object.userData.controlId as string | undefined;
      if (!id) return null;
      return this.controls[id] ?? null;
    }
    // No box hit — try the extra (jog rim) hit targets. These are
    // raycasted against a horizontal plane through their center and
    // require the pointer to fall within the radial annulus.
    if (this.extraHits.length > 0) {
      const ray = this.raycaster.ray;
      let best: { id: string; distance: number } | null = null;
      for (const extra of this.extraHits) {
        const ctl = this.controls[extra.controlId];
        if (!ctl) continue;
        ctl.object.updateWorldMatrix(true, false);
        const localCenter = extra.center.clone().applyMatrix4(ctl.object.matrixWorld);
        const denom = ray.direction.y;
        if (Math.abs(denom) < 1e-6) continue;
        const t = (localCenter.y - ray.origin.y) / denom;
        if (!isFinite(t) || t < 0) continue;
        const hit = new THREE.Vector3().copy(ray.origin).addScaledVector(ray.direction, t);
        const d = hit.distanceTo(localCenter);
        if (d > extra.radius) continue;
        if (extra.innerRadius !== undefined && d < extra.innerRadius) continue;
        if (best === null || t < best.distance) {
          best = { id: extra.controlId, distance: t };
        }
      }
      if (best) return this.controls[best.id] ?? null;
    }
    return null;
  }

  private handleDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.updateNDC(e);
    const control = this.pick();
    if (!control) return;
    e.preventDefault();
    this.dom.setPointerCapture(e.pointerId);
    this.beginDrag(control, e);
  }

  private beginDrag(control: RuntimeControl, e: PointerEvent): void {
    if (control.kind === "button" || control.kind === "pad") {
      this.callbacks.onControlDown?.(control.id);
      this.drag = {
        control,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startValue: 0,
        jogAngle: 0,
        jogLastAngle: 0,
        jogLastTime: performance.now(),
        jogCenter: this.jogWorldCenter(control)
      };
      return;
    }
    if (control.kind === "rotary-bounded" || control.kind === "rotary-relative") {
      const cur = control.kind === "rotary-bounded" ? this.readBoundedNormalized(control) : 0;
      this.drag = {
        control,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startValue: cur,
        jogAngle: 0,
        jogLastAngle: 0,
        jogLastTime: performance.now(),
        jogCenter: new THREE.Vector3()
      };
      return;
    }
    if (control.kind === "linear" || control.kind === "crossfader") {
      const cur = this.readLinearNormalized(control);
      this.drag = {
        control,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startValue: cur,
        jogAngle: 0,
        jogLastAngle: 0,
        jogLastTime: performance.now(),
        jogCenter: new THREE.Vector3()
      };
      return;
    }
    if (control.kind === "jog") {
      this.callbacks.onJogStart?.(control.id);
      this.drag = {
        control,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startValue: 0,
        jogAngle: 0,
        jogLastAngle: 0,
        jogLastTime: performance.now(),
        jogCenter: this.jogWorldCenter(control)
      };
      return;
    }
  }

  private handleMove(e: PointerEvent): void {
    this.updateNDC(e);

    if (this.drag && this.drag.pointerId === e.pointerId) {
      this.applyDrag(e);
      return;
    }

    // Hover detection
    const control = this.pick();
    const id = control?.id ?? null;
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.callbacks.onHoverChange?.(id);
    }
  }

  private applyDrag(e: PointerEvent): void {
    if (!this.drag) return;
    const c = this.drag.control;
    if (c.kind === "rotary-bounded" || c.kind === "rotary-relative") {
      const dy = this.drag.startY - e.clientY;
      const delta = dy / KNOB_PIXELS_PER_FULL_TURN;
      if (c.kind === "rotary-bounded") {
        const t = THREE.MathUtils.clamp(this.drag.startValue + delta, 0, 1);
        this.callbacks.onControlValue?.(c.id, t);
      } else {
        this.callbacks.onControlValue?.(c.id, delta);
      }
      return;
    }
    if (c.kind === "linear") {
      const dy = this.drag.startY - e.clientY;
      const delta = dy / FADER_PIXELS_PER_FULL_TRAVEL;
      const t = THREE.MathUtils.clamp(this.drag.startValue + delta, 0, 1);
      this.callbacks.onControlValue?.(c.id, t);
      return;
    }
    if (c.kind === "crossfader") {
      const dx = e.clientX - this.drag.startX;
      const delta = (dx * 2) / FADER_PIXELS_PER_FULL_TRAVEL;
      const t = THREE.MathUtils.clamp(this.drag.startValue + delta, -1, 1);
      this.callbacks.onControlValue?.(c.id, t);
      return;
    }
    if (c.kind === "jog") {
      this.updateNDC(e);
      const angle = this.angleOnJog(this.drag.jogCenter, c);
      const prev = this.drag.jogLastAngle;
      let delta = angle - prev;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      const now = performance.now();
      const dt = Math.max(now - this.drag.jogLastTime, 1) / 1000;
      const velocity = delta / dt;
      this.drag.jogLastAngle = angle;
      this.drag.jogLastTime = now;
      this.drag.jogAngle += delta;
      this.callbacks.onJogMove?.(c.id, {
        deltaRadians: delta,
        velocity,
        direction: delta >= 0 ? 1 : -1
      });
      return;
    }
  }

  private handleUp(e: PointerEvent): void {
    if (this.drag && this.drag.pointerId === e.pointerId) {
      this.endDrag(this.drag);
      this.drag = null;
      try { this.dom.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  }

  private handleCancel(e: PointerEvent): void {
    if (this.drag && this.drag.pointerId === e.pointerId) {
      this.endDrag(this.drag);
      this.drag = null;
    }
  }

  private handleLostCapture(_e: PointerEvent): void {
    if (this.drag) {
      this.endDrag(this.drag);
      this.drag = null;
    }
  }

  private endDrag(d: DragSession): void {
    const c = d.control;
    if (c.kind === "button" || c.kind === "pad") {
      this.callbacks.onControlUp?.(c.id);
    } else if (c.kind === "jog") {
      this.callbacks.onJogEnd?.(c.id);
    }
  }

  private readBoundedNormalized(control: RuntimeControl): number {
    const range = (3 * Math.PI) / 2;
    const base = control.baseRotation?.y ?? 0;
    return THREE.MathUtils.clamp((control.object.rotation.y - base + range / 2) / range, 0, 1);
  }

  private readLinearNormalized(control: RuntimeControl): number {
    const min = control.travelMin ?? 0;
    const max = control.travelMax ?? 0;
    const axis = control.axis ?? (control.kind === "crossfader" ? "x" : "z");
    const cur = control.object.position[axis];
    const base = control.basePosition?.[axis] ?? 0;
    return THREE.MathUtils.clamp((cur - base - min) / (max - min), 0, 1);
  }

  private jogWorldCenter(control: RuntimeControl): THREE.Vector3 {
    control.object.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(control.object.matrixWorld);
  }

  private angleOnJog(center: THREE.Vector3, _control: RuntimeControl): number {
    // Cast a ray from the camera through the pointer and intersect the jog plane (Y = center.y).
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    const t = (center.y - origin.y) / dir.y;
    if (!isFinite(t) || t < 0) return this.drag?.jogLastAngle ?? 0;
    const hit = new THREE.Vector3().copy(origin).addScaledVector(dir, t);
    return Math.atan2(hit.x - center.x, hit.z - center.z);
  }
}
