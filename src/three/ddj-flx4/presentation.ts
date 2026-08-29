import * as THREE from 'three'
import { CONTROLLER_MODEL_VERSION } from './controllerModelVersion'

export const CONTROLLER_GLB_PATH = '/models/ddj-flx4/ddj-flx4-controller.glb'
export const CAMERA_PADDING = 1.05
/** The authored GLB already has left deck at -X and front controls at -Z. */
export const CONTROLLER_FRONT_AXIS = '-z'

export interface CameraFitInput {
  camera: THREE.OrthographicCamera
  containerWidth: number
  containerHeight: number
  bounds: THREE.Box3
  padding: number
}

export interface CameraFitResult {
  center: THREE.Vector3
  size: THREE.Vector3
  halfWidth: number
  halfHeight: number
}

export function controllerModelUrl(): string {
  if (!import.meta.env.DEV) return CONTROLLER_GLB_PATH
  const version = encodeURIComponent(String(import.meta.env.VITE_CONTROLLER_GLB_VERSION ?? CONTROLLER_MODEL_VERSION))
  return `${CONTROLLER_GLB_PATH}?v=${version}`
}

export function createControllerPresentationRoot(model: THREE.Object3D): THREE.Group {
  const root = new THREE.Group()
  root.name = 'ControllerPresentationRoot'
  root.add(model)
  return root
}

export function fitCameraToController({
  camera,
  containerWidth,
  containerHeight,
  bounds,
  padding,
}: CameraFitInput): CameraFitResult {
  const w = Math.max(Math.floor(containerWidth), 1)
  const h = Math.max(Math.floor(containerHeight), 1)
  const aspect = w / h
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const width = Math.max(size.x, 0.1)
  const depth = Math.max(size.z, 0.1)
  const maxDim = Math.max(width, depth)
  const halfHeight = Math.max(depth * 0.5, (width / aspect) * 0.5) * padding
  const halfWidth = halfHeight * aspect
  const viewCenter = center.clone()
  viewCenter.z += depth * 0.02

  // Positive Z is screen-up with the authored front at -Z. Reverse the
  // orthographic horizontal frustum so -X remains screen-left with that
  // camera basis; the GLB itself is never mirrored.
  camera.left = halfWidth
  camera.right = -halfWidth
  camera.top = halfHeight
  camera.bottom = -halfHeight
  camera.near = 0.001
  camera.far = Math.max(10, maxDim * 8)
  camera.position.set(viewCenter.x, center.y + maxDim * 2.4, viewCenter.z - maxDim * 0.16)
  // The GLB is viewed from its authored front (-Z). Positive Z is screen-up,
  // so the play/cue/pad side (-Z) remains at the bottom without mirroring X.
  camera.up.set(0, 0, 1)
  camera.lookAt(viewCenter)
  camera.updateProjectionMatrix()

  return { center, size, halfWidth, halfHeight }
}

export function countSceneNodes(root: THREE.Object3D): number {
  let count = 0
  root.traverse(() => {
    count += 1
  })
  return count
}

export function boxSummary(box: THREE.Box3): { min: number[]; max: number[]; size: number[]; center: number[] } {
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: size.toArray(),
    center: center.toArray(),
  }
}
