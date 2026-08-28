import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CAMERA_PADDING, createControllerPresentationRoot, fitCameraToController } from './presentation'

describe('DDJ-FLX4 presentation framing', () => {
  it('wraps the loaded GLB without mutating its transform', () => {
    const model = new THREE.Object3D()
    model.name = 'Loaded'
    model.position.set(1, 2, 3)
    model.rotation.set(0.1, 0.2, 0.3)
    const beforePosition = model.position.clone()
    const beforeRotation = model.rotation.clone()

    const root = createControllerPresentationRoot(model)

    expect(root.name).toBe('ControllerPresentationRoot')
    expect(root.children[0]).toBe(model)
    expect(model.position.equals(beforePosition)).toBe(true)
    expect(model.rotation.x).toBe(beforeRotation.x)
    expect(model.rotation.y).toBe(beforeRotation.y)
    expect(model.rotation.z).toBe(beforeRotation.z)
  })

  it('frames from the front side with front edge at screen bottom and X unmirrored', () => {
    const camera = new THREE.OrthographicCamera()
    const bounds = new THREE.Box3(
      new THREE.Vector3(-0.241, 0, -0.1364),
      new THREE.Vector3(0.241, 0.0728, 0.1364),
    )

    const result = fitCameraToController({
      camera,
      containerWidth: 1728,
      containerHeight: 736,
      bounds,
      padding: CAMERA_PADDING,
    })

    expect(result.size.x).toBeCloseTo(0.482, 3)
    expect(result.size.z).toBeCloseTo(0.2728, 3)
    expect(camera.position.z).toBeLessThan(result.center.z)
    expect(camera.up.toArray()).toEqual([0, 0, 1])
    expect(Math.abs(camera.right - camera.left)).toBeCloseTo(result.halfWidth * 2)
    expect(camera.top - camera.bottom).toBeCloseTo(result.halfHeight * 2)
  })
})
