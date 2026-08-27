/**
 * M11 DDJ-FLX4 MIDI Mapping Configuration
 *
 * Mapping sources:
 * - Some mappings derived from Mixxx DDJ-FLX4 mapping
 * - Some are UNVERIFIED placeholder values that need real device capture
 * - Mark each mapping's source status clearly
 *
 * IMPORTANT: Many CC/note numbers below are educated guesses based on
 * similar Pioneer controllers. They MUST be verified against actual
 * FLX4 hardware or official documentation before claiming CONFIRMED status.
 *
 * Use the MIDI Learn/Monitor mode to capture actual values from the device.
 */

import type { MidiMapping } from '../midiTypes'

// ── Transport ─────────────────────────────────────────────────

const transport: MidiMapping[] = [
  // PLAY/PAUSE — commonly note on channel 0
  // UNVERIFIED: needs real device capture
  {
    id: 'play_a',
    description: 'Play/Pause Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x0B, // 11 — common Pioneer play button note
    controlMode: 'NOTE',
    deck: 'A',
    action: 'PLAY',
    source: 'UNVERIFIED',
    notes: 'Assumed from similar Pioneer controllers. Needs capture.',
  },
  {
    id: 'play_b',
    description: 'Play/Pause Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x0B,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'PLAY',
    source: 'UNVERIFIED',
  },

  // CUE — press/release for CUE_DOWN/CUE_UP
  {
    id: 'cue_a',
    description: 'Cue Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x0C, // 12
    controlMode: 'NOTE',
    deck: 'A',
    action: 'CUE',
    source: 'UNVERIFIED',
  },
  {
    id: 'cue_b',
    description: 'Cue Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x0C,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'CUE',
    source: 'UNVERIFIED',
  },
]

// ── Shift ─────────────────────────────────────────────────────

const shift: MidiMapping[] = [
  // FLX4 has one global shift button
  {
    id: 'shift',
    description: 'Shift Button',
    messageType: 'note',
    data1: 0x36, // 54
    controlMode: 'NOTE',
    action: 'SHIFT',
    source: 'UNVERIFIED',
  },
]

// ── Jog Wheels ────────────────────────────────────────────────

const jog: MidiMapping[] = [
  // Jog platter touch — note on/off for capacitive top
  {
    id: 'jog_touch_a',
    description: 'Jog Platter Touch Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x60, // 96 — common Pioneer jog touch
    controlMode: 'NOTE',
    deck: 'A',
    action: 'JOG_PLATTER_TOUCH',
    source: 'UNVERIFIED',
  },
  {
    id: 'jog_touch_b',
    description: 'Jog Platter Touch Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x60,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'JOG_PLATTER_TOUCH',
    source: 'UNVERIFIED',
  },

  // Jog rotation — CC relative
  {
    id: 'jog_rotate_a',
    description: 'Jog Rotation Deck A',
    messageType: 'cc',
    channel: 0,
    data1: 0x20, // 32 — jog rotation CC
    controlMode: 'RELATIVE_TWOS_COMPLEMENT',
    deck: 'A',
    action: 'JOG_ROTATE',
    source: 'UNVERIFIED',
  },
  {
    id: 'jog_rotate_b',
    description: 'Jog Rotation Deck B',
    messageType: 'cc',
    channel: 1,
    data1: 0x20,
    controlMode: 'RELATIVE_TWOS_COMPLEMENT',
    deck: 'B',
    action: 'JOG_ROTATE',
    source: 'UNVERIFIED',
  },
]

// ── Tempo Fader ───────────────────────────────────────────────

const tempo: MidiMapping[] = [
  {
    id: 'tempo_a',
    description: 'Tempo Fader Deck A',
    messageType: 'pitchbend',
    channel: 0,
    data1: 0,
    controlMode: 'ABSOLUTE_14BIT',
    deck: 'A',
    action: 'SET_TEMPO',
    source: 'UNVERIFIED',
    notes: 'Pitch bend typically used for tempo on Pioneer controllers',
  },
  {
    id: 'tempo_b',
    description: 'Tempo Fader Deck B',
    messageType: 'pitchbend',
    channel: 1,
    data1: 0,
    controlMode: 'ABSOLUTE_14BIT',
    deck: 'B',
    action: 'SET_TEMPO',
    source: 'UNVERIFIED',
  },
]

// ── Mixer Controls ────────────────────────────────────────────

const mixer: MidiMapping[] = [
  // Trim — CC per channel
  // UNVERIFIED: FLX4 CC numbers need capture
  {
    id: 'trim_a',
    description: 'Trim Gain Deck A',
    messageType: 'cc',
    channel: 0,
    data1: 0x00, // CC 0
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'A',
    action: 'SET_TRIM',
    source: 'UNVERIFIED',
  },
  {
    id: 'trim_b',
    description: 'Trim Gain Deck B',
    messageType: 'cc',
    channel: 1,
    data1: 0x00,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'B',
    action: 'SET_TRIM',
    source: 'UNVERIFIED',
  },

  // EQ High/Mid/Low
  {
    id: 'eq_high_a',
    description: 'EQ High Deck A',
    messageType: 'cc',
    channel: 0,
    data1: 0x07,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'A',
    action: 'SET_EQ_HIGH',
    source: 'UNVERIFIED',
  },
  {
    id: 'eq_high_b',
    description: 'EQ High Deck B',
    messageType: 'cc',
    channel: 1,
    data1: 0x07,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'B',
    action: 'SET_EQ_HIGH',
    source: 'UNVERIFIED',
  },
  {
    id: 'eq_mid_a',
    description: 'EQ Mid Deck A',
    messageType: 'cc',
    channel: 0,
    data1: 0x08,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'A',
    action: 'SET_EQ_MID',
    source: 'UNVERIFIED',
  },
  {
    id: 'eq_mid_b',
    description: 'EQ Mid Deck B',
    messageType: 'cc',
    channel: 1,
    data1: 0x08,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'B',
    action: 'SET_EQ_MID',
    source: 'UNVERIFIED',
  },
  {
    id: 'eq_low_a',
    description: 'EQ Low Deck A',
    messageType: 'cc',
    channel: 0,
    data1: 0x09,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'A',
    action: 'SET_EQ_LOW',
    source: 'UNVERIFIED',
  },
  {
    id: 'eq_low_b',
    description: 'EQ Low Deck B',
    messageType: 'cc',
    channel: 1,
    data1: 0x09,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'B',
    action: 'SET_EQ_LOW',
    source: 'UNVERIFIED',
  },

  // Color FX (CFX) — centered bipolar
  {
    id: 'cfx_a',
    description: 'Color FX Deck A',
    messageType: 'cc',
    channel: 0,
    data1: 0x0A,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'A',
    action: 'SET_FILTER',
    source: 'UNVERIFIED',
  },
  {
    id: 'cfx_b',
    description: 'Color FX Deck B',
    messageType: 'cc',
    channel: 1,
    data1: 0x0A,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'B',
    action: 'SET_FILTER',
    source: 'UNVERIFIED',
  },

  // Channel faders — 0..1
  {
    id: 'fader_a',
    description: 'Channel Fader Deck A',
    messageType: 'cc',
    channel: 0,
    data1: 0x0B,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'A',
    action: 'SET_CHANNEL_FADER',
    source: 'UNVERIFIED',
  },
  {
    id: 'fader_b',
    description: 'Channel Fader Deck B',
    messageType: 'cc',
    channel: 1,
    data1: 0x0B,
    controlMode: 'ABSOLUTE_7BIT',
    deck: 'B',
    action: 'SET_CHANNEL_FADER',
    source: 'UNVERIFIED',
  },

  // Crossfader — shared
  {
    id: 'crossfader',
    description: 'Crossfader',
    messageType: 'cc',
    channel: 0,
    data1: 0x0C,
    controlMode: 'ABSOLUTE_7BIT',
    action: 'SET_CROSSFADER',
    source: 'UNVERIFIED',
  },

  // Master volume
  {
    id: 'master',
    description: 'Master Volume',
    messageType: 'cc',
    channel: 0,
    data1: 0x0D,
    controlMode: 'ABSOLUTE_7BIT',
    action: 'SET_MASTER',
    source: 'UNVERIFIED',
  },
]

// ── Beat Sync ─────────────────────────────────────────────────

const sync: MidiMapping[] = [
  {
    id: 'sync_a',
    description: 'Beat Sync Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x58, // 88
    controlMode: 'NOTE',
    deck: 'A',
    action: 'BEAT_SYNC',
    source: 'UNVERIFIED',
  },
  {
    id: 'sync_b',
    description: 'Beat Sync Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x58,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'BEAT_SYNC',
    source: 'UNVERIFIED',
  },
]

// ── Loop Controls ─────────────────────────────────────────────

const loops: MidiMapping[] = [
  {
    id: 'loop_in_a',
    description: 'Loop In Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x51, // 81
    controlMode: 'NOTE',
    deck: 'A',
    action: 'LOOP_IN',
    source: 'UNVERIFIED',
  },
  {
    id: 'loop_in_b',
    description: 'Loop In Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x51,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'LOOP_IN',
    source: 'UNVERIFIED',
  },
  {
    id: 'loop_out_a',
    description: 'Loop Out Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x52, // 82
    controlMode: 'NOTE',
    deck: 'A',
    action: 'LOOP_OUT',
    source: 'UNVERIFIED',
  },
  {
    id: 'loop_out_b',
    description: 'Loop Out Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x52,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'LOOP_OUT',
    source: 'UNVERIFIED',
  },
  {
    id: 'loop_exit_a',
    description: 'Loop Exit Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x53, // 83
    controlMode: 'NOTE',
    deck: 'A',
    action: 'LOOP_EXIT',
    source: 'UNVERIFIED',
  },
  {
    id: 'loop_exit_b',
    description: 'Loop Exit Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x53,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'LOOP_EXIT',
    source: 'UNVERIFIED',
  },
  {
    id: 'loop_4beat_a',
    description: '4-Beat Loop Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x54, // 84
    controlMode: 'NOTE',
    deck: 'A',
    action: 'LOOP_4_BEAT',
    source: 'UNVERIFIED',
  },
  {
    id: 'loop_4beat_b',
    description: '4-Beat Loop Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x54,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'LOOP_4_BEAT',
    source: 'UNVERIFIED',
  },
]

// ── Performance Pads ──────────────────────────────────────────
// FLX4 has 8 pads per deck, typically notes in a block

const pads: MidiMapping[] = []

for (let deckIdx = 0; deckIdx < 2; deckIdx++) {
  const deck = deckIdx === 0 ? 'A' : 'B'
  const ch = deckIdx

  // Pads 1-8 — Note On/Off
  for (let i = 0; i < 8; i++) {
    pads.push({
      id: `pad_${i + 1}_${deck.toLowerCase()}`,
      description: `Pad ${i + 1} Deck ${deck}`,
      messageType: 'note',
      channel: ch,
      data1: 0x00 + i, // Notes 0-7 — UNVERIFIED
      controlMode: 'NOTE',
      deck,
      action: 'PAD',
      source: 'UNVERIFIED',
      notes: `Pad index ${i}. Note number needs real-device capture.`,
    })
  }

  // Pad mode buttons — common FLX4 modes
  pads.push(
    {
      id: `hotcue_mode_${deck.toLowerCase()}`,
      description: `Hot Cue Mode Deck ${deck}`,
      messageType: 'note',
      channel: ch,
      data1: 0x10,
      controlMode: 'NOTE',
      deck,
      action: 'PAD_MODE_HOT_CUE',
      source: 'UNVERIFIED',
    },
    {
      id: `beatjump_mode_${deck.toLowerCase()}`,
      description: `Beat Jump Mode Deck ${deck}`,
      messageType: 'note',
      channel: ch,
      data1: 0x11,
      controlMode: 'NOTE',
      deck,
      action: 'PAD_MODE_BEAT_JUMP',
      source: 'UNVERIFIED',
    },
    {
      id: `sampler_mode_${deck.toLowerCase()}`,
      description: `Sampler Mode Deck ${deck}`,
      messageType: 'note',
      channel: ch,
      data1: 0x12,
      controlMode: 'NOTE',
      deck,
      action: 'PAD_MODE_SAMPLER',
      source: 'UNVERIFIED',
    },
  )
}

// ── Beat FX Controls ──────────────────────────────────────────

const beatFx: MidiMapping[] = [
  {
    id: 'fx_on',
    description: 'Beat FX On/Off',
    messageType: 'note',
    data1: 0x60,
    controlMode: 'NOTE',
    action: 'TOGGLE_BEAT_FX',
    source: 'UNVERIFIED',
  },
  {
    id: 'fx_select',
    description: 'Beat FX Select',
    messageType: 'cc',
    data1: 0x10,
    controlMode: 'ABSOLUTE_7BIT',
    action: 'SET_BEAT_FX_TYPE',
    source: 'UNVERIFIED',
  },
  {
    id: 'fx_beat_minus',
    description: 'Beat FX Beat Down',
    messageType: 'note',
    data1: 0x61,
    controlMode: 'NOTE',
    action: 'BEAT_FX_BEAT_MINUS',
    source: 'UNVERIFIED',
  },
  {
    id: 'fx_beat_plus',
    description: 'Beat FX Beat Up',
    messageType: 'note',
    data1: 0x62,
    controlMode: 'NOTE',
    action: 'BEAT_FX_BEAT_PLUS',
    source: 'UNVERIFIED',
  },
  {
    id: 'fx_depth',
    description: 'Beat FX Level/Depth',
    messageType: 'cc',
    data1: 0x11,
    controlMode: 'ABSOLUTE_7BIT',
    action: 'SET_BEAT_FX_DEPTH',
    source: 'UNVERIFIED',
  },
]

// ── Release FX ────────────────────────────────────────────────

const releaseFx: MidiMapping[] = [
  {
    id: 'release_fx_a',
    description: 'Release FX Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x63,
    controlMode: 'NOTE',
    deck: 'A',
    action: 'TRIGGER_RELEASE_FX',
    source: 'UNVERIFIED',
  },
  {
    id: 'release_fx_b',
    description: 'Release FX Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x63,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'TRIGGER_RELEASE_FX',
    source: 'UNVERIFIED',
  },
]

// ── Browse Encoder ────────────────────────────────────────────

const browse: MidiMapping[] = [
  {
    id: 'browse_encoder',
    description: 'Browse Encoder Rotation',
    messageType: 'cc',
    data1: 0x00,
    controlMode: 'RELATIVE_TWOS_COMPLEMENT',
    action: 'BROWSE_ENCODER',
    source: 'UNVERIFIED',
  },
  {
    id: 'browse_push',
    description: 'Browse Encoder Push',
    messageType: 'note',
    data1: 0x01,
    controlMode: 'NOTE',
    action: 'BROWSE_PUSH',
    source: 'UNVERIFIED',
  },
]

// ── Load Buttons ──────────────────────────────────────────────

const load: MidiMapping[] = [
  {
    id: 'load_a',
    description: 'Load Track to Deck A',
    messageType: 'note',
    channel: 0,
    data1: 0x02,
    controlMode: 'NOTE',
    deck: 'A',
    action: 'LOAD_SELECTED_TO_A',
    source: 'UNVERIFIED',
  },
  {
    id: 'load_b',
    description: 'Load Track to Deck B',
    messageType: 'note',
    channel: 1,
    data1: 0x02,
    controlMode: 'NOTE',
    deck: 'B',
    action: 'LOAD_SELECTED_TO_B',
    source: 'UNVERIFIED',
  },
]

// ── All Mappings ──────────────────────────────────────────────

export const DDJ_FLX4_MAPPINGS: MidiMapping[] = [
  ...transport,
  ...shift,
  ...jog,
  ...tempo,
  ...mixer,
  ...sync,
  ...loops,
  ...pads,
  ...beatFx,
  ...releaseFx,
  ...browse,
  ...load,
]

/** Device identification strings for auto-detection */
export const DDJ_FLX4_IDENTIFIERS = [
  'DDJ-FLX4',
  'DDJ-FLX 4',
  'Pioneer DJ DDJ-FLX4',
]
