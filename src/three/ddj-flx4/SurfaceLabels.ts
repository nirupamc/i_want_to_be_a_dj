// 3D-attached surface labels using troika-three-text for crisp SDF rendering
import * as THREE from 'three'
import { Text } from 'troika-three-text'
import { SURFACE_LABELS, type SurfaceLabelConfig } from './surfaceLabelConfig'

export interface SurfaceLabelsOptions {
  enabled: boolean
  controllerRoot: THREE.Object3D
}

export class SurfaceLabels {
  private enabled: boolean
  private controllerRoot: THREE.Object3D
  private labelMeshes: Map<string, Text> = new Map()

  constructor(options: SurfaceLabelsOptions) {
    this.enabled = options.enabled
    this.controllerRoot = options.controllerRoot

    if (this.enabled) {
      this.createLabels()
    }
  }

  private createLabels(): void {
    // No need to sort - all are equally important priority labels
    console.log(`[SurfaceLabels] Creating ${SURFACE_LABELS.length} labels...`)
    
    for (const config of SURFACE_LABELS) {
      // Hide the original GLB label if specified
      if (config.replacesGlbNode) {
        const originalLabel = this.controllerRoot.getObjectByName(config.replacesGlbNode)
        if (originalLabel) {
          originalLabel.visible = false
          console.log(`[SurfaceLabels] Hid original GLB label: ${config.replacesGlbNode}`)
        } else {
          console.warn(`[SurfaceLabels] Could not find GLB label to hide: ${config.replacesGlbNode}`)
        }
      }
      
      const label = this.createLabel(config)
      if (label) {
        this.labelMeshes.set(config.id, label)
        // Attach all labels directly to controller root with absolute positions
        this.controllerRoot.add(label)
        console.log(`[SurfaceLabels] Created ${config.id} at (${config.position.join(', ')})`)
      }
    }
    
    console.log(`[SurfaceLabels] Total labels created: ${this.labelMeshes.size}`)
  }

  private createLabel(config: SurfaceLabelConfig): Text | null {
    try {
      const text = new Text()
      
      // Text content and styling
      text.text = config.text
      text.fontSize = config.fontSize
      text.maxWidth = config.maxWidth
      text.textAlign = config.align
      text.anchorX = config.align
      text.anchorY = 'middle'
      
      // Font and rendering - hardware print style
      text.font = null // System font fallback
      text.fontWeight = 600
      text.letterSpacing = 0.005 // Very tight for hardware look
      
      // Color - subtle off-white, not glowing
      text.color = config.color
      
      // Minimal outline for antialiasing only
      text.outlineWidth = 0.0003
      text.outlineColor = '#000000'
      text.outlineOpacity = 0.3
      
      // Depth handling - avoid z-fighting
      text.depthOffset = -0.001
      text.renderOrder = 100
      
      // Position and rotation
      text.position.set(...config.position)
      text.rotation.set(...config.rotation)
      
      // Name for debugging
      text.name = `SurfaceLabel_${config.id}`
      
      // No shadows, no raycasting
      text.castShadow = false
      text.receiveShadow = false
      text.raycast = () => {}
      
      // Sync required for troika-three-text
      text.sync()
      
      return text
    } catch (error) {
      console.warn(`Failed to create surface label ${config.id}:`, error)
      return null
    }
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    
    this.enabled = enabled
    
    // Toggle visibility of all labels
    for (const label of this.labelMeshes.values()) {
      label.visible = enabled
    }
  }

  public dispose(): void {
    // Dispose all text meshes
    for (const text of this.labelMeshes.values()) {
      text.dispose()
      text.removeFromParent()
    }
    this.labelMeshes.clear()
  }

  public updateLabelVisibility(labelId: string, visible: boolean): void {
    const label = this.labelMeshes.get(labelId)
    if (label) {
      label.visible = visible
    }
  }

  public updateLabelText(labelId: string, text: string): void {
    const label = this.labelMeshes.get(labelId)
    if (label) {
      label.text = text
      label.sync()
    }
  }

  public getLabelIds(): string[] {
    return Array.from(this.labelMeshes.keys())
  }

  // Get stats for debugging
  public getStats(): { total: number; visible: number; bySection: Record<string, number> } {
    const bySection: Record<string, number> = {}
    let visible = 0
    
    for (const config of SURFACE_LABELS) {
      const label = this.labelMeshes.get(config.id)
      if (label?.visible) visible++
      bySection[config.section] = (bySection[config.section] || 0) + 1
    }
    
    return {
      total: this.labelMeshes.size,
      visible,
      bySection,
    }
  }
}

// Helper to create surface labels for a controller
export function createSurfaceLabels(
  controllerRoot: THREE.Object3D,
  enabled = true
): SurfaceLabels {
  return new SurfaceLabels({ controllerRoot, enabled })
}
