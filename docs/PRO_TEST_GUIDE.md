# Professional Acceptance Test Guide

## Setup

1. Run `npm run dev` and open the local Vite URL.
2. Open **Music Library** and import two different audio files.
3. Load one file to Deck A and the other to Deck B.
4. Use the toolbar **Labels Off/Minimal/Full** control when identifying 3D
   controls. The overlay is visual-only and does not block pointer interaction.
5. Enable **Tester On** for implementation status labels and hover tooltips.

## Core checks

- Deck A/B: play, pause, cue, seek, tempo, jog, loop in/out, 4-beat loop, and
  loop call < / >.
- Pads: identify HOT CUE, PAD FX1, BEAT JUMP, and SAMPLER mode buttons on both
  decks. Switch Hot Cue, Beat Jump, and Sampler modes; trigger representative
  pads and verify the corresponding state/waveform response. PAD FX1 should be
  reported as not implemented.
- Mixer: trim, EQ high/mid/low, CFX, channel faders, crossfader, and master.
- FX: select effect, select target, beat -, beat +, level/depth, and on/off.
- Library: search, filter, select, load A/B, and remove.
- Appearance: change theme, add a sticker, enter sticker edit mode, drag it,
  rotate it, resize it, change finish/gloss, finish editing, and verify it no
  longer blocks controller controls in normal mode.

## Header and responsive checks

Capture or inspect these browser sizes with no horizontal scroll and no overlap
between deck metadata, A/B waveform lanes, BPM/time values, and the toolbar:

- 1920x1080 at 100% zoom
- 1728x900 at 100% zoom
- 1366x768 at 100% zoom
- 1728x900 at 90% zoom
- 1728x900 at 110% zoom

## Explicit limitations

Channel cue 1/2, master cue, headphones mix/level, mic level, and Pad FX mode
are visible in the GLB but intentionally classified as unsupported because the
current engine has no corresponding monitoring, microphone, or Pad FX behavior.
Browse encoder behavior is implemented but should be browser-verified against
the library panel. Physical DDJ-FLX4 MIDI behavior is not verified without the
hardware.

See `docs/CONTROL_MATRIX.md` for the complete classification.
