/**
 * M11 MIDI math helpers: normalization, relative encoding, mapping.
 * Framework-independent, deterministic, testable.
 */

import type { MidiControlMode, SoftTakeoverState } from './midiTypes'

// ── Normalization ───────────────────────────────────────────────

/**
 * Convert 7-bit MIDI value (0..127) to normalized (0..1).
 */
export function midi7ToNormalized(value: number): number {
  return Math.max(0, Math.min(1, value / 127))
}

/**
 * Convert 7-bit MIDI value to bipolar (-1..+1).
 * Center = 63/64 → 0
 */
export function midi7ToBipolar(value: number): number {
  const clamped = Math.max(0, Math.min(127, value))
  return ((clamped - 63.5) / 63.5)
}

/**
 * Convert 14-bit MIDI value (0..16383) to normalized (0..1).
 */
export function midi14ToNormalized(value: number): number {
  return Math.max(0, Math.min(1, value / 16383))
}

/**
 * Map normalized value (0..1) to a target range.
 */
export function normalizedToRange(value: number, min: number, max: number): number {
  const t = Math.max(0, Math.min(1, value))
  return min + t * (max - min)
}

/**
 * Map centered MIDI value to bipolar range.
 * MIDI center (63/64) maps to 0 dB.
 * Full range: -26..+6 dB for EQ, -1..+1 for filter.
 */
export function centeredMidiToRange(value: number, min: number, max: number): number {
  const bipolar = midi7ToBipolar(value)
  // Map -1..+1 to min..max
  if (bipolar >= 0) {
    return bipolar * max
  }
  return bipolar * Math.abs(min)
}

// ── Relative Encoder Decoding ───────────────────────────────────

/**
 * Decode relative MIDI encoder value to signed delta.
 * Two's complement: 1..63 = positive, 65..127 = negative, 64 = zero.
 */
export function decodeTwosComplement(value: number): number {
  const clamped = Math.max(0, Math.min(127, value))
  if (clamped === 0 || clamped === 64) return 0
  if (clamped < 64) return clamped
  return clamped - 128 // 65..127 → -63..-1
}

/**
 * Decode relative MIDI encoder value (binary offset).
 * 0..63 = negative, 64 = zero, 65..127 = positive.
 */
export function decodeBinaryOffset(value: number): number {
  const clamped = Math.max(0, Math.min(127, value))
  return clamped - 64
}

/**
 * Decode relative encoder based on mode.
 */
export function decodeRelative(value: number, mode: 'RELATIVE_TWOS_COMPLEMENT' | 'RELATIVE_BINARY_OFFSET'): number {
  if (mode === 'RELATIVE_TWOS_COMPLEMENT') return decodeTwosComplement(value)
  return decodeBinaryOffset(value)
}

/**
 * Convert MIDI delta to angular delta (radians).
 * Applies sensitivity scaling.
 */
export function midiDeltaToRadians(delta: number, sensitivity: number = 0.01): number {
  return delta * sensitivity
}

// ── Soft Takeover ───────────────────────────────────────────────

/**
 * Check if a soft takeover should activate.
 * Returns true if the physical value has crossed the engine value.
 */
export function softTakeoverShouldActivate(
  state: SoftTakeoverState,
  physicalNormalized: number,
  threshold: number = 0.02,
): boolean {
  if (!state.waitingForPickup) return true
  return Math.abs(physicalNormalized - state.engineValue) < threshold
}

/**
 * Create initial soft takeover state.
 */
export function createSoftTakeover(engineValue: number): SoftTakeoverState {
  return {
    active: true,
    engineValue,
    waitingForPickup: true,
  }
}

/**
 * Update soft takeover engine value.
 */
export function updateSoftTakeover(
  state: SoftTakeoverState,
  newEngineValue: number,
): SoftTakeoverState {
  return {
    ...state,
    engineValue: newEngineValue,
    waitingForPickup: true,
  }
}

// ── Mapping Helpers ─────────────────────────────────────────────

/**
 * Get the effective value for a CC message based on control mode.
 */
export function getCCValue(
  value: number,
  mode: MidiControlMode,
): number {
  switch (mode) {
    case 'ABSOLUTE_7BIT':
      return midi7ToNormalized(value)
    case 'RELATIVE_TWOS_COMPLEMENT':
      return decodeTwosComplement(value)
    case 'RELATIVE_BINARY_OFFSET':
      return decodeBinaryOffset(value)
    default:
      return midi7ToNormalized(value)
  }
}

/**
 * Debounce state for button press tracking.
 */
export interface ButtonState {
  pressed: boolean
  noteOrCc: number
}

/**
 * Check if a button message should be processed (debounce).
 * Returns true if this is a new press (not a repeat).
 */
export function isButtonNewPress(state: ButtonState, noteOrCc: number, isDown: boolean): boolean {
  if (isDown) {
    if (state.pressed && state.noteOrCc === noteOrCc) return false // repeat
    state.pressed = true
    state.noteOrCc = noteOrCc
    return true
  }
  // Release
  if (state.noteOrCc === noteOrCc) {
    state.pressed = false
  }
  return false // releases don't count as "new press"
}
