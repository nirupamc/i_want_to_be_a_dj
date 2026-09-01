# Pass 2 Recovery — Visual Validation Checklist

**Dev Server:** `http://localhost:5174/`  
**Date:** September 1, 2026  
**Browser:** Chrome/Edge, 100% zoom

---

## Required Screenshots

Capture these at the specified resolutions (browser viewport, not OS resolution):

### 1. Main resolutions
- [ ] `fixed-1728x900.png` — Target resolution (F12 → device toolbar → responsive → 1728×900)
- [ ] `fixed-1920x1080.png` — Desktop HD
- [ ] `fixed-1366x768.png` — Laptop minimum

### 2. Detail closeups (at 1728×900)
- [ ] `fixed-closeup-left-deck.png` — Jog, pads, transport buttons
- [ ] `fixed-closeup-mixer.png` — EQ knobs, faders, crossfader
- [ ] `fixed-labels-mode.png` — Settings → Control Labels → Full

### 3. Comparison baseline
- [ ] `before-regressed.png` — From previous session (if available)

---

## Visual Acceptance Criteria

### ✓ Overall Brightness
- [ ] Controller is **clearly brighter** than before
- [ ] Still looks like **black hardware** (not washed-out gray)
- [ ] Background is **darker than controller** (proper figure-ground)
- [ ] Blue-black crushed look is **gone or greatly reduced**

### ✓ Hardware Readability

#### Jog Wheels
- [ ] Outer rim has **visible specular highlights**
- [ ] Platter disc reads as **mid-gray graphite** (not black)
- [ ] Inner rings are **visible as concentric zones**
- [ ] Center cap is **distinguishable** from platter

#### Pads (8-pad grid on each deck)
- [ ] Grid structure is **clear**
- [ ] Bezels provide **visible borders**
- [ ] Inactive faces are **distinguishable** from bed
- [ ] Active orange glow is **strong and clear**

#### Fader Caps
- [ ] Crossfader is **brightest non-LED surface**
- [ ] Channel fader caps are **clearly above rails**
- [ ] Rail-to-slot hierarchy is **maintained**
- [ ] Caps are **visually obvious landmarks**

#### Knobs (EQ, Trim, CFX, etc.)
- [ ] Bodies are **visible as dark-gray circles**
- [ ] Top-caps produce **bright metallic rings**
- [ ] Pointer wedges are **white and visible**
- [ ] Can identify which knob is which **without labels**

#### Buttons (Play, Cue, Sync, etc.)
- [ ] Transport (Play/Cue) top faces are **clearly lighter** than utility buttons
- [ ] Button bodies are **distinguishable** from chassis
- [ ] Bezels provide **visible borders**
- [ ] Active state is **strong and obvious**

#### Mixer Center
- [ ] EQ knobs are **readable at normal distance**
- [ ] CFX section is **visible**
- [ ] Channel faders are **clear**
- [ ] Browse/load encoder is **readable**
- [ ] VU meters are **visible and animating**

### ✓ Labels

#### Physical GLB Labels
- [ ] Large labels (PLAY, CUE, section names) are **readable at mid-distance**
- [ ] Not **glowing unnaturally** (maintained realistic appearance)
- [ ] Emissive lift is **effective but subtle**

#### Overlay Label Mode (Settings → Control Labels → Full)
- [ ] Names are **clearly readable**
- [ ] Background contrast is **strong**
- [ ] Placement doesn't **block interaction**
- [ ] Deck-a/deck-b/mixer color coding is **clear**

### ✓ UI/Header Polish
- [ ] Track metadata is **clearly hierarchical** (title bold, artist muted)
- [ ] Waveforms are **framed well**
- [ ] VU meters are **visible and responding**
- [ ] Toolbar buttons are **clean and intentional**
- [ ] Overall feel is **product-like, not debug-like**

---

## Color Verification Spot Checks

Use browser DevTools Eyedropper or screenshot pixel sampler:

### Expected material luminance (approximate sRGB values)

| Surface | Expected RGB | Notes |
|---------|--------------|-------|
| Background | `#05-06` | Near-black |
| Chassis | `#2a-34` | Dark charcoal, above background |
| Jog platter | `#64-72` | Mid-gray graphite |
| Knob body | `#70-80` | Visible dark plastic |
| Pad body | `#6a-7e` | Rubber-like but readable |
| Fader rail | `#48-52` | Darker than cap, not invisible |
| Button body | `#5e-6c` | Above chassis |
| Fader cap | `#c8-e0` | Bright metallic landmark |

**Spot-check method:**
1. Open screenshot in browser/image viewer
2. Use OS color picker or browser extension
3. Sample pixel from center of surface
4. Verify value is in expected range

---

## Comparison Notes

### What should be BETTER than before:
- ✅ Overall controller brightness
- ✅ Control readability at normal distance
- ✅ Surface separation (no crushed blue-black)
- ✅ Label legibility
- ✅ Material hierarchy clarity

### What should be PRESERVED:
- ✅ Black hardware aesthetic (not gray)
- ✅ Premium product feel
- ✅ Cinematic stage presentation
- ✅ Lighting mood (dark but readable)

---

## Regression Checks

Verify no functional issues:

- [ ] Click Play button → deck starts playing
- [ ] Drag jog platter → scratch audio
- [ ] Move channel fader → volume changes
- [ ] Adjust EQ knobs → tone changes
- [ ] Click pad → hot cue triggers
- [ ] Move crossfader → mix between decks
- [ ] Click Music Library → opens file picker
- [ ] Settings → Control Labels → Minimal/Full/Off works

---

## Sign-Off

**Visual recovery accepted:** ☐ YES / ☐ NO / ☐ NEEDS ADJUSTMENT

**Notes:**
```
[Add observations here]
```

**Next steps if adjustments needed:**
- [ ] Identify specific surfaces that need tweaking
- [ ] Document target luminance values
- [ ] Apply targeted material color changes
- [ ] Re-test

**Completion criteria:**
- All acceptance checks pass
- Screenshot comparison shows clear improvement
- No functional regressions
- User can identify and use controls at normal distance

---

## Quick Browser Setup

**Chrome/Edge DevTools:**
1. Press `F12`
2. Click device toolbar icon (or `Ctrl+Shift+M`)
3. Select "Responsive" from dropdown
4. Enter resolution: `1728 × 900`
5. Ensure zoom is `100%`
6. Hide DevTools (`F12` again) to capture clean screenshot
7. Use OS screenshot tool (`Win+Shift+S` on Windows)

**Firefox Responsive Design Mode:**
1. Press `Ctrl+Shift+M`
2. Enter resolution
3. Ensure zoom is `100%`
4. Use OS screenshot tool

---

**Recovery status:** Applied +17% exposure, +50% material luminance, -60% vignette darkness  
**Test suite:** ✅ 574/574 passed  
**Technical report:** `docs/PASS_2_RECOVERY_FINAL.md`
