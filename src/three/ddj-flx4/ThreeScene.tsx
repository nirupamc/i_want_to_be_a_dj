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
import type { DJEngineHandle } from "../../types";
import { applyForcedMaterialProbe, auditVisibleMaterials, calibrateControllerMaterials } from "./visualCalibration";
import { getControllerTheme, type ControllerThemeId } from "../../customization/controllerCustomization";
import { getJogPlaybackAngle, shouldManualOwnJogVisual } from "./jogPlaybackRotation";

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
  /** Hooks for debug HUD. */
  onDebugState?: (state: DebugState) => void;
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

export function ThreeScene({ interactive = true, engine, library, freeCamera = false, showDebug = false, themeId = 'default-dark', onDebugState }: ThreeSceneProps): JSX.Element {
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = theme.exposure;
    container.appendChild(renderer.domElement);
    canvasRef.current = renderer.domElement;

    scene.add(new THREE.HemisphereLight(0xf0f6ff, 0x0a0d12, 0.74));
    const key = new THREE.DirectionalLight(0xffffff, 2.35);
    key.position.set(-0.55, 1.55, -0.62);
    scene.add(key);
    const fill = new THREE.DirectionalLight(themeId === 'accent-neon' ? 0xffb16d : 0x9ec6ff, 0.82);
    fill.position.set(0.75, 0.9, 0.5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(new THREE.Color(theme.accent), 0.62);
    rim.position.set(0, 0.65, 1.1);
    scene.add(rim);

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
      hoveredVisualId: null
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
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, [engine, library, onDebugState, freeCamera, themeId]);

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
