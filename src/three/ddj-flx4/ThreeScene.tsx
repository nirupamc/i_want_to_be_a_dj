import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildControlRegistry, type RuntimeControl } from "./controlRegistry";
import { resetAll, setControlLit, setControlPressed } from "./controlVisuals";
import { InteractionController, type ExtraHitTarget, type InteractionCallbacks } from "./interaction";
import { ThreeToEngineDispatcher, type LibraryBridge } from "./dispatcher";
import { StateSync } from "./stateSync";
import { CONTROL_IDS } from "./controlIds";
import type { DJEngineHandle } from "../../types";

export interface ThreeSceneProps {
  /** When true the scene renders a "loading" label only — useful for tests. */
  interactive?: boolean;
  /** Engine handle to bind against. Required. */
  engine: DJEngineHandle;
  /** Library bridge for browse/load. */
  library: LibraryBridge;
  /** When true, the OrbitControls-style free camera is enabled (debug only). */
  freeCamera?: boolean;
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
  camera: THREE.PerspectiveCamera;
  controller: InteractionController | null;
  dispatcher: ThreeToEngineDispatcher | null;
  stateSync: StateSync | null;
  controls: Record<string, RuntimeControl>;
  log: string[];
}

const GLB_URL = "/models/ddj-flx4/ddj-flx4-controller.glb";

function appendLog(refs: SceneRefs, line: string, max = 30): void {
  refs.log.push(line);
  if (refs.log.length > max) refs.log.splice(0, refs.log.length - max);
}

export function ThreeScene({ interactive = true, engine, library, freeCamera = false, onDebugState }: ThreeSceneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const refs = useRef<SceneRefs | null>(null);
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
    scene.background = new THREE.Color(0x111418);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.01, 50);
    camera.position.set(0, 0.55, 0.9);
    camera.lookAt(0, 0.06, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, Math.max(container.clientHeight, 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    canvasRef.current = renderer.domElement;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x202028, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(0.3, 0.6, 0.4);
    scene.add(key);

    const refsLocal: SceneRefs = {
      renderer,
      scene,
      camera,
      controller: null,
      dispatcher: null,
      stateSync: null,
      controls: {},
      log: []
    };
    refs.current = refsLocal;

    const loader = new GLTFLoader();
    loader.load(
      GLB_URL,
      (gltf) => {
        const model = gltf.scene;
        model.name = "DDJ_FLX4_LoadedRoot";
        scene.add(model);
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
        pushDebug({ unbound: dispatcher.adapter.listUnbound() });
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

    const onResize = (): void => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const tick = (): void => {
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      refsLocal.controller?.releaseDrag();
      refsLocal.controller?.detach();
      refsLocal.stateSync?.stop();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, [engine, library, onDebugState, freeCamera]);

  return (
    <div className="three-scene-wrapper">
      <div ref={containerRef} className="three-scene-canvas" data-testid="three-canvas" />
      {loading && <div className="three-scene-status">Loading GLB…</div>}
      {error && <div className="three-scene-status error">GLB load error: {error}</div>}
      {interactive && !loading && !error && (
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
