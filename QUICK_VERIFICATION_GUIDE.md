# QUICK VERIFICATION GUIDE

## Immediate Steps

1. **Open Browser**
   - Navigate to: **http://localhost:5175/**
   - Use Chrome or Edge (WebGL support)
   - Press **Ctrl+F5** to hard refresh (clear cache)

2. **Check Console**
   - Press **F12** to open DevTools
   - Go to **Console** tab
   - Look for these messages:
     ```
     [SurfaceLabels] Creating 43 labels...
     [SurfaceLabels] Created left-hot-cue-label at (...)
     [SurfaceLabels] Total labels created: 43
     ```
   - **Any errors?** Note them down

3. **Visual Inspection (NO Overlay)**
   - Make sure Settings → Control Labels is **OFF**
   - Look at these areas:

   **Pad Buttons (Left/Right Decks)**:
   - [ ] Can you read "HOT CUE"?
   - [ ] Can you read "PAD FX1"?
   - [ ] Can you read "BEAT JUMP"?
   - [ ] Can you read "SAMPLER"?

   **Transport Buttons**:
   - [ ] Can you read "PLAY" (green button)?
   - [ ] Can you read "CUE" (orange button)?

   **Mixer Section (Center)**:
   - [ ] Can you read "TRIM" (top knobs)?
   - [ ] Can you read "HI" / "MID" / "LOW" (EQ knobs)?
   - [ ] Can you read "CFX" (below EQ)?

   **FX Section (Top Center)**:
   - [ ] Can you read "BEAT FX"?
   - [ ] Can you read "ON/OFF"?
   - [ ] Can you read "LEVEL/DEPTH"?

4. **Compare with Your Screenshot**
   - Are the labels **noticeably brighter** than before?
   - Do they "glow" with white light?
   - Can you identify controls without squinting?

5. **Check for Over-Brightness**
   - Does the controller still look **premium and dark**?
   - Or does it look **washed out / overexposed**?

6. **Test Interactions**
   - Click a few controls (pads, play button, knob)
   - Do they still respond correctly?
   - Is the overlay label system still working?

---

## What You Should See

### ✅ SUCCESS (Labels Readable)

**Visual signs**:
- Labels glow with bright white light (almost LED-like)
- Text is clearly visible against dark chassis
- Priority controls (HOT CUE, PLAY, CUE, TRIM, HI/MID/LOW, CFX, BEAT FX, ON/OFF) are identifiable
- Controller still looks like premium black hardware

**Console**:
- No errors
- `[SurfaceLabels] Total labels created: 43` message present

**Action**: Mark this fix as **COMPLETE** ✅

---

### ⚠️ PARTIAL (Better but Not Enough)

**Visual signs**:
- Labels are brighter than before but still hard to read
- You can see they're there but text is still fuzzy
- Some labels readable, others still too faint

**Console**:
- No errors
- Surface labels created successfully

**Action**: Implement **Option 1** (enlarge troika labels to make them primary)

---

### ❌ NO IMPROVEMENT (Same as Before)

**Visual signs**:
- Labels look exactly as dim as your screenshot
- No noticeable brightness increase

**Possible causes**:
- Browser cache not cleared (try Ctrl+Shift+R or Ctrl+F5)
- Code changes not applied (check git status)
- Console errors preventing rendering

**Action**: 
1. Check browser console for errors
2. Verify code changes: `git diff src/three/ddj-flx4/visualCalibration.ts`
3. Try disabling tone mapping (Option 3)

---

## Console Commands (for debugging)

Open browser console and try these:

```javascript
// Check if surface labels exist
window.__REFS__ = /* get refs from ThreeScene component context */

// If you can access refs somehow, try:
refs.surfaceLabels?.getStats()
// Should return: { total: 43, visible: 43, bySection: {...} }

// Check renderer settings
console.log('Exposure:', /* renderer.toneMappingExposure should be 2.0 */)
console.log('Tone Mapping:', /* should be NeutralToneMapping */)
```

---

## Screenshot Capture

If labels are improved, capture these screenshots:

1. **Full controller view** - Save as `ref/final-label-fix/full-controller.png`
2. **Pads closeup** - Save as `ref/final-label-fix/pads-closeup.png`
3. **Mixer closeup** - Save as `ref/final-label-fix/mixer-closeup.png`
4. **FX closeup** - Save as `ref/final-label-fix/fx-closeup.png`

Use Windows Snipping Tool or Snip & Sketch (Win+Shift+S)

---

## Report Back

After verification, please report:

1. ✅ / ⚠️ / ❌ Which category above describes what you see?
2. Any console errors?
3. Are labels readable or still too dim?
4. Does controller still look premium?
5. Do interactions still work?

---

## If You Need Next Steps

Based on your report, I will:
- **If SUCCESS**: Clean up debug logging, mark complete
- **If PARTIAL**: Implement Option 1 (bigger troika labels)
- **If FAILURE**: Debug errors or try Option 3 (no tone mapping)

---

**Dev Server**: http://localhost:5175/  
**Documentation**: See `docs/LABEL_FIX_FINAL_REPORT.md` for full technical details

