import * as THREE from 'three'

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

function tuneMaterial(material: ColorMaterial, role: ControllerMaterialRole): void {
  if (material.color) {
    if (role === 'panel-label' || role === 'button-label' || role === 'knob-indicator' || role === 'fader-rail') {
      material.color.lerp(new THREE.Color(0xd7dce3), role === 'fader-rail' ? 0.72 : 0.48)
    } else if (role === 'fader-cap' || role === 'jog-ring' || role === 'metal-accent') {
      material.color.lerp(new THREE.Color(0xaeb5bf), role === 'fader-cap' ? 0.72 : 0.62)
    } else if (role === 'knob-body' || role === 'button-body' || role === 'pad') {
      material.color.lerp(new THREE.Color(0x9da5af), role === 'knob-body' ? 0.78 : 0.58)
    }
  }
  if (material.roughness !== undefined) {
    if (role === 'fader-cap' || role === 'jog-ring' || role === 'metal-accent') material.roughness = Math.min(material.roughness, 0.62)
    if (role === 'panel-label' || role === 'button-label' || role === 'knob-indicator') material.roughness = Math.min(material.roughness, 0.7)
  }
  if (material.emissive && (role === 'panel-label' || role === 'button-label' || role === 'knob-indicator')) {
    material.emissive.lerp(new THREE.Color(0x313841), 0.18)
    if (material.emissiveIntensity !== undefined) material.emissiveIntensity = Math.min(Math.max(material.emissiveIntensity, 0.08), 0.18)
  }
}

export function calibrateControllerMaterials(root: THREE.Object3D): { materialCount: number; roleCounts: Record<ControllerMaterialRole, number> } {
  const materialRoles = new Map<string, THREE.Material>()
  const roleCounts = {} as Record<ControllerMaterialRole, number>
  const materials = new Set<THREE.Material>()

  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return
    const mesh = object as THREE.Mesh
    const role = roleForName(mesh.name)
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const tunedMaterials = sourceMaterials.map((source) => {
      materials.add(source)
      prepareTextureColorSpaces(source)
      const key = `${source.uuid}:${role}`
      let tuned = materialRoles.get(key)
      if (!tuned) {
        tuned = source.clone()
        tuneMaterial(tuned as ColorMaterial, role)
        materialRoles.set(key, tuned)
      }
      return tuned
    })
    mesh.material = Array.isArray(mesh.material) ? tunedMaterials : tunedMaterials[0]
  })

  return { materialCount: materials.size, roleCounts }
}
