import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildControlRegistry, type RuntimeControl } from "./controlRegistry";
import { resetAll, setControlHovered, setControlLit, setControlPressed } from "./controlVisuals";
import { InteractionController, type ExtraHitTarget, type InteractionCallbacks } from "./interaction";
import { ThreeToEngineDispatcher, type LibraryBridge } from "./dispatcher";
import { StateSync } from "./stateSync";
import { CONTROL_IDS } from "./controlIds";
import {
  CAMERA_PADDING,
  boxSummary,
  controllerModelUrl,
  countSceneNodes,
  createControllerPresentationRoot,
  fitCameraToController
} from "./presentation";
import type { DJEngineHandle, DJState } from "../../types";
import { applyForcedMaterialProbe, auditVisibleMaterials, calibrateControllerMaterials, applyMaterialDebug } from "./visualCalibration";
import { getControllerTheme, type ControllerThemeId } from "../../customization/controllerCustomization";
import { getJogPlaybackAngle, shouldManualOwnJogVisual } from "./jogPlaybackRotation";
import { createSurfaceLabels, type SurfaceLabels } from "./SurfaceLabels";

export interface ThreeSceneProps {
  /** When true the scene renders a "loading" label only — useful for tests. */
  interactive?: boolean;
  /** Engine handle to bind against. Required. */
  engine: DJEngineHandle;
  /** Library bridge for browse/load. */
  library: LibraryBridge;
  /** When true, the OrbitControls-style free camera is enabled (debug only). */
  freeCamera?: boolean;
  /** Shows raw IDs, event logs, and development controls. */
  showDebug?: boolean;
  themeId?: ControllerThemeId;
  onProjectionUpdate?: (projection: ControllerProjection) => void;
  onHoverControl?: (id: string | null) => void;
  /** Hooks for debug HUD. */
  onDebugState?: (state: DebugState) => void;
}

export interface ProjectedControlAnchor {
  id: string;
  x: number;
  y: number;
}

export interface ProjectedControllerBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ControllerProjection {
  controls: ProjectedControlAnchor[];
  bounds: ProjectedControllerBounds | null;
  canvas: {
    width: number;
    height: number;
  };
  renderer: {
    maxAnisotropy: number;
    devicePixelRatio: number;
  };
}

export interface DebugState {
  hoveredId: string | null;
  pressedId: string | null;
  draggingId: string | null;
  controlKind: string | null;
  normalized: number | null;
  jogDelta: number | null;
  jogVelocity: number | null;
  log: string[];
  unbound: string[];
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controller: InteractionController | null;
  dispatcher: ThreeToEngineDispatcher | null;
  stateSync: StateSync | null;
  controls: Record<string, RuntimeControl>;
  log: string[];
  modelBox: THREE.Box3 | null;
  jogVisuals: JogVisualRefs | null;
  hoveredVisualId: string | null;
  textureAudit: { maxAnisotropy: number };
  /** GLB meter segment meshes indexed [channelIndex 0|1][segmentIndex 0-7] */
  meterMeshes: Array<Array<THREE.Mesh>>;
  surfaceLabels: SurfaceLabels | null;
}

interface JogVisualTarget {
  object: THREE.Object3D;
  marker: THREE.Object3D | null;
  baseQuaternion: THREE.Quaternion;
  spinAxis: THREE.Vector3;
  spinQuaternion: THREE.Quaternion;
}

interface JogVisualRefs {
  left: JogVisualTarget | null;
  right: JogVisualTarget | null;
  proofSamples: JogPlaybackProofSample[];
}

interface JogPlaybackProofSample {
  deck: "left" | "right";
  position: number;
  computedAngle: number;
  rotationAfterUpdate: number;
  rotationBeforeRender: number;
  frame: number;
}

function appendLog(refs: SceneRefs, line: string, max = 30): void {
  refs.log.push(line);
  if (refs.log.length > max) refs.log.splice(0, refs.log.length - max);
}

function containerSize(container: HTMLElement): { w: number; h: number } {
  return {
    w: Math.max(Math.floor(container.clientWidth), 1),
    h: Math.max(Math.floor(container.clientHeight), 1)
  };
}

function frameModel(camera: THREE.OrthographicCamera, container: HTMLElement, box: THREE.Box3 | null): void {
  const targetBox = box ?? new THREE.Box3(new THREE.Vector3(-0.5, -0.05, -0.25), new THREE.Vector3(0.5, 0.08, 0.25));
  fitCameraToController({
    camera,
    containerWidth: container.clientWidth,
    containerHeight: container.clientHeight,
    bounds: targetBox,
    padding: CAMERA_PADDING
  });
}

function projectWorldToCanvas(point: THREE.Vector3, camera: THREE.Camera, container: HTMLElement): { x: number; y: number } {
  const projected = point.clone().project(camera);
  return {
    x: ((projected.x + 1) / 2) * container.clientWidth,
    y: ((1 - projected.y) / 2) * container.clientHeight
  };
}

function projectBoxToCanvas(box: THREE.Box3, camera: THREE.Camera, container: HTMLElement): ProjectedControllerBounds {
  const points: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        points.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  const projected = points.map((point) => projectWorldToCanvas(point, camera, container));
  const left = Math.max(0, Math.min(...projected.map((point) => point.x)));
  const top = Math.max(0, Math.min(...projected.map((point) => point.y)));
  const right = Math.min(container.clientWidth, Math.max(...projected.map((point) => point.x)));
  const bottom = Math.min(container.clientHeight, Math.max(...projected.map((point) => point.y)));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function makeProjection(refs: SceneRefs, container: HTMLElement): ControllerProjection {
  refs.scene.updateMatrixWorld(true);
  return {
    controls: Object.values(refs.controls).map((control) => {
      control.object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(control.hitTarget ?? control.object);
      return {
        id: control.id,
        ...projectWorldToCanvas(box.getCenter(new THREE.Vector3()), refs.camera, container)
      };
    }),
    bounds: refs.modelBox ? projectBoxToCanvas(refs.modelBox, refs.camera, container) : null,
    canvas: {
      width: container.clientWidth,
      height: container.clientHeight
    },
    renderer: {
      maxAnisotropy: refs.textureAudit.maxAnisotropy,
      devicePixelRatio: Math.min(window.devicePixelRatio, 2)
    }
  };
}

function tuneTextureQuality(root: THREE.Object3D, maxAnisotropy: number): void {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const material = (object as THREE.Mesh).material;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      const textured = entry as THREE.Material & {
        map?: THREE.Texture | null;
        emissiveMap?: THREE.Texture | null;
        normalMap?: THREE.Texture | null;
        roughnessMap?: THREE.Texture | null;
        metalnessMap?: THREE.Texture | null;
        aoMap?: THREE.Texture | null;
      };
      for (const texture of [textured.map, textured.emissiveMap, textured.normalMap, textured.roughnessMap, textured.metalnessMap, textured.aoMap]) {
        if (texture) textures.add(texture);
      }
    }
  });
  for (const texture of textures) {
    texture.anisotropy = Math.min(maxAnisotropy, 16);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
}

function createJogVisualTarget(model: THREE.Object3D, name: string): JogVisualTarget | null {
  const object = model.getObjectByName(name);
  if (!object) return null;
  return {
    object,
    marker: model.getObjectByName(name.replace("Visual", "RotationCue")) ?? null,
    baseQuaternion: object.quaternion.clone(),
    spinAxis: new THREE.Vector3(0, 1, 0),
    spinQuaternion: new THREE.Quaternion()
  };
}

function applyJogVisualSpin(target: JogVisualTarget, angle: number): void {
  target.spinQuaternion.setFromAxisAngle(target.spinAxis, angle);
  target.object.quaternion.copy(target.baseQuaternion).multiply(target.spinQuaternion);
}

function readJogVisualAngle(target: JogVisualTarget | null): number {
  return target?.object.rotation.y ?? 0;
}

function readJogMarkerWorldAngle(target: JogVisualTarget | null): number | null {
  if (!target?.marker) return null;
  target.object.updateWorldMatrix(true, true);
  const center = new THREE.Vector3().setFromMatrixPosition(target.object.matrixWorld);
  const marker = new THREE.Vector3().setFromMatrixPosition(target.marker.matrixWorld);
  return Math.atan2(marker.x - center.x, marker.z - center.z);
}

function pushProofSample(
  refs: SceneRefs,
  sample: Omit<JogPlaybackProofSample, "frame">,
  frame: number
): void {
  const visuals = refs.jogVisuals;
  if (!visuals) return;
  visuals.proofSamples.push({ ...sample, frame });
  if (visuals.proofSamples.length > 240) visuals.proofSamples.splice(0, visuals.proofSamples.length - 240);
}

function jogVisualForId(visuals: JogVisualRefs | null, id: string): JogVisualTarget | null {
  if (!visuals) return null;
  if (id === CONTROL_IDS.decks.left.jog || id === `${CONTROL_IDS.decks.left.jog}.rim`) return visuals.left;
  if (id === CONTROL_IDS.decks.right.jog || id === `${CONTROL_IDS.decks.right.jog}.rim`) return visuals.right;
  return null;
}

// ── Studio environment texture ─────────────────────────────────────────────
// Builds a minimal 64×32 equirectangular DataTexture simulating a neutral
// product-photography studio (soft white box + floor + warm key reflection).
// No network dependency. The PMREMGenerator converts this to an IBL cube map.
function buildStudioEnvTexture(): THREE.DataTexture {
  const W = 64, H = 32;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Map pixel to spherical coords
      const phi = (y / H) * Math.PI;           // 0..π (top to bottom)
      const theta = (x / W) * 2 * Math.PI;    // 0..2π
      const cosP = Math.cos(phi);
      // Sky dome: bright neutral overhead, warm key zone upper-left-front
      const isUpper = phi < Math.PI * 0.45;
      const isKeyZone = theta > Math.PI * 1.2 && theta < Math.PI * 1.7 && phi < Math.PI * 0.35;
      const isFrontFill = phi > Math.PI * 0.4 && phi < Math.PI * 0.65 && theta > Math.PI * 0.1 && theta < Math.PI * 0.9;
      const isFloor = phi > Math.PI * 0.72;
      let r = 18, g = 20, b = 26;  // dark ambient default
      if (isKeyZone) { r = 200; g = 188; b = 168; }   // warm key reflection zone
      else if (isUpper) { r = 90; g = 96; b = 108; }  // cool upper sky
      else if (isFrontFill) { r = 56; g = 66; b = 80; } // front fill zone
      else if (isFloor) { r = 8; g = 10; b = 14; }    // dark floor
      // Smooth with cosine of polar angle for continuity
      const blend = Math.max(0, Math.min(1, 0.5 + cosP * 0.3));
      r = Math.round(r * blend + 12 * (1 - blend));
      g = Math.round(g * blend + 14 * (1 - blend));
      b = Math.round(b * blend + 18 * (1 - blend));
      data[i]     = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ── Apply environment map to all mesh materials ───────────────────────────
function applyEnvMapToModel(root: THREE.Object3D, envMap: THREE.Texture): void {
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial;
      if (m.isMeshStandardMaterial) {
        m.envMap = envMap;
        m.envMapIntensity = m.metalness > 0.3 ? 1.35 : 0.70;
        m.needsUpdate = true;
      }
    }
  });
}

// ── GLB meter segment material init and update ────────────────────────────
const METER_COLORS_UNLIT = [0x1a2820, 0x1a2820, 0x1a2820, 0x1a2820, 0x1a2820, 0x1a2820, 0x252018, 0x2a1818] as const;
const METER_COLORS_LIT   = [0x00e060, 0x00e060, 0x00e060, 0x00e060, 0x20e040, 0x50cc20, 0xe0a000, 0xe03010] as const;

function initMeterSegmentMaterial(mesh: THREE.Mesh, segIndex: number): void {
  const mat = new THREE.MeshStandardMaterial({
    color: METER_COLORS_UNLIT[segIndex] ?? 0x1a2820,
    emissive: new THREE.Color(METER_COLORS_UNLIT[segIndex] ?? 0x1a2820),
    emissiveIntensity: 0.3,
    roughness: 0.55,
    metalness: 0.05,
    toneMapped: false,
  });
  mesh.material = mat;
  mesh.castShadow = false;
}

function updateMeterSegments(meterMeshes: Array<Array<THREE.Mesh>>, state: DJState): void {
  for (let ch = 0; ch < 2; ch++) {
    const level = state.mixer.channels[ch]?.meter ?? 0;
    const litCount = Math.round(level * 8);
    const segs = meterMeshes[ch];
    for (let seg = 0; seg < 8; seg++) {
      const mesh = segs[seg];
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (seg < litCount) {
        mat.color.setHex(METER_COLORS_LIT[seg] ?? 0x00e060);
        mat.emissive.setHex(METER_COLORS_LIT[seg] ?? 0x00e060);
        mat.emissiveIntensity = 1.4;
      } else {
        mat.color.setHex(METER_COLORS_UNLIT[seg] ?? 0x1a2820);
        mat.emissive.setHex(METER_COLORS_UNLIT[seg] ?? 0x1a2820);
        mat.emissiveIntensity = 0.3;
      }
    }
  }
}

export function ThreeScene({
  interactive = true,
  engine,
  library,
  freeCamera = false,
  showDebug = false,
  themeId = 'default-dark',
  onProjectionUpdate,
  onHoverControl,
  onDebugState
}: ThreeSceneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const refs = useRef<SceneRefs | null>(null);
  const showDebugRef = useRef(showDebug);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [debugState, setDebugState] = useState<DebugState>({
    hoveredId: null,
    pressedId: null,
    draggingId: null,
    controlKind: null,
    normalized: null,
    jogDelta: null,
    jogVelocity: null,
    log: [],
    unbound: []
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const theme = getControllerTheme(themeId);
    scene.background = new THREE.Color(themeId === 'accent-neon' ? 0x05070b : 0x06080b);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 10);
    frameModel(camera, container, null);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const initialSize = containerSize(container);
    renderer.setSize(initialSize.w, initialSize.h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // NeutralToneMapping preserves dark values better than ACES for black hardware.
    // ACES crushes values < 0.2 to near-black; Neutral maps more linearly in
    // the shadow range, so the controller's mid-dark plastic surfaces stay visible.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.7; // Neutral exposure for realistic look
    // Shadows: soft directional shadow from the key light gives depth cues
    // without heavy GPU cost. PCFSoft produces acceptable penumbra.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    canvasRef.current = renderer.domElement;

    // ── Build a synthetic studio environment map ──────────────────────────
    // This gives metallic/glossy surfaces something to reflect without any
    // network dependency. We paint an equirectangular image on a DataTexture
    // then process it through PMREMGenerator.
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envTexture = buildStudioEnvTexture();
    const envMap = pmrem.fromEquirectangular(envTexture).texture;
    pmrem.dispose();
    envTexture.dispose();
    scene.environment = envMap;
    // environmentIntensity available in Three.js r158+; guard with optional cast
    if ('environmentIntensity' in scene) (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.72;

    // ── Product photography lighting rig ─────────────────────────────────
    // Goal: premium dark hardware photographed in a controlled studio.
    // Key: broad soft source from upper-left-front (hits both top and front face)
    // Fill: weaker opposite side, prevents total shadow on right deck
    // Rim: back-right edge separation
    // Front-low: lifts pads/buttons/faders on the near face (-Z front)
    // Hemisphere: gentle sky/ground ambient, never too bright

    // Hemisphere — warm neutral sky, near-black ground
    scene.add(new THREE.HemisphereLight(0xe8eef6, 0x0a0c10, 1.0));

    // Key light — upper left, angled to hit both the top surface and the
    // front-facing controls. Position is relative to controller space where
    // Y is up, -Z is the front (pad/button) face.
    const key = new THREE.DirectionalLight(0xfff8f0, 3.6);
    key.position.set(-0.8, 1.4, 0.9);   // left, above, in front → illuminates top + near face
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.01;
    key.shadow.camera.far = 8;
    key.shadow.camera.left = -0.8;
    key.shadow.camera.right = 0.8;
    key.shadow.camera.top = 0.5;
    key.shadow.camera.bottom = -0.5;
    key.shadow.bias = -0.001;
    key.shadow.radius = 3;  // soft penumbra
    scene.add(key);

    // Fill — right side, weaker, cool-tinted
    const fill = new THREE.DirectionalLight(0xa8c4e0, 0.82);
    fill.position.set(1.0, 0.8, 0.4);
    scene.add(fill);

    // Rim — back-right, creates edge separation on jog rims and chassis edges
    const rim = new THREE.DirectionalLight(new THREE.Color(theme.accent).lerp(new THREE.Color(0xc0d4e8), 0.6), 1.0);
    rim.position.set(0.5, 0.6, -1.2);   // behind and to the right
    scene.add(rim);

    // Front-low — lifts the near face where pads/faders/buttons live.
    // This is the light that was missing in Pass 2.
    const frontLow = new THREE.DirectionalLight(0xd8e8f4, 1.08);
    frontLow.position.set(0.0, 0.2, 2.0);  // almost directly in front, slightly below camera
    scene.add(frontLow);

    // Front-center soft overhead — supplements key on the mixer center strip
    const topCenter = new THREE.DirectionalLight(0xfaf8f4, 1.45);
    topCenter.position.set(0.0, 2.0, 0.2);  // directly above, slight forward tilt
    scene.add(topCenter);

    const refsLocal: SceneRefs = {
      renderer,
      scene,
      camera,
      controller: null,
      dispatcher: null,
      stateSync: null,
      controls: {},
      log: [],
      modelBox: null,
      jogVisuals: null,
      hoveredVisualId: null,
      textureAudit: { maxAnisotropy: renderer.capabilities.getMaxAnisotropy() },
      meterMeshes: [[], []],
      surfaceLabels: null,
    };
    refs.current = refsLocal;

    const loader = new GLTFLoader();
    const glbUrl = controllerModelUrl();
    loader.load(
      glbUrl,
      (gltf) => {
        const model = gltf.scene;
        const sourceRootName = model.name;
        const distinctiveNames = [
          "ControllerRoot",
          "LeftPlayPause",
          "RightPlayPause",
          "LeftPad01",
          "RightPad01",
          "Mixer",
          "Crossfader"
        ].filter((name) => model.getObjectByName(name) !== undefined);
        const materials = new Set<THREE.Material>();
        model.traverse((object) => {
          if (!(object as THREE.Mesh).isMesh) return;
          const material = (object as THREE.Mesh).material;
          if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
          else if (material) materials.add(material);
        });
        const loadedNodeCount = countSceneNodes(model);
        const originalMaterials = import.meta.env.DEV && new URLSearchParams(window.location.search).get("materialMode") === "original";
        const materialCalibration = calibrateControllerMaterials(model, !originalMaterials, themeId);
        const materialProbe = import.meta.env.DEV && new URLSearchParams(window.location.search).get("materialProbe") === "forced";
        if (materialProbe) applyForcedMaterialProbe(model);
        const materialDebug = import.meta.env.DEV && new URLSearchParams(window.location.search).get("materialDebug") === "forced";
        if (materialDebug) applyMaterialDebug(model);
        tuneTextureQuality(model, renderer.capabilities.getMaxAnisotropy());
        // Propagate environment map to all materials that can use it
        applyEnvMapToModel(model, envMap);
        model.name = "DDJ_FLX4_LoadedRoot";
        const presentationRoot = createControllerPresentationRoot(model);
        scene.add(presentationRoot);
        presentationRoot.updateMatrixWorld(true);
        const modelBox = new THREE.Box3().setFromObject(presentationRoot);
        refsLocal.modelBox = modelBox;
        frameModel(camera, container, modelBox);
        const { controls } = buildControlRegistry(model);
        refsLocal.controls = controls;
        resetAll(Object.values(controls));

        // ── Wire GLB meter segment meshes ──────────────────────────────────
        // StaticLevelMeter_-4_{0-7} = Channel A (left deck)
        // StaticLevelMeter_4_{0-7}  = Channel B (right deck)
        const meterSegments: Array<Array<THREE.Mesh>> = [[], []];
        for (let seg = 0; seg < 8; seg++) {
          const meshA = model.getObjectByName(`StaticLevelMeter_-4_${seg}`) as THREE.Mesh | undefined;
          const meshB = model.getObjectByName(`StaticLevelMeter_4_${seg}`) as THREE.Mesh | undefined;
          if (meshA?.isMesh) {
            meterSegments[0][seg] = meshA;
            initMeterSegmentMaterial(meshA, seg);
          }
          if (meshB?.isMesh) {
            meterSegments[1][seg] = meshB;
            initMeterSegmentMaterial(meshB, seg);
          }
        }
        refsLocal.meterMeshes = meterSegments;

        // ── Initialize 3D surface labels ──────────────────────────────────
        // Crisp SDF text labels attached directly to controller geometry
        const surfaceLabelsEnabled = !new URLSearchParams(window.location.search).has('noSurfaceLabels')
        refsLocal.surfaceLabels = createSurfaceLabels(model, surfaceLabelsEnabled)

        refsLocal.jogVisuals = {
          left: createJogVisualTarget(model, "LeftJogWheelVisual"),
          right: createJogVisualTarget(model, "RightJogWheelVisual"),
          proofSamples: []
        };
        if (import.meta.env.DEV) {
          (globalThis as typeof globalThis & { __DDJ_FLX4_JOG_PLAYBACK_SAMPLES__?: unknown }).__DDJ_FLX4_JOG_PLAYBACK_SAMPLES__ = refsLocal.jogVisuals.proofSamples;
          (globalThis as typeof globalThis & { __DDJ_FLX4_JOG_VISUAL_TARGETS__?: unknown }).__DDJ_FLX4_JOG_VISUAL_TARGETS__ = {
            left: refsLocal.jogVisuals.left?.object.name ?? null,
            right: refsLocal.jogVisuals.right?.object.name ?? null,
            leftMarker: refsLocal.jogVisuals.left?.marker?.name ?? null,
            rightMarker: refsLocal.jogVisuals.right?.marker?.name ?? null,
            axis: "local-y"
          };
          (globalThis as typeof globalThis & { __DDJ_FLX4_READ_JOG_VISUALS__?: unknown }).__DDJ_FLX4_READ_JOG_VISUALS__ = () => {
            const state = engine.getState();
            return {
              left: {
                position: state.decks[0].position,
                playing: state.decks[0].isPlaying,
                touchingPlatter: state.decks[0].jog.touchingPlatter,
                touchingRim: state.decks[0].jog.touchingRim,
                scratching: state.decks[0].scratch.active,
                computedAngle: getJogPlaybackAngle(state.decks[0].position),
                visualRotationY: readJogVisualAngle(refsLocal.jogVisuals?.left ?? null),
                markerWorldAngle: readJogMarkerWorldAngle(refsLocal.jogVisuals?.left ?? null)
              },
              right: {
                position: state.decks[1].position,
                playing: state.decks[1].isPlaying,
                touchingPlatter: state.decks[1].jog.touchingPlatter,
                touchingRim: state.decks[1].jog.touchingRim,
                scratching: state.decks[1].scratch.active,
                computedAngle: getJogPlaybackAngle(state.decks[1].position),
                visualRotationY: readJogVisualAngle(refsLocal.jogVisuals?.right ?? null),
                markerWorldAngle: readJogMarkerWorldAngle(refsLocal.jogVisuals?.right ?? null)
              }
            };
          };
        }

        const dispatcher = new ThreeToEngineDispatcher(engine, library);
        refsLocal.dispatcher = dispatcher;

        const stateSync = new StateSync({ controls, dispatcher });
        refsLocal.stateSync = stateSync;
        stateSync.start();

        // Push the initial engine state to the 3D visuals.
        stateSync.applyState(engine.getState());

        // Build extra hit targets for the jog rims. We size them using
        // the visible jog bounding-sphere radius.
        const extraHits: ExtraHitTarget[] = [];
        for (const side of ["left", "right"] as const) {
          const rimId = `${side === "left" ? CONTROL_IDS.decks.left.jog : CONTROL_IDS.decks.right.jog}.rim`;
          const jogCtl = controls[side === "left" ? CONTROL_IDS.decks.left.jog : CONTROL_IDS.decks.right.jog];
          if (!jogCtl) continue;
          jogCtl.object.updateWorldMatrix(true, false);
          const box = new THREE.Box3().setFromObject(jogCtl.object);
          const center = new THREE.Vector3();
          box.getCenter(center);
          const size = new THREE.Vector3();
          box.getSize(size);
          const radius = Math.max(size.x, size.z) * 0.5;
          const innerRadius = radius * 0.55;
          // Convert to local space relative to jog pivot.
          const localCenter = center.clone().applyMatrix4(new THREE.Matrix4().copy(jogCtl.object.matrixWorld).invert());
          extraHits.push({ controlId: rimId, center: localCenter, radius, innerRadius });
        }

        const callbacks: InteractionCallbacks = {
          onControlDown: (id) => {
            const c = controls[id];
            if (c) setControlPressed(c, true);
            dispatcher.onDown(c!);
            appendLog(refsLocal, `DOWN ${id}`);
            pushDebug({ pressedId: id, draggingId: id });
          },
          onControlUp: (id) => {
            const c = controls[id];
            if (c) setControlPressed(c, false);
            dispatcher.onUp(c!);
            appendLog(refsLocal, `UP   ${id}`);
            pushDebug({ pressedId: null, draggingId: null });
          },
          onControlValue: (id, value) => {
            const c = controls[id];
            if (!c) return;
            // Direct visual update for rotary-relative encoders (browse).
            if (c.kind === "rotary-relative") {
              c.object.rotation.y += value;
            }
            dispatcher.onValue(c, value);
            appendLog(refsLocal, `VAL  ${id} = ${value.toFixed(3)}`);
            pushDebug({ draggingId: id, normalized: value });
          },
          onJogStart: (id) => {
            const c = controls[id];
            if (c) dispatcher.onJogStart(c);
            appendLog(refsLocal, `JOG+ ${id}`);
            pushDebug({ draggingId: id });
          },
          onJogMove: (id, info) => {
            const c = controls[id];
            if (c) {
              const visual = jogVisualForId(refsLocal.jogVisuals, id);
              if (visual) visual.object.rotateOnAxis(visual.spinAxis, info.deltaRadians);
              dispatcher.onJogMove(c, info);
            }
            appendLog(refsLocal, `JOG  ${id} d=${info.deltaRadians.toFixed(3)} v=${info.velocity.toFixed(2)}`);
            pushDebug({ jogDelta: info.deltaRadians, jogVelocity: info.velocity });
          },
          onJogEnd: (id) => {
            const c = controls[id];
            if (c) dispatcher.onJogEnd(c);
            appendLog(refsLocal, `JOG- ${id}`);
            pushDebug({ draggingId: null, jogDelta: null, jogVelocity: null });
          },
          onHoverChange: (id) => {
            refsLocal.controller?.setHoveredControl(id);
            if (refsLocal.hoveredVisualId && refsLocal.hoveredVisualId !== id) {
              const previous = controls[refsLocal.hoveredVisualId];
              if (previous) setControlHovered(previous, false);
            }
            if (id && refsLocal.hoveredVisualId !== id) {
              const next = controls[id];
              if (next) setControlHovered(next, true);
            }
            refsLocal.hoveredVisualId = id;
            pushDebug({ hoveredId: id, controlKind: id ? controls[id]?.kind ?? null : null });
            onHoverControl?.(id);
          }
        };

        const controller = new InteractionController({
          dom: renderer.domElement,
          camera,
          scene,
          controls,
          callbacks,
          extraHits
        });
        controller.attach();
        refsLocal.controller = controller;
        controller.setDebugVisualization(showDebugRef.current);
        pushDebug({ unbound: dispatcher.adapter.listUnbound() });
        if (import.meta.env.DEV) {
          const size = containerSize(container);
          const hitDiagnostics = controller.getHitboxDiagnostics();
          const projectedControls = [
            CONTROL_IDS.decks.left.play,
            CONTROL_IDS.decks.left.cue,
            CONTROL_IDS.decks.left.pads[0],
            CONTROL_IDS.decks.left.tempo,
            CONTROL_IDS.decks.left.jog,
            CONTROL_IDS.decks.right.play,
            CONTROL_IDS.decks.right.cue,
            CONTROL_IDS.decks.right.pads[0],
            CONTROL_IDS.decks.right.tempo,
            CONTROL_IDS.decks.right.jog,
            CONTROL_IDS.mixer.channel1.trim,
            CONTROL_IDS.mixer.channel1.eqHigh,
            CONTROL_IDS.mixer.channel1.fader,
            CONTROL_IDS.mixer.crossfader,
            CONTROL_IDS.browse.encoder,
            CONTROL_IDS.fx.levelDepth,
          ].map((id) => {
            const control = controls[id];
            const world = new THREE.Vector3();
            const diagnostic = hitDiagnostics.find((entry) => entry.id === id);
            diagnostic?.hitboxWorldBox.getCenter(world);
            if (!diagnostic) control?.object.getWorldPosition(world);
            const projected = world.clone().project(camera);
            return {
              id,
              x: Math.round(((projected.x + 1) / 2) * size.w),
              y: Math.round(((1 - projected.y) / 2) * size.h),
            };
          });
          const modelLoaded = {
            url: glbUrl,
            version: new URL(glbUrl, window.location.href).searchParams.get("v"),
            sourceRootName,
            loadedRootName: model.name,
            presentationRootName: presentationRoot.name,
            nodeCount: loadedNodeCount,
            materialCount: materials.size,
            renderer: {
              outputColorSpace: renderer.outputColorSpace,
              toneMapping: renderer.toneMapping,
              toneMappingExposure: renderer.toneMappingExposure,
              maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
              antialias: true,
              shadows: renderer.shadowMap.enabled
            },
            lighting: { hemisphere: 0.74, key: 2.35, fill: 0.82, rim: 0.62 },
            themeId,
            materialRoles: materialCalibration.roleCounts,
            materialMode: originalMaterials ? "original" : "calibrated",
            materialCoverage: {
              total: materialCalibration.materialCount,
              classified: materialCalibration.classifiedMaterialCount,
              unclassified: materialCalibration.materialCount - materialCalibration.classifiedMaterialCount
            },
            materialAudit: materialCalibration.audit,
            visibleMaterialAudit: auditVisibleMaterials(model, [
              "Trim1TopCap", "Trim1OrientationMarker", "High1TopCap", "ChannelFader1HandleBody",
              "CrossfaderHandleBody", "LeftJogWheelOuterRim", "LeftPad01Top", "LeftPlayPauseTop", "Trim1PanelLabel"
            ]),
            materialProbe: materialProbe ? "forced" : "none",
            distinctiveNames,
            modelPosition: model.position.toArray(),
            modelRotation: model.rotation.toArray(),
            modelQuaternion: model.quaternion.toArray(),
            bounds: boxSummary(modelBox),
            container: size,
            canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
            devicePixelRatio: Math.min(window.devicePixelRatio, 2),
            controlCount: Object.keys(controls).length,
            projectedControls: JSON.stringify(projectedControls)
          };
          console.info(`[DDJ-FLX4] MODEL_LOADED ${JSON.stringify(modelLoaded)}`);
          const canvasRect = renderer.domElement.getBoundingClientRect();
          const runtimeDiagnostics = hitDiagnostics.map((diagnostic) => ({
            id: diagnostic.id,
            targetName: diagnostic.targetName,
            parentName: diagnostic.parentName,
            hitboxUuid: diagnostic.hitboxUuid,
            visualWorldBox: boxSummary(diagnostic.visualWorldBox),
            hitboxWorldBox: boxSummary(diagnostic.hitboxWorldBox),
            overlapRatio: diagnostic.overlapRatio
          }));
          (globalThis as typeof globalThis & { __DDJ_FLX4_HITBOX_DIAGNOSTICS__?: unknown }).__DDJ_FLX4_HITBOX_DIAGNOSTICS__ = runtimeDiagnostics;
          (globalThis as typeof globalThis & { __DDJ_FLX4_CONTROL_PROBES__?: unknown }).__DDJ_FLX4_CONTROL_PROBES__ = projectedControls.map((probe) => ({
            ...probe,
            x: Math.round(probe.x + canvasRect.left),
            y: Math.round(probe.y + canvasRect.top)
          }));
          const selectedIds = [
            CONTROL_IDS.decks.left.play,
            CONTROL_IDS.decks.left.cue,
            CONTROL_IDS.decks.left.pads[0],
            CONTROL_IDS.decks.left.tempo,
            CONTROL_IDS.decks.left.jog,
            CONTROL_IDS.decks.right.play,
            CONTROL_IDS.decks.right.cue,
            CONTROL_IDS.decks.right.pads[0],
            CONTROL_IDS.decks.right.tempo,
            CONTROL_IDS.decks.right.jog,
            CONTROL_IDS.mixer.channel1.trim,
            CONTROL_IDS.mixer.crossfader,
            CONTROL_IDS.mixer.channel1.eqHigh,
            CONTROL_IDS.mixer.channel1.fader,
            CONTROL_IDS.browse.encoder,
            CONTROL_IDS.fx.levelDepth
          ];
          const selectedTargets = hitDiagnostics.filter((diagnostic) => selectedIds.includes(diagnostic.id));
          console.info(`[DDJ-FLX4] control probe ${JSON.stringify({
            count: Object.keys(controls).length,
            raycastTargetCount: controller.getRaycastTargets().length,
            worstOverlapRatio: Math.min(...hitDiagnostics.map((diagnostic) => diagnostic.overlapRatio)),
            selectedTargets: selectedTargets.map((target) => ({ id: target.id, uuid: target.hitboxUuid, targetName: target.targetName, parentName: target.parentName }))
          })}`);
        }
        onProjectionUpdate?.(makeProjection(refsLocal, container));
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error("Failed to load GLB", err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    );

    function pushDebug(patch: Partial<DebugState>): void {
      setDebugState((prev) => {
        const merged = { ...prev, ...patch };
        merged.log = refsLocal.log.slice(-6);
        if (onDebugState) onDebugState(merged);
        return merged;
      });
    }

    const resizeScene = (): void => {
      const { w, h } = containerSize(container);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      frameModel(camera, container, refsLocal.modelBox);
      onProjectionUpdate?.(makeProjection(refsLocal, container));
    };
    const resizeObserver = new ResizeObserver(resizeScene);
    resizeObserver.observe(container);
    window.addEventListener("resize", resizeScene);
    document.addEventListener("fullscreenchange", resizeScene);

    let frame = 0;
    const updateJogPlaybackVisuals = (): void => {
      const visuals = refsLocal.jogVisuals;
      if (!visuals) return;
      const state = engine.getState();
      for (const deckIndex of [0, 1] as const) {
        const deck = state.decks[deckIndex];
        const visual = deckIndex === 0 ? visuals.left : visuals.right;
        if (!visual) continue;
        const manuallyOwned = shouldManualOwnJogVisual({
          touchingPlatter: deck.jog.touchingPlatter,
          touchingRim: deck.jog.touchingRim,
          scratching: deck.scratch.active
        });
        if (manuallyOwned) continue;
        const computedAngle = getJogPlaybackAngle(deck.position);
        applyJogVisualSpin(visual, computedAngle);
        if (import.meta.env.DEV) {
          const rotationAfterUpdate = readJogVisualAngle(visual);
          pushProofSample(
            refsLocal,
            {
              deck: deckIndex === 0 ? "left" : "right",
              position: deck.position,
              computedAngle,
              rotationAfterUpdate,
              rotationBeforeRender: readJogVisualAngle(visual)
            },
            frame
          );
        }
      }
    };

    const tick = (): void => {
      frame += 1;
      updateJogPlaybackVisuals();
      // Update GLB meter segments from real channel peak data
      updateMeterSegments(refsLocal.meterMeshes, engine.getState());
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeScene);
      document.removeEventListener("fullscreenchange", resizeScene);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (refsLocal.hoveredVisualId) {
        const hovered = refsLocal.controls[refsLocal.hoveredVisualId];
        if (hovered) setControlHovered(hovered, false);
      }
      refsLocal.controller?.releaseDrag();
      refsLocal.controller?.detach();
      refsLocal.stateSync?.stop();
      refsLocal.surfaceLabels?.dispose();
      renderer.dispose();
      envMap.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, [engine, library, onDebugState, onHoverControl, onProjectionUpdate, freeCamera, themeId]);

  useEffect(() => {
    showDebugRef.current = showDebug;
    refs.current?.controller?.setDebugVisualization(showDebug);
  }, [showDebug]);

  return (
    <div className="three-scene-wrapper">
      <div ref={containerRef} className="three-scene-canvas" data-testid="three-canvas" />
      {loading && <div className="three-scene-status">Loading GLB…</div>}
      {error && <div className="three-scene-status error">GLB load error: {error}</div>}
      {interactive && showDebug && !loading && !error && (
        <DebugOverlay state={debugState} controls={refs.current?.controls ?? null} />
      )}
    </div>
  );
}

function DebugOverlay({ state, controls }: { state: DebugState; controls: Record<string, RuntimeControl> | null }): JSX.Element {
  return (
    <div className="three-debug-overlay" data-testid="three-debug">
      <div className="three-debug-line">
        <span className="lbl">hover</span>
        <span className="val">{state.hoveredId ?? "—"}</span>
      </div>
      <div className="three-debug-line">
        <span className="lbl">pressed</span>
        <span className="val">{state.pressedId ?? "—"}</span>
      </div>
      <div className="three-debug-line">
        <span className="lbl">dragging</span>
        <span className="val">{state.draggingId ?? "—"}</span>
      </div>
      <div className="three-debug-line">
        <span className="lbl">kind</span>
        <span className="val">{state.controlKind ?? "—"}</span>
      </div>
      <div className="three-debug-line">
        <span className="lbl">value</span>
        <span className="val">{state.normalized != null ? state.normalized.toFixed(3) : "—"}</span>
      </div>
      <div className="three-debug-line">
        <span className="lbl">jog d/v</span>
        <span className="val">
          {state.jogDelta != null ? state.jogDelta.toFixed(3) : "—"} / {state.jogVelocity != null ? state.jogVelocity.toFixed(2) : "—"}
        </span>
      </div>
      {state.unbound.length > 0 && (
        <div className="three-debug-unbound">
          <div className="lbl">unbound ({state.unbound.length}):</div>
          {state.unbound.slice(0, 6).map((id) => <div key={id} className="unbound-id">{id}</div>)}
        </div>
      )}
      <div className="three-debug-log">
        {state.log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      <div className="three-debug-actions">
        <button
          onClick={() => {
            if (!controls) return;
            for (const c of Object.values(controls)) if (c.kind === "pad") setControlLit(c, true);
          }}
        >Light all pads</button>
        <button
          onClick={() => {
            if (!controls) return;
            for (const c of Object.values(controls)) if (c.kind === "pad") setControlLit(c, false);
          }}
        >Unlight pads</button>
        <button
          onClick={() => {
            if (!controls) return;
            resetAll(Object.values(controls));
          }}
        >Reset pose</button>
      </div>
    </div>
  );
}
