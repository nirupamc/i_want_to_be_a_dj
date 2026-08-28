import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildControlRegistry, type RuntimeControl } from "./controlRegistry";
import { resetAll, setControlLit, setControlPressed } from "./controlVisuals";
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
import { calibrateControllerMaterials } from "./visualCalibration";

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

export function ThreeScene({ interactive = true, engine, library, freeCamera = false, showDebug = false, onDebugState }: ThreeSceneProps): JSX.Element {
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
    scene.background = new THREE.Color(0x050607);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 10);
    frameModel(camera, container, null);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const initialSize = containerSize(container);
    renderer.setSize(initialSize.w, initialSize.h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);
    canvasRef.current = renderer.domElement;

    scene.add(new THREE.HemisphereLight(0xdce7f5, 0x0b0d11, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-0.45, 1.35, -0.55);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ebeff, 0.58);
    fill.position.set(0.75, 0.9, 0.5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9b0, 0.32);
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
      modelBox: null
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
        const materialCalibration = calibrateControllerMaterials(model);
        model.name = "DDJ_FLX4_LoadedRoot";
        const presentationRoot = createControllerPresentationRoot(model);
        scene.add(presentationRoot);
        const modelBox = new THREE.Box3().setFromObject(presentationRoot);
        refsLocal.modelBox = modelBox;
        frameModel(camera, container, modelBox);
        const { controls } = buildControlRegistry(model);
        refsLocal.controls = controls;
        resetAll(Object.values(controls));

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
              c.object.rotation.y += info.deltaRadians;
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
            lighting: { hemisphere: 0.55, key: 1.8, fill: 0.58, rim: 0.32 },
            materialRoles: materialCalibration.roleCounts,
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

    const tick = (): void => {
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeScene);
      document.removeEventListener("fullscreenchange", resizeScene);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      refsLocal.controller?.releaseDrag();
      refsLocal.controller?.detach();
      refsLocal.stateSync?.stop();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, [engine, library, onDebugState, freeCamera]);

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
