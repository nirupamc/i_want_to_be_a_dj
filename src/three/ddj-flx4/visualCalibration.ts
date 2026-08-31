import * as THREE from 'three'
import { getControllerTheme, type ControllerThemeId } from '../../customization/controllerCustomization'

export type ControllerMaterialRole =
  | 'chassis'
  | 'jog-ring'
  | 'knob-body'
  | 'knob-indicator'
  | 'fader-cap'
  | 'fader-rail'
  | 'button-body'
  | 'button-label'
  | 'panel-label'
  | 'pad'
  | 'led'
  | 'metal-accent'

type ColorMaterial = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; roughness?: number; metalness?: number }

export interface MaterialCalibrationAudit {
  material: string
  role: ControllerMaterialRole
  meshCount: number
  assignedMeshCount: number
  calibrated: boolean
  originalColor: number[] | null
  finalColor: number[] | null
  originalRoughness: number | null
  finalRoughness: number | null
  originalMetalness: number | null
  finalMetalness: number | null
}

export interface MaterialCalibrationResult {
  materialCount: number
  classifiedMaterialCount: number
  roleCounts: Record<ControllerMaterialRole, number>
  audit: MaterialCalibrationAudit[]
}

export interface VisibleMaterialAudit {
  object: string
  material: string
  uuid: string
  color: number[] | null
  roughness: number | null
  metalness: number | null
  map: boolean
  mapUuid: string | null
  mapDimensions: { width: number; height: number } | null
  emissive: number[] | null
  opacity: number
  transparent: boolean
}

function roleForName(name: string): ControllerMaterialRole {
  const value = name.toLowerCase()
  if (/fidelity|label|tick|scale|text/.test(value)) return value.includes('panel') || value.includes('fidelity') ? 'panel-label' : 'button-label'
  if (/orientationmarker|rotationcue|indicator|ridge/.test(value)) return 'knob-indicator'
  if (/levelmeter|orangeborder|led/.test(value)) return 'led'
  if (/fader.*(handle|cap)|crossfaderhandle|tempofaderhandle/.test(value)) return 'fader-cap'
  if (/fader.*(track|slot)|crossfader.*(track|slot)/.test(value)) return 'fader-rail'
  if (/jog.*(ring|rim|disc|platter|recess)|jogwheel/.test(value)) return 'jog-ring'
  if (/pad/.test(value)) return 'pad'
  if (/knob|trim|high|mid|low|cfx|masterlevel|headphones|browseencoder|leveldepth/.test(value)) return 'knob-body'
  if (/metal|accent|seam|profile/.test(value)) return 'metal-accent'
  if (/body|top|bezel|button|play|cue|sync|shift|loop|load|beat|smart|select|onoff/.test(value)) return 'button-body'
  return 'chassis'
}

function prepareTextureColorSpaces(material: THREE.Material): void {
  const textured = material as THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null; normalMap?: THREE.Texture | null; roughnessMap?: THREE.Texture | null; metalnessMap?: THREE.Texture | null; aoMap?: THREE.Texture | null }
  if (textured.map) textured.map.colorSpace = THREE.SRGBColorSpace
  if (textured.emissiveMap) textured.emissiveMap.colorSpace = THREE.SRGBColorSpace
  for (const key of ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
    if (textured[key]) textured[key]!.colorSpace = THREE.NoColorSpace
  }
}

function describeMaterial(object: THREE.Object3D): VisibleMaterialAudit[] {
  if (!(object as THREE.Mesh).isMesh) return []
  const mesh = object as THREE.Mesh
  const entries = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return entries.map((material) => {
    const typed = material as ColorMaterial & { map?: THREE.Texture | null }
    const image = typed.map?.image as { width?: number; height?: number } | undefined
    return {
      object: mesh.name,
      material: material.name || material.type,
      uuid: material.uuid,
      color: typed.color?.toArray() ?? null,
      roughness: typed.roughness ?? null,
      metalness: typed.metalness ?? null,
      map: !!typed.map,
      mapUuid: typed.map?.uuid ?? null,
      mapDimensions: image?.width && image?.height ? { width: image.width, height: image.height } : null,
      emissive: typed.emissive?.toArray() ?? null,
      opacity: material.opacity,
      transparent: material.transparent
    }
  })
}

export function auditVisibleMaterials(root: THREE.Object3D, names: string[]): VisibleMaterialAudit[] {
  const result: VisibleMaterialAudit[] = []
  for (const name of names) {
    const object = root.getObjectByName(name)
    if (object) result.push(...describeMaterial(object))
  }
  return result
}

/** Dev-only probe used to prove whether a visible mesh is material-bound. */
export function applyForcedMaterialProbe(root: THREE.Object3D): void {
  const names = ['Trim1TopCap', 'Trim1OrientationMarker', 'ChannelFader1HandleBody', 'LeftJogWheelOuterRim', 'Trim1PanelLabel']
  const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.1 })
  for (const name of names) {
    const object = root.getObjectByName(name)
    if (!(object as THREE.Mesh | undefined)?.isMesh) continue
    ;(object as THREE.Mesh).material = material.clone()
  }
  material.dispose()
}

function tuneMaterial(material: ColorMaterial, role: ControllerMaterialRole, themeId: ControllerThemeId): void {
  const theme = getControllerTheme(themeId)
  const accent = new THREE.Color(theme.accent)
  const materialName = material.name.toLowerCase()
  if (material.color) {
    // These are deliberate role anchors, not multipliers on the authored near-black
    // values. The GLB uses very dark albedos, so a lerp leaves the control surfaces
    // below a usable contrast threshold even when the calibration is assigned.
    if (role === 'panel-label' || role === 'button-label' || role === 'knob-indicator') {
      material.color.setHex(role === 'knob-indicator' ? 0xf6f8fb : role === 'panel-label' ? 0xf1f5f9 : 0xf5f8fb)
    } else if (role === 'fader-rail') {
      material.color.setHex(materialName.includes('slot') ? 0x566474 : themeId === 'glossy-black' ? 0xb8c3cf : 0x9ba9b8)
    } else if (role === 'fader-cap') {
      material.color.setHex(themeId === 'accent-neon' ? 0xe9eef4 : 0xf7f9fb)
    } else if (role === 'jog-ring') {
      material.color.setHex(materialName.includes('inner') ? 0xb6c2d0 : 0x899aac)
    } else if (role === 'metal-accent') {
      material.color.copy(accent).lerp(new THREE.Color(0x6f7f90), themeId === 'accent-neon' ? 0.25 : 0.75)
    } else if (role === 'knob-body') {
      material.color.setHex(materialName.includes('knobtop') ? 0xe4eaf0 : 0xb4c2d0)
    } else if (role === 'button-body') {
      if (materialName.includes('bezel')) material.color.setHex(0x596a7c)
      else if (materialName.includes('transporttop')) material.color.setHex(0xc1cbd6)
      else if (materialName.includes('top')) material.color.setHex(themeId === 'glossy-black' ? 0xa8b5c4 : 0x9baabb)
      else material.color.setHex(themeId === 'glossy-black' ? 0x8b9bad : 0x8293a6)
    } else if (role === 'pad') {
      if (materialName.includes('bezel')) material.color.setHex(0x99a8b8)
      else if (materialName.includes('bed')) material.color.setHex(0x263443)
      else if (materialName.includes('top')) material.color.setHex(0x70859a)
      else material.color.setHex(themeId === 'accent-neon' ? 0x758391 : 0x62778c)
    } else if (role === 'chassis') {
      material.color.setHex(themeId === 'glossy-black' ? 0x111820 : 0x151b22)
    }
  }
  const textured = material as ColorMaterial & { map?: THREE.Texture | null; toneMapped?: boolean }
  if (role === 'knob-indicator') {
    // Orientation markers are separate geometry. Removing the dark label atlas
    // makes the pointer a stable, readable neutral mark at every knob angle.
    textured.map = null
  }
  if (material.roughness !== undefined) {
    if (role === 'fader-cap' || role === 'jog-ring' || role === 'metal-accent') material.roughness = Math.min(material.roughness, 0.48 - theme.gloss * 0.18)
    if (role === 'button-body' || role === 'knob-body' || role === 'pad') material.roughness = Math.min(material.roughness, 0.62 - theme.gloss * 0.18)
    if (role === 'panel-label' || role === 'button-label' || role === 'knob-indicator') material.roughness = Math.min(material.roughness, 0.7)
  }
  if (material.metalness !== undefined && (role === 'jog-ring' || role === 'fader-cap' || role === 'knob-body' || role === 'metal-accent')) {
    material.metalness = Math.max(material.metalness, 0.12 + theme.gloss * 0.22)
  }
  if (material.emissive && (role === 'panel-label' || role === 'button-label' || role === 'knob-indicator')) {
    material.emissive.setHex(role === 'knob-indicator' ? 0x3d4650 : role === 'panel-label' ? 0xd6dee8 : 0xdce4ee)
    if (material.emissiveIntensity !== undefined) material.emissiveIntensity = role === 'knob-indicator' ? 0.22 : role === 'panel-label' ? 1.45 : 1.55
    if (role === 'panel-label' || role === 'button-label') textured.toneMapped = false
  }
  if (material.emissive && (role === 'knob-body' || role === 'fader-cap' || role === 'fader-rail' || role === 'jog-ring' || role === 'button-body' || role === 'pad')) {
    material.emissive.copy(role === 'pad' && themeId === 'accent-neon' ? accent : new THREE.Color(role === 'pad' ? 0x2e4154 : 0x435363))
    if (material.emissiveIntensity !== undefined) {
      material.emissiveIntensity =
        role === 'jog-ring' ? 0.28 :
        role === 'button-body' ? 0.45 :
        role === 'pad' ? 0.34 :
        role === 'fader-rail' ? 0.32 :
        0.4
    }
  }
}

export function calibrateControllerMaterials(root: THREE.Object3D, enabled = true, themeId: ControllerThemeId = 'default-dark'): MaterialCalibrationResult {
  const materialRoles = new Map<string, THREE.Material>()
  const auditByKey = new Map<string, MaterialCalibrationAudit>()
  const roleCounts = {} as Record<ControllerMaterialRole, number>
  const materials = new Set<THREE.Material>()
  const classifiedMaterials = new Set<THREE.Material>()

  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return
    const mesh = object as THREE.Mesh
    const role = roleForName(mesh.name)
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const tunedMaterials = sourceMaterials.map((source) => {
      materials.add(source)
      classifiedMaterials.add(source)
      prepareTextureColorSpaces(source)
      const key = `${source.uuid}:${role}`
      const sourceColor = (source as ColorMaterial).color?.toArray() ?? null
      let audit = auditByKey.get(key)
      if (!audit) {
        audit = {
          material: source.name || source.type,
          role,
          meshCount: 0,
          assignedMeshCount: 0,
          calibrated: enabled,
          originalColor: sourceColor,
          finalColor: sourceColor,
          originalRoughness: (source as ColorMaterial).roughness ?? null,
          finalRoughness: (source as ColorMaterial).roughness ?? null,
          originalMetalness: (source as ColorMaterial).metalness ?? null,
          finalMetalness: (source as ColorMaterial).metalness ?? null
        }
        auditByKey.set(key, audit)
      }
      audit.meshCount += 1
      let tuned = materialRoles.get(key)
      if (!tuned) {
        tuned = enabled ? source.clone() : source
        if (enabled) tuneMaterial(tuned as ColorMaterial, role, themeId)
        materialRoles.set(key, tuned)
        const finalMaterial = tuned as ColorMaterial
        audit.finalColor = finalMaterial.color?.toArray() ?? null
        audit.finalRoughness = finalMaterial.roughness ?? null
        audit.finalMetalness = finalMaterial.metalness ?? null
      }
      if (enabled && tuned !== source) audit.assignedMeshCount += 1
      return tuned
    })
    mesh.material = Array.isArray(mesh.material) ? tunedMaterials : tunedMaterials[0]
  })

  return {
    materialCount: materials.size,
    classifiedMaterialCount: classifiedMaterials.size,
    roleCounts,
    audit: [...auditByKey.values()]
  }
}
