/**
 * M11 MIDI types.
 * All types are serializable — no MIDIInput/MIDIOutput browser objects.
 */

// ── Parsed Messages ─────────────────────────────────────────────

export type ParsedMidiMessage =
  | { type: 'noteon'; channel: number; note: number; velocity: number }
  | { type: 'noteoff'; channel: number; note: number; velocity: number }
  | { type: 'cc'; channel: number; controller: number; value: number }
  | { type: 'pitchbend'; channel: number; value14: number; normalized: number }

// ── Device Info ─────────────────────────────────────────────────

export interface MidiDeviceInfo {
  id: string
  name: string | null
  manufacturer: string | null
  state: 'connected' | 'disconnected'
  connection: string
}

// ── MIDI State ──────────────────────────────────────────────────

export type MidiPermission = 'unknown' | 'granted' | 'denied'

export interface MidiState {
  supported: boolean
  permission: MidiPermission
  connected: boolean
  selectedInputId: string | null
  selectedInputName: string | null
  selectedOutputId: string | null
  inputs: MidiDeviceInfo[]
  outputs: MidiDeviceInfo[]
  learnMode: boolean
  learnTarget: string | null
  learnCapture: ParsedMidiMessage | null
}

// ── Mapping Types ───────────────────────────────────────────────

export type MidiControlMode =
  | 'ABSOLUTE_7BIT'
  | 'ABSOLUTE_14BIT'
  | 'RELATIVE_TWOS_COMPLEMENT'
  | 'RELATIVE_BINARY_OFFSET'
  | 'NOTE'

export type MappingSource = 'OFFICIAL_MANUAL' | 'MIXXX_MAPPING' | 'CAPTURED_DEVICE' | 'UNVERIFIED'

export interface MidiMapping {
  id: string
  description: string
  messageType: 'cc' | 'note' | 'pitchbend'
  channel?: number // undefined = any channel
  data1: number
  controlMode: MidiControlMode
  deck?: 'A' | 'B'
  action: string
  source: MappingSource
  notes?: string
  softTakeover?: boolean
}

// ── Monitor ─────────────────────────────────────────────────────

export interface MidiMonitorEntry {
  timestamp: number
  raw: Uint8Array
  parsed: ParsedMidiMessage | null
  deviceId: string
  mapped: boolean
}

// ── Soft Takeover State ─────────────────────────────────────────

export interface SoftTakeoverState {
  active: boolean
  engineValue: number
  waitingForPickup: boolean
}
