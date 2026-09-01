# HONEST LABEL READABILITY AUDIT

**Date**: 2026-09-01  
**Context**: User reports physical 3D text on controller is still too hard to read  
**Screenshot Provided**: Yes - shows controller with barely visible text

---

## BRUTAL HONEST DIAGNOSIS

### What I Can See in the Screenshot

1. **GLB label geometry IS present** - I can faintly see text outlines on pads, mixer, transport
2. **GLB labels are EXTREMELY DIM** - They're so faint they're almost invisible
3. **Only the overlay pills are readable** - Blue/pink/amber label callouts provide all clarity
4. **Troika labels NOT VISIBLE** - The troika-three-text labels I just implemented aren't showing

### Root Cause Analysis

**The fundamental problem**: The GLB contains **pure geometry labels** (not textured), and at normal viewing distance these small 3D text meshes:

1. **Project to 2-4 pixels** on screen (massive minification)
2. **Get anti-aliased into blur** by browser MSAA
3. **Lack sufficient contrast** even with emissive boost
4. **Cannot benefit from texture sharpening** (no texture maps exist)
5. **Are viewed at oblique angle** (foreshortening makes them smaller)

**Previous fix attempt**: Increased emissive from 2.0→2.8/3.0 and color to pure white  
**Why it failed**: Not aggressive enough. Need 5-6x emissive, not 3x

**Current fix attempt**: 
- Pushed emissive to 5.0/6.0 (was 2.8/3.0)
- Changed emissive color to pure #ffffff (was #f8fcff) 
- Increased exposure from 1.7→2.0
- Reduced roughness from 0.35→0.25
- Added troika-three-text backup labels (may not be rendering due to font issue)

---

## WHAT THE PREVIOUS PASS ACTUALLY DID

Looking at `docs/FINAL_TEXT_PASS_COMPLETE.md`, the previous implementation:

✅ **Material calibration**: Increased emissive 2.0→2.8 (panel) and 2.2→3.0 (button)  
✅ **CSS overlay improvements**: Made the label pills sharper and brighter  
❌ **Troika labels**: Mentioned in earlier conversation but NOT in the final doc  
❌ **Visual verification**: Marked as "PENDING" - was never confirmed in browser

**Conclusion**: The previous pass did a modest emissive boost but it wasn't enough.

---

## WHY TROIKA LABELS AREN'T SHOWING

**Issue 1**: Font path `/fonts/Inter-SemiBold.woff` doesn't exist  
**Fix**: Changed to `font: null` to use system fallback

**Issue 2**: Labels may be too small (fontSize: 0.0025-0.0035 units)  
**Issue 3**: Labels may be at wrong Z-depth or behind controller geometry  
**Issue 4**: Console errors not visible (need browser inspection)

---

## CURRENT AGGRESSIVE FIX

### Material Changes (visualCalibration.ts)

```typescript
case 'panel-label':
case 'button-label': {
  material.color.setHex(0xffffff)              // Pure white base
  material.roughness = 0.25                     // Very smooth (was 0.35)
  material.metalness = 0.0                      // Non-metallic text
  material.emissive.setHex(0xffffff)            // Pure white emissive (was 0xf8fcff)
  material.emissiveIntensity = 5.0/6.0          // 5-6x original (was 2.8/3.0)
  material.toneMapped = false                   // Bypass tone mapping limits
}
```

**Change summary**:
- Emissive intensity: **+100-150%** increase (2.8→5.0, 3.0→6.0)
- Emissive color: Pure white (was near-white)
- Roughness: -29% (0.35→0.25)

### Exposure Change (ThreeScene.tsx)

```typescript
renderer.toneMappingExposure = 2.0  // Was 1.7 (+18% brightness)
```

### Expected Visual Result

**If this works**:
- Labels will glow significantly brighter (almost like LEDs)
- Controller will look slightly more exposed overall (+18%)
- Text should "pop" against dark chassis
- May approach the limit before looking unrealistic

**If this still fails**:
- Geometry resolution is the hard limit
- Screen-space projection is too severe
- Need alternative solution (see below)

---

## IF THIS STILL ISN'T ENOUGH

### Alternative Solutions (in order of preference)

**Option 1: Troika labels as primary text**  
- Fix rendering issues (font, positioning, size)
- Make labels bigger (0.006-0.008 units instead of 0.003)
- Position them at correct GLB label locations
- This IS my current backup plan

**Option 2: Selectively scale up priority label geometry**  
- Find and slightly enlarge (`scale: 1.4-1.6`) critical label meshes:
  - HOT CUE, PAD FX1, BEAT JUMP, SAMPLER (pads)
  - PLAY, CUE (transport)
  - TRIM, HI, MID, LOW, CFX (mixer)
  - BEAT FX, ON/OFF, LEVEL/DEPTH (FX)
- Risk: May look inconsistent or break if labels are part of larger meshes

**Option 3: Higher-resolution replacement geometry**  
- Create new text meshes with more vertices/detail
- Replace lowest-res label meshes in runtime
- Technical complexity: High

**Option 4: Screen-space label projection**  
- Render labels as 2D canvas overlays aligned to 3D positions
- Similar to current overlay system but styled to look "printed"
- User said overlay is acceptable but wants physical improvement first

---

## WHAT I'M TESTING NOW

1. **Extreme emissive boost** (5-6x) on GLB labels
2. **Exposure increase** (+18%) for overall brightness
3. **Troika label system** as backup (fixed font issue)

### Verification Needed

- [ ] Open http://localhost:5175/ in browser
- [ ] Check browser console for troika errors
- [ ] Inspect GLB labels WITHOUT overlay - are they noticeably brighter?
- [ ] Enable overlay - is it still working correctly?
- [ ] Check if controller looks overexposed/washed out
- [ ] Capture before/after screenshots

---

## ACCEPTANCE REALITY CHECK

**What "success" looks like**:
- Major control names (HOT CUE, PLAY, CUE, TRIM, HI/MID/LOW, CFX, BEAT FX, ON/OFF) should be **identifiable** without squinting
- Labels don't need to be perfectly crisp, just **readable enough** to orient a user
- Controller should still look **premium and dark**, not flat/cartoon/washed
- Overlay system provides **backup clarity** for all labels

**Hard truth**:
- Tiny auxiliary labels (pad secondary text, small utility labels) may NEVER be perfectly readable due to geometry limits
- This is acceptable as long as priority labels improve
- User explicitly said overlay can stay - we just need physical labels to be "noticeably better"

---

## FILES MODIFIED THIS SESSION

1. `src/three/ddj-flx4/visualCalibration.ts`
   - Emissive: 2.8/3.0 → 5.0/6.0
   - Emissive color: #f8fcff → #ffffff
   - Roughness: 0.35 → 0.25

2. `src/three/ddj-flx4/ThreeScene.tsx`
   - Exposure: 1.7 → 2.0

3. `src/three/ddj-flx4/SurfaceLabels.ts`
   - Fixed font path (null instead of missing font)
   - Added debug logging

4. `src/three/ddj-flx4/surfaceLabelConfig.ts`
   - Troika label positions (from previous session)

---

## NEXT STEPS

1. Refresh browser at http://localhost:5175/
2. Inspect console for errors
3. Visually assess label brightness
4. If GLB labels now readable → SUCCESS
5. If still too dim → Try option 1-4 above
6. Capture screenshots for documentation
7. Write honest final report

---

**Status**: Code changes deployed, awaiting visual verification  
**Confidence**: Medium - This should make labels significantly brighter  
**Fallback**: Troika system ready if geometry labels hit physical limit

