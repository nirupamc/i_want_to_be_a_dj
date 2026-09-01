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

// ── Key surface upgrade: MeshPhysicalMaterial ─────────────────────────────
// The only way to get real clearcoat in Three.js is MeshPhysicalMaterial.
// This copies a calibrated MeshStandardMaterial into a Physical one while
// preserving every authored property.
function upgradeToPhysical(std: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const p = new THREE.MeshPhysicalMaterial({
    color:             std.color.clone(),
    emissive:          std.emissive?.clone() ?? new THREE.Color(0x000000),
    emissiveIntensity: std.emissiveIntensity ?? 0,
    roughness:         std.roughness,
    metalness:         std.metalness,
    map:               std.map,
    normalMap:         std.normalMap,
    roughnessMap:      std.roughnessMap,
    metalnessMap:      std.metalnessMap,
    aoMap:             std.aoMap,
    envMap:            std.envMap,
    envMapIntensity:   std.envMapIntensity,
    transparent:       std.transparent,
    opacity:           std.opacity,
    side:              std.side,
    depthWrite:        std.depthWrite,
    toneMapped:        (std as THREE.MeshStandardMaterial & { toneMapped?: boolean }).toneMapped ?? true,
  })
  p.name = std.name
  return p
}

// ── Material debug: DEV-only flat gray override ───────────────────────────
/** ?materialDebug=forced — renders role-keyed gray shades to isolate whether
 *  remaining flatness is a LIGHTING or MATERIAL issue. Not for production. */
export function applyMaterialDebug(root: THREE.Object3D): void {
  const roleColors: Record<string, number> = {
    chassis:         0x282c30,
    'button-body':   0x4a5260,
    'button-label':  0xe8eef4,
    'panel-label':   0xdce4ee,
    'knob-body':     0x565e6a,
    'knob-indicator':0xf0f4f8,
    'pad':           0x3e4a56,
    'fader-cap':     0xc8d0d8,
    'fader-rail':    0x4a5260,
    'jog-ring':      0x6a7888,
    'metal-accent':  0x8898a8,
    'led':           0x103818,
  }
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return
    const mesh = object as THREE.Mesh
    const role = roleForName(mesh.name)
    const hex = roleColors[role] ?? 0x303030
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: role === 'chassis' ? 0.75 : role === 'fader-cap' ? 0.15 : 0.45,
      metalness: role === 'fader-cap' || role === 'metal-accent' ? 0.55 : 0.04,
    })
    mesh.material = mat
  })
}

function tuneMaterial(material: ColorMaterial, role: ControllerMaterialRole, themeId: ControllerThemeId): void {
  const theme = getControllerTheme(themeId)
  const accent = new THREE.Color(theme.accent)
  const n = material.name.toLowerCase()

  // ── Exact per-node overrides based on confirmed GLB node name patterns ──
  // These fire FIRST and return early so the role-based block doesn't
  // overwrite a more specific assignment.

  // Jog wheel sub-parts — must match before generic jog-ring role
  if (/leftjogwheel|rightjogwheel/.test(n)) {
    const mat = material as THREE.MeshStandardMaterial
    if (/outerrim|rimstep|rimscallop/.test(n)) {
      // Outer hard anodised-aluminum ring — catches key light strongly
      mat.color?.setHex(0xb8ccd8)
      mat.roughness = 0.22
      mat.metalness = 0.72
      if (mat.emissive) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0 }
    } else if (/innerwhitering/.test(n)) {
      mat.color?.setHex(0xdae6f0)
      mat.roughness = 0.35
      mat.metalness = 0.45
    } else if (/centerdarkring|plattersubtlering/.test(n)) {
      // Lifted: platter concentric rings — visibly darker than rim but not black
      mat.color?.setHex(0x4c5868)
      mat.roughness = 0.62
      mat.metalness = 0.08
    } else if (/innerdisc|mesh/.test(n)) {
      // Main platter surface — graphite gray
      mat.color?.setHex(0x647280)
      mat.roughness = 0.55
      mat.metalness = 0.12
    } else if (/centercap/.test(n)) {
      // Center hub — slightly lighter than chassis to be readable
      mat.color?.setHex(0x384248)
      mat.roughness = 0.58
      mat.metalness = 0.06
    } else if (/finetickring|accentfinering/.test(n)) {
      mat.color?.setHex(0xbcccd8)
      mat.roughness = 0.30
      mat.metalness = 0.55
      if (mat.emissive) { mat.emissive.setHex(0x8090a0); mat.emissiveIntensity = 0.28 }
    } else if (/recessbase/.test(n)) {
      // Recess — darker than platter, above chassis
      mat.color?.setHex(0x2e343c)
      mat.roughness = 0.82
      mat.metalness = 0.04
    }
    return
  }

  // Pad orange border geometry — always orange, emissive driven by activeState
  if (/orangeborder/.test(n)) {
    const mat = material as THREE.MeshStandardMaterial
    mat.color?.setHex(0xff5500)
    mat.roughness = 0.45
    mat.metalness = 0.02
    if (mat.emissive) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0 }
    return
  }

  // Pad PadTopAccent geometry — subtle highlight stripe
  if (/padtopaccent/.test(n)) {
    const mat = material as THREE.MeshStandardMaterial
    mat.color?.setHex(0x6888a0)
    mat.roughness = 0.35
    mat.metalness = 0.18
    if (mat.emissive) { mat.emissive.setHex(0x203040); mat.emissiveIntensity = 0.3 }
    return
  }

  // Fader handles and ridges — bright, metallic — primary visual landmark
  if (/faderhandlebody|crossfaderhandlebody/.test(n)) {
    const mat = material as THREE.MeshStandardMaterial
    mat.color?.setHex(/crossfader/.test(n) ? 0xe0e7ee : 0xc8d4dc)
    mat.roughness = 0.18
    mat.metalness = 0.78
    if (mat.emissive) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0 }
    return
  }
  if (/faderhandleridge|crossfaderhandleridge/.test(n)) {
    const mat = material as THREE.MeshStandardMaterial
    mat.color?.setHex(0xa0b0bc)
    mat.roughness = 0.28
    mat.metalness = 0.62
    return
  }

  // Fader slot/track — dark recess, clearly lower than cap, but not invisible
  if (/fader.*slot|fader.*track|crossfader.*track/.test(n)) {
    const mat = material as THREE.MeshStandardMaterial
    mat.color?.setHex(/slot/.test(n) ? 0x22282e : 0x30363e)
    mat.roughness = 0.88
    mat.metalness = 0.02
    if (mat.emissive) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0 }
    return
  }

  // Fader tick marks — visible white lines
  if (/fadertick|crossfadertick|crossfaderscaletick/.test(n)) {
    const mat = material as THREE.MeshStandardMaterial
    mat.color?.setHex(0xc0ccd6)
    mat.roughness = 0.55
    mat.metalness = 0.05
    if (mat.emissive) { mat.emissive.setHex(0x8898a8); mat.emissiveIntensity = 0.45; (mat as THREE.MeshStandardMaterial & { toneMapped?: boolean }).toneMapped = false }
    return
  }

  // ── Role-based assignments ──────────────────────────────────────────────
  if (!material.color) return

  switch (role) {
    case 'chassis': {
      // Lifted from near-black to visible dark charcoal — must be distinct from
      // the near-black scene background (#06080b / #05070b).
      const c = themeId === 'glossy-black' ? 0x1a2228 : themeId === 'accent-neon' ? 0x1f252c : 0x2a323a
      material.color.setHex(c)
      if (material.roughness !== undefined) material.roughness = themeId === 'glossy-black' ? 0.28 : 0.70
      if (material.metalness !== undefined) material.metalness = themeId === 'glossy-black' ? 0.08 : 0.02
      if (material.emissive) { material.emissive.setHex(0x000000); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0 }
      break
    }
    case 'jog-ring': {
      // Generic jog ring (catch-all for any jog geometry not handled above)
      material.color.setHex(0x8898aa)
      if (material.roughness !== undefined) material.roughness = 0.35
      if (material.metalness !== undefined) material.metalness = 0.55
      if (material.emissive) { material.emissive.setHex(0x000000); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0 }
      break
    }
    case 'knob-body': {
      if (n.includes('topcap')) {
        // The top-cap ring catches light like a real knob pointer ring
        material.color.setHex(0xc8d4de)
        if (material.roughness !== undefined) material.roughness = 0.20
        if (material.metalness !== undefined) material.metalness = 0.65
      } else {
        // Lifted from near-black to visible dark plastic
        material.color.setHex(0x708090)
        if (material.roughness !== undefined) material.roughness = 0.52
        if (material.metalness !== undefined) material.metalness = 0.08
      }
      if (material.emissive) { material.emissive.setHex(0x000000); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0 }
      break
    }
    case 'knob-indicator': {
      // Pointer wedge — bright white, texture removed, slightly emissive
      material.color.setHex(0xf0f4f8)
      ;(material as THREE.MeshStandardMaterial & { map?: THREE.Texture | null }).map = null
      if (material.roughness !== undefined) material.roughness = 0.28
      if (material.metalness !== undefined) material.metalness = 0.22
      if (material.emissive) { material.emissive.setHex(0xa0b0c0); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0.45 }
      break
    }
    case 'fader-cap': {
      // Generic fader cap (HandleBody handled above, this catches any remaining)
      material.color.setHex(0xb8c4cc)
      if (material.roughness !== undefined) material.roughness = 0.22
      if (material.metalness !== undefined) material.metalness = 0.68
      if (material.emissive) { material.emissive.setHex(0x000000); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0 }
      break
    }
    case 'fader-rail': {
      // Rail visibly darker than cap but not invisible — lifted from near-black
      material.color.setHex(0x48525e)
      if (material.roughness !== undefined) material.roughness = 0.78
      if (material.metalness !== undefined) material.metalness = 0.04
      if (material.emissive) { material.emissive.setHex(0x000000); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0 }
      break
    }
    case 'button-body': {
      const isTransport = /play|cue(?!looploop)/.test(n) && !/channel/.test(n)
      const isBezel     = n.includes('bezel')
      const isTop       = n.includes('top')

      if (isBezel) {
        // Bezel — raised rim around button, slightly metallic edge
        material.color.setHex(0x72808e)
        if (material.roughness !== undefined) material.roughness = 0.38
        if (material.metalness !== undefined) material.metalness = 0.22
      } else if (isTransport && isTop) {
        // PLAY/CUE top face — visibly lighter than other buttons
        material.color.setHex(themeId === 'glossy-black' ? 0xd0dae2 : 0xbecad6)
        if (material.roughness !== undefined) material.roughness = 0.35
        if (material.metalness !== undefined) material.metalness = 0.12
      } else if (isTop) {
        // Utility button top — lifted to be visible
        material.color.setHex(0xa4b4c4)
        if (material.roughness !== undefined) material.roughness = 0.45
        if (material.metalness !== undefined) material.metalness = 0.08
      } else {
        // Button body/shell — dark charcoal plastic, above chassis
        material.color.setHex(0x5e6c7a)
        if (material.roughness !== undefined) material.roughness = 0.58
        if (material.metalness !== undefined) material.metalness = 0.04
      }
      // No emissive on button bodies — active state driven by litMesh clone
      if (material.emissive) { material.emissive.setHex(0x000000); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0 }
      break
    }
    case 'pad': {
      if (n.includes('bezel')) {
        // Pad bezel — outer raised frame, clearly brighter than body
        material.color.setHex(0xa8bcce)
        if (material.roughness !== undefined) material.roughness = 0.38
        if (material.metalness !== undefined) material.metalness = 0.18
      } else if (n.includes('bed')) {
        // Pad grid bed — dark recess, slightly above chassis level
        material.color.setHex(0x323c48)
        if (material.roughness !== undefined) material.roughness = 0.80
        if (material.metalness !== undefined) material.metalness = 0.02
      } else if (n.includes('top')) {
        // Pad top face — rubber-like but visible
        material.color.setHex(0x7e92a8)
        if (material.roughness !== undefined) material.roughness = 0.70
        if (material.metalness !== undefined) material.metalness = 0.02
      } else {
        // Pad body/shell — lifted one visual stop
        material.color.setHex(themeId === 'accent-neon' ? 0x8499ae : 0x6a7e94)
        if (material.roughness !== undefined) material.roughness = 0.65
        if (material.metalness !== undefined) material.metalness = 0.03
      }
      if (material.emissive) { material.emissive.setHex(0x000000); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0 }
      break
    }
    case 'panel-label':
    case 'button-label': {
      // Baked text geometry — keep modest since Troika labels will replace priority ones
      // These provide backup visibility for labels not yet replaced
      material.color.setHex(0xffffff)
      if (material.roughness !== undefined) material.roughness = 0.35
      if (material.metalness !== undefined) material.metalness = 0.0
      if (material.emissive) {
        material.emissive.setHex(0xf0f4f8) // Subtle off-white
        if (material.emissiveIntensity !== undefined) {
          material.emissiveIntensity = role === 'panel-label' ? 2.2 : 2.4 // Moderate boost
        }
        ;(material as THREE.MeshStandardMaterial & { toneMapped?: boolean }).toneMapped = false
      }
      break
    }
    case 'led': {
      // Already orange/LED — keep but make sure it's self-illuminated
      if (material.emissive) { material.emissive.setHex(0xff4400); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 1.2 }
      ;(material as THREE.MeshStandardMaterial & { toneMapped?: boolean }).toneMapped = false
      break
    }
    case 'metal-accent': {
      material.color.copy(accent).lerp(new THREE.Color(0x8898a8), 0.65)
      if (material.roughness !== undefined) material.roughness = 0.25
      if (material.metalness !== undefined) material.metalness = 0.72
      if (material.emissive) { material.emissive.setHex(0x000000); if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0 }
      break
    }
  }

  // Glossy-black theme: add clearcoat to chassis via physical material upgrade
  const textured = material as ColorMaterial & { map?: THREE.Texture | null; toneMapped?: boolean }
  if (textured.map && role === 'knob-indicator') textured.map = null
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
      const key = `${source.uuid}:${role}:${mesh.name}`
      const sourceColor = (source as ColorMaterial).color?.toArray() ?? null
      let audit = auditByKey.get(`${source.uuid}:${role}`)
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
        auditByKey.set(`${source.uuid}:${role}`, audit)
      }
      audit.meshCount += 1

      // Key change from Pass 2: each mesh gets its OWN clone keyed by
      // mesh.name, not just material uuid:role. This ensures per-node
      // overrides (jog rim vs jog disc) are applied independently even when
      // the GLB shares one source material between them.
      let tuned = materialRoles.get(key)
      if (!tuned) {
        tuned = enabled ? source.clone() : source
        if (enabled) {
          // Set the name so tuneMaterial can pattern-match on the mesh name
          ;(tuned as THREE.Material).name = mesh.name
          tuneMaterial(tuned as ColorMaterial, role, themeId)
          // Upgrade to MeshPhysicalMaterial for surfaces that need clearcoat
          const shouldUpgrade =
            enabled &&
            (themeId === 'glossy-black' ||
             /outerrim|rimstep|faderhandle.*body|crossfaderhandle.*body|topcap/.test(mesh.name.toLowerCase()))
          if (shouldUpgrade && (tuned as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const physical = upgradeToPhysical(tuned as THREE.MeshStandardMaterial)
            const isJogRim = /outerrim|rimstep/.test(mesh.name.toLowerCase())
            const isFaderCap = /faderhandle.*body|crossfaderhandle.*body/.test(mesh.name.toLowerCase())
            const isKnobTop = /topcap/.test(mesh.name.toLowerCase())
            const isGlossyChassis = themeId === 'glossy-black' && role === 'chassis'
            if (isJogRim)       { physical.clearcoat = 0.7; physical.clearcoatRoughness = 0.12 }
            else if (isFaderCap){ physical.clearcoat = 0.5; physical.clearcoatRoughness = 0.08 }
            else if (isKnobTop) { physical.clearcoat = 0.4; physical.clearcoatRoughness = 0.15 }
            else if (isGlossyChassis) { physical.clearcoat = 0.6; physical.clearcoatRoughness = 0.35 }
            tuned = physical as unknown as THREE.Material
          }
        }
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
    // Shadows: only top-level visible geometry needs to cast
    mesh.castShadow = true
    mesh.receiveShadow = true
  })

  return {
    materialCount: materials.size,
    classifiedMaterialCount: classifiedMaterials.size,
    roleCounts,
    audit: [...auditByKey.values()]
  }
}
