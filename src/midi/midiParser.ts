/**
 * M11 MIDI Parser: framework-independent, deterministic, testable.
 * Parses raw MIDI bytes into normalized typed messages.
 */

import type { ParsedMidiMessage } from './midiTypes'

/**
 * Parse a raw MIDI message (array of bytes) into a typed message.
 * Handles Note On, Note Off, Control Change, Pitch Bend.
 * Note On with velocity 0 is normalized to Note Off.
 *
 * @param data - raw MIDI bytes
 * @returns parsed message or null if invalid/unsupported
 */
export function parseMidiMessage(data: Uint8Array | number[]): ParsedMidiMessage | null {
  if (data.length < 1) return null

  const status = data[0]
  const messageType = status & 0xf0
  const channel = status & 0x0f

  switch (messageType) {
    case 0x90: {
      // Note On — velocity 0 = Note Off
      if (data.length < 3) return null
      const note = data[1] & 0x7f
      const velocity = data[2] & 0x7f
      if (velocity === 0) {
        return { type: 'noteoff', channel, note, velocity: 0 }
      }
      return { type: 'noteon', channel, note, velocity }
    }

    case 0x80: {
      // Note Off
      if (data.length < 3) return null
      const note = data[1] & 0x7f
      const velocity = data[2] & 0x7f
      return { type: 'noteoff', channel, note, velocity }
    }

    case 0xb0: {
      // Control Change
      if (data.length < 3) return null
      const controller = data[1] & 0x7f
      const value = data[2] & 0x7f
      return { type: 'cc', channel, controller, value }
    }

    case 0xe0: {
      // Pitch Bend
      if (data.length < 3) return null
      const lsb = data[1] & 0x7f
      const msb = data[2] & 0x7f
      const value14 = (msb << 7) | lsb // 14-bit value 0..16383
      const normalized = (value14 - 8192) / 8192 // -1..+1
      return { type: 'pitchbend', channel, value14, normalized }
    }

    default:
      // Unsupported message type (System messages, etc.)
      return null
  }
}

/**
 * Get a human-readable label for a parsed MIDI message.
 */
export function formatMidiMessage(msg: ParsedMidiMessage): string {
  switch (msg.type) {
    case 'noteon':
      return `NOTE_ON ch=${msg.channel + 1} note=${msg.note} vel=${msg.velocity}`
    case 'noteoff':
      return `NOTE_OFF ch=${msg.channel + 1} note=${msg.note}`
    case 'cc':
      return `CC ch=${msg.channel + 1} ctrl=${msg.controller} val=${msg.value}`
    case 'pitchbend':
      return `PB ch=${msg.channel + 1} val=${msg.value14} (${msg.normalized.toFixed(3)})`
  }
}
