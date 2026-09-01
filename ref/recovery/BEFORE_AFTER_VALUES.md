# Pass 2 Recovery — Before/After Value Comparison

Quick reference for verifying the calibration changes applied.

---

## Renderer Settings

| Setting | Before | After | Change |
|---------|--------|-------|--------|
| **toneMappingExposure** | `1.45` | `1.7` | +17% (+0.25 stops) |
| **toneMapping** | `NeutralToneMapping` | `NeutralToneMapping` | (unchanged) |

---

## Lighting Intensities

| Light | Before | After | Change |
|-------|--------|-------|--------|
| **Hemisphere** | `0.82` | `1.0` | +22% |
| **Key** (upper-left) | `3.2` | `3.6` | +12.5% |
| **Fill** (right) | `0.72` | `0.82` | +14% |
| **Rim** (back-right) | `0.88` | `1.0` | +14% |
| **Front-low** | `0.95` | `1.08` | +14% |
| **Top-center** | `1.3` | `1.45` | +12% |

---

## Environment Map

| Type | Before | After | Change |
|------|--------|-------|--------|
| **Metallic surfaces** | `1.2` | `1.35` | +12% |
| **Non-metallic surfaces** | `0.55` | `0.70` | +27% |

---

## Material Base Colors (Hex RGB)

### Chassis & Structure

| Surface | Before | After | Luminance Δ |
|---------|--------|-------|-------------|
| **Chassis** (default) | `#1c2229` | `#2a323a` | +50% |
| **Jog recess** | `#1e242c` | `#2e343c` | +70% |
| **Pad bed** | `#252e38` | `#323c48` | +50% |
| **Jog center cap** | `#28323c` | `#384248` | +50% |

### Jog Wheel Components

| Surface | Before | After | Luminance Δ |
|---------|--------|-------|-------------|
| **Jog outer rim** | `#a8bccc` | `#b8ccd8` | +20% |
| **Jog platter disc** | `#505e6c` | `#647280` | +40% |
| **Jog center ring** | `#3c4858` | `#4c5868` | +40% |

### Controls

| Surface | Before | After | Luminance Δ |
|---------|--------|-------|-------------|
| **Knob body** | `#5a6878` | `#708090` | +50% |
| **Fader rail** | `#363e48` | `#48525e` | +50% |
| **Button body** | `#4a5862` | `#5e6c7a` | +50% |
| **Button bezel** | `#62707e` | `#72808e` | +20% |
| **Utility button top** | `#94a4b4` | `#a4b4c4` | +20% |

### Pads

| Surface | Before | After | Luminance Δ |
|---------|--------|-------|-------------|
| **Pad body** | `#566a7c` | `#6a7e94` | +50% |
| **Pad bezel** | `#98aabb` | `#a8bcce` | +20% |
| **Pad top face** | `#6a7e90` | `#7e92a8` | +30% |

---

## Label Emissive Intensity

| Label Type | Before | After | Change |
|------------|--------|-------|--------|
| **Panel labels** | `1.8` | `2.0` | +11% |
| **Button labels** | `2.0` | `2.2` | +10% |

---

## CSS Stage Vignette

| Property | Before | After | Change |
|----------|--------|-------|--------|
| **Edge vignette opacity** | `rgba(0,0,0,0.38)` | `rgba(0,0,0,0.15)` | -60% |

**Location:** `.controller-stage::after` in `src/index.css`

---

## Preserved Values (Unchanged)

These remain the same to maintain the Pass 2B rendering architecture:

- ✅ **Tone mapping mode:** `NeutralToneMapping`
- ✅ **PMREM environment:** Procedural studio texture
- ✅ **Material system:** MeshPhysicalMaterial with clearcoat on key surfaces
- ✅ **Lighting rig:** Product photography setup (key/fill/rim/front/top)
- ✅ **Shadow configuration:** Soft directional shadow from key light
- ✅ **Roughness/metalness values:** Per-surface PBR calibration
- ✅ **Clearcoat values:** Jog rim 0.7, fader caps 0.5, knob tops 0.4

---

## Visual Impact Summary

### Expected screen luminance (approximate)

| Surface | Before (sRGB) | After (sRGB) | Visual Result |
|---------|---------------|--------------|---------------|
| Background | 5-6 | 5-6 | (unchanged) near-black |
| Chassis | 28-34 | 42-58 | Now **visible charcoal** |
| Knob body | 90-104 | 112-128 | Now **readable dark gray** |
| Pad body | 86-100 | 106-122 | Now **visible rubber** |
| Fader cap | 200-212 | 200-224 | **Brighter metallic** |
| Jog rim | 168-180 | 184-200 | **Stronger highlights** |

**Key principle:** Chassis lifted from ~30 (barely above background) to ~50 (clear separation while maintaining "black" appearance)

---

## How to Verify Changes Were Applied

### Method 1: Browser DevTools Inspection

1. Open `http://localhost:5174/`
2. Press `F12` → Console tab
3. Paste and run:

```javascript
// Check renderer exposure
console.log('Exposure:', window.__three_scene_debug?.renderer?.toneMappingExposure)

// Check a sample material color
const chassis = window.__three_scene_debug?.scene?.getObjectByName?.('MainBody')
console.log('Chassis color:', chassis?.material?.color?.getHexString())
```

**Expected console output:**
```
Exposure: 1.7
Chassis color: 2a323a
```

### Method 2: Visual Spot Check

Use OS color picker on screenshot:
- Sample chassis pixel → should be `#2a-34` range (not `#1c-22`)
- Sample knob body → should be `#70-80` range (not `#5a-68`)
- Sample vignette edge → should be lighter/less dark than before

### Method 3: Side-by-side Comparison

1. Capture screenshot now (after recovery)
2. Open in image editor with previous regressed screenshot
3. Layer at 50% opacity or use difference blend mode
4. Controller should be **visibly brighter** overall

---

## Rollback Instructions (if needed)

If recovery went too far and controller looks washed-out:

**Quick rollback:**
```bash
git checkout HEAD -- src/three/ddj-flx4/ThreeScene.tsx
git checkout HEAD -- src/three/ddj-flx4/visualCalibration.ts
git checkout HEAD -- src/index.css
```

**Partial rollback (exposure only):**
- ThreeScene.tsx line 415: `1.7` → `1.55` (mid-point)
- Test, adjust incrementally

---

## Fine-Tuning Guidelines

If specific surfaces still need adjustment:

### Too dark overall?
- Increase `toneMappingExposure` in steps of `0.05`
- Range: `1.7` → `1.75` → `1.8`

### Specific control too dark?
- Locate material color in `visualCalibration.ts`
- Increase RGB hex by `+10-20` (e.g., `#70` → `#80`)

### Vignette still too strong?
- Reduce opacity further: `0.15` → `0.10` → `0.05`
- Or remove entirely: delete `::after` pseudo-element

### Labels too bright/glowing?
- Reduce emissive intensity: `2.0` → `1.8` → `1.6`
- Or reduce color: `#d0dce8` → `#b0bcc8`

---

**Recovery date:** September 1, 2026  
**Applied changes:** Exposure +17%, Materials +50%, Vignette -60%  
**Status:** All quality gates passed, ready for visual validation
