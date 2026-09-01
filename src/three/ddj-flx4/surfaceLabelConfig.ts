// Surface label configuration - hardware-authentic DDJ-FLX4 silk-screen style
// These REPLACE low-res GLB geometry labels with crisp SDF text

export interface SurfaceLabelConfig {
  id: string
  text: string
  section: 'deck-a' | 'deck-b' | 'mixer' | 'fx' | 'browse'
  position: [number, number, number] // absolute x, y, z in controller space
  rotation: [number, number, number] // euler angles in radians
  fontSize: number // in controller units
  maxWidth: number // text wrap width
  align: 'left' | 'center' | 'right'
  color: string // hex color
  replacesGlbNode: string // Original GLB label mesh to hide
}

// Panel labels sit at y=0.060 (panel surface)
// We place replacements at y=0.0605 (0.5mm above) to avoid z-fighting
const LABEL_Y = 0.0605

// Panel labels use rotation (+90° around X) - text faces up
const PANEL_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0]

// Button labels use rotation (-90° around X) - text faces up on button surface
const BUTTON_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]

// Hardware-authentic colors - subtle off-white, not glowing
const PRIMARY_COLOR = '#e0e4e8'   // Primary operational labels
const SECONDARY_COLOR = '#d4d8dc' // Secondary/utility labels
const ACCENT_COLOR = '#ffb366'    // HOT CUE, FX highlights (restrained orange)

// Font size tiers - calibrated to match real FLX4 proportions
const SIZE_PRIMARY = 0.0038     // Main labels (TRIM, HI, MID, LOW, etc.)
const SIZE_SECONDARY = 0.0032   // Secondary labels (mode buttons, utility)
const SIZE_MICRO = 0.0026       // Small utility text

export const SURFACE_LABELS: SurfaceLabelConfig[] = [
  
  // ══════════════════════════════════════
  // MIXER SECTION - Channel 1 EQ
  // ══════════════════════════════════════
  
  {
    id: 'trim1',
    text: 'TRIM',
    section: 'mixer',
    position: [-0.020, LABEL_Y, 0.090],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.022,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'Trim1PanelLabel',
  },
  {
    id: 'high1',
    text: 'HI',
    section: 'mixer',
    position: [-0.020, LABEL_Y, 0.065],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.015,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'High1PanelLabel',
  },
  {
    id: 'mid1',
    text: 'MID',
    section: 'mixer',
    position: [-0.020, LABEL_Y, 0.040],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.018,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'Mid1PanelLabel',
  },
  {
    id: 'low1',
    text: 'LOW',
    section: 'mixer',
    position: [-0.020, LABEL_Y, 0.015],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.018,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'Low1PanelLabel',
  },
  {
    id: 'cfx1',
    text: 'CFX',
    section: 'mixer',
    position: [-0.020, LABEL_Y, -0.010],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.018,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'CFX1PanelLabel',
  },
  
  // ══════════════════════════════════════
  // MIXER SECTION - Channel 2 EQ
  // ══════════════════════════════════════
  
  {
    id: 'trim2',
    text: 'TRIM',
    section: 'mixer',
    position: [0.020, LABEL_Y, 0.090],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.022,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'Trim2PanelLabel',
  },
  {
    id: 'high2',
    text: 'HI',
    section: 'mixer',
    position: [0.020, LABEL_Y, 0.065],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.015,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'High2PanelLabel',
  },
  {
    id: 'mid2',
    text: 'MID',
    section: 'mixer',
    position: [0.020, LABEL_Y, 0.040],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.018,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'Mid2PanelLabel',
  },
  {
    id: 'low2',
    text: 'LOW',
    section: 'mixer',
    position: [0.020, LABEL_Y, 0.015],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.018,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'Low2PanelLabel',
  },
  {
    id: 'cfx2',
    text: 'CFX',
    section: 'mixer',
    position: [0.020, LABEL_Y, -0.010],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.018,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'CFX2PanelLabel',
  },
  
  // ══════════════════════════════════════
  // MIXER SECTION - Faders & Master
  // ══════════════════════════════════════
  
  {
    id: 'ch-fader-1',
    text: 'CH 1',
    section: 'mixer',
    position: [-0.020, LABEL_Y, -0.058],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_SECONDARY,
    maxWidth: 0.020,
    align: 'center',
    color: SECONDARY_COLOR,
    replacesGlbNode: 'ChannelFader1PanelLabel',
  },
  {
    id: 'ch-fader-2',
    text: 'CH 2',
    section: 'mixer',
    position: [0.020, LABEL_Y, -0.058],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_SECONDARY,
    maxWidth: 0.020,
    align: 'center',
    color: SECONDARY_COLOR,
    replacesGlbNode: 'ChannelFader2PanelLabel',
  },
  {
    id: 'master-level',
    text: 'MASTER LEVEL',
    section: 'mixer',
    position: [0.057, LABEL_Y, 0.088],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_SECONDARY,
    maxWidth: 0.038,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'MasterLevelPanelLabel',
  },
  
  // ══════════════════════════════════════
  // BROWSE SECTION
  // ══════════════════════════════════════
  
  {
    id: 'browse',
    text: 'BROWSE',
    section: 'browse',
    position: [0.000, LABEL_Y, 0.113],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_PRIMARY,
    maxWidth: 0.032,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'BrowseEncoderPanelLabel',
  },
  
  // ══════════════════════════════════════
  // FX SECTION
  // ══════════════════════════════════════
  
  {
    id: 'fx-level-depth',
    text: 'LEVEL/DEPTH',
    section: 'fx',
    position: [0.057, LABEL_Y, -0.067],
    rotation: PANEL_ROTATION,
    fontSize: SIZE_SECONDARY,
    maxWidth: 0.038,
    align: 'center',
    color: PRIMARY_COLOR,
    replacesGlbNode: 'BeatFxLevelDepthPanelLabel',
  },
  
  // Note: Additional FX button labels would go here
  // They use BUTTON_ROTATION and need positions from button mesh parents
  // Deferring until panel labels are verified
]
