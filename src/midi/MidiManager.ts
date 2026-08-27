/**
 * M11 MidiManager: Web MIDI API integration.
 *
 * Responsibilities:
 * - Feature detection
 * - Permission request
 * - Device discovery / enumeration
 * - Hot-plug / disconnect handling
 * - Raw message routing to MidiMapper
 * - Bounded message monitor
 * - Learn mode
 * - Cleanup / destroy
 *
 * Does NOT:
 * - Know about DDJ-FLX4 specifics (that's MidiMapper's job)
 * - Store MIDIInput/MIDIOutput in serializable state
 */

import type { ParsedMidiMessage, MidiState, MidiDeviceInfo, MidiMonitorEntry, MidiMapping } from './midiTypes'
import { parseMidiMessage } from './midiParser'
import { MidiMapper } from './MidiMapper'

const MAX_MONITOR_ENTRIES = 100

interface MidiManagerCallbacks {
  onStateChange: (state: MidiState) => void
  onAction: (action: { type: string; [key: string]: unknown }) => void
  onMonitorEntry: (entry: MidiMonitorEntry) => void
}

export class MidiManager {
  private midiAccess: MIDIAccess | null = null
  private selectedInput: MIDIInput | null = null
  private selectedOutput: MIDIOutput | null = null
  private mapper: MidiMapper
  private callbacks: MidiManagerCallbacks

  private _state: MidiState = {
    supported: typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess,
    permission: 'unknown',
    connected: false,
    selectedInputId: null,
    selectedInputName: null,
    selectedOutputId: null,
    inputs: [],
    outputs: [],
    learnMode: false,
    learnTarget: null,
    learnCapture: null,
  }

  private monitorBuffer: MidiMonitorEntry[] = []
  private learnResolve: ((msg: ParsedMidiMessage) => void) | null = null

  private static defaultChannel = { trimDb: 0, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, filter: 0, channelFader: 1 } as const

  private getStateGetter = () => {
    const ch = MidiManager.defaultChannel
    return {
      decks: [
        { tempoPercent: 0 },
        { tempoPercent: 0 },
      ] as [{ tempoPercent: number }, { tempoPercent: number }],
      mixer: {
        crossfader: 0.5,
        master: 0.8,
        channels: [
          { ...ch },
          { ...ch },
        ] as [{ trimDb: number; eqLowDb: number; eqMidDb: number; eqHighDb: number; filter: number; channelFader: number }, { trimDb: number; eqLowDb: number; eqMidDb: number; eqHighDb: number; filter: number; channelFader: number }],
      },
    }
  }

  constructor(
    mappings: MidiMapping[],
    callbacks: MidiManagerCallbacks,
  ) {
    this.mapper = new MidiMapper(
      mappings,
      (action) => callbacks.onAction(action),
      this.getStateGetter,
    )
    this.callbacks = callbacks
  }

  /** Current serializable state snapshot */
  get state(): Readonly<MidiState> {
    return this._state
  }

  /** Supported check */
  get supported(): boolean {
    return this._state.supported
  }

  // ── Permission & Initialization ──────────────────────────────

  /** Request MIDI access on user gesture */
  async enable(): Promise<boolean> {
    if (!this._state.supported) {
      this.updateState({ permission: 'denied' })
      return false
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false })
      this.updateState({ permission: 'granted' })

      // Listen for hot-plug
      this.midiAccess.onstatechange = () => this.handleStateChange()

      // Enumerate devices
      this.refreshDeviceList()

      // Auto-detect FLX4
      this.autoDetectFlx4()

      return true
    } catch {
      this.updateState({ permission: 'denied' })
      return false
    }
  }

  /** Refresh the device list */
  refreshDeviceList(): void {
    if (!this.midiAccess) return

    const inputs: MidiDeviceInfo[] = []
    const outputs: MidiDeviceInfo[] = []

    this.midiAccess.inputs.forEach((input) => {
      inputs.push({
        id: input.id,
        name: input.name ?? null,
        manufacturer: input.manufacturer ?? null,
        state: input.state === 'connected' ? 'connected' : 'disconnected',
        connection: input.connection,
      })
    })

    this.midiAccess.outputs.forEach((output) => {
      outputs.push({
        id: output.id,
        name: output.name ?? null,
        manufacturer: output.manufacturer ?? null,
        state: output.state === 'connected' ? 'connected' : 'disconnected',
        connection: output.connection,
      })
    })

    this.updateState({ inputs, outputs })
  }

  /** Auto-detect DDJ-FLX4 by name */
  private autoDetectFlx4(): void {
    if (!this.midiAccess) return

    const flx4Ids = ['DDJ-FLX4', 'DDJ-FLX 4', 'Pioneer DJ DDJ-FLX4']

    for (const input of this.midiAccess.inputs.values()) {
      if (input.name && flx4Ids.some(id => input.name!.includes(id))) {
        this.selectInput(input.id)
        return
      }
    }
  }

  /** Select an input device by ID */
  selectInput(deviceId: string): void {
    if (!this.midiAccess) return

    // Disconnect previous
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null
    }

    const input = this.midiAccess.inputs.get(deviceId)
    if (!input) return

    this.selectedInput = input
    input.onmidimessage = (event) => this.handleMidiMessage(event)

    this.updateState({
      selectedInputId: deviceId,
      selectedInputName: input.name ?? null,
      connected: true,
    })
  }

  /** Select an output device by ID */
  selectOutput(deviceId: string): void {
    if (!this.midiAccess) return

    const output = this.midiAccess.outputs.get(deviceId)
    if (!output) return

    this.selectedOutput = output
    this.updateState({ selectedOutputId: deviceId })
  }

  // ── Message Handling ─────────────────────────────────────────

  private handleMidiMessage(event: MIDIMessageEvent): void {
    if (!event.data) return

    const data = new Uint8Array(event.data)
    const parsed = parseMidiMessage(data)

    if (!parsed) return

    const isLearn = this._state.learnMode
    const deviceId = this.selectedInput?.id ?? ''

    // Monitor entry
    const entry: MidiMonitorEntry = {
      timestamp: Date.now(),
      raw: data,
      parsed,
      deviceId,
      mapped: false,
    }

    // Learn mode: capture and resolve
    if (isLearn && this.learnResolve) {
      this.learnResolve(parsed)
      this.learnResolve = null
      entry.mapped = true
    }

    // Map to engine action (processMessage dispatches internally)
    const matched = this.mapper.processMessage(parsed)
    if (matched) {
      entry.mapped = true
    }

    // Add to monitor buffer
    this.addToMonitor(entry)
  }

  // ── Monitor ──────────────────────────────────────────────────

  private addToMonitor(entry: MidiMonitorEntry): void {
    this.monitorBuffer.push(entry)
    if (this.monitorBuffer.length > MAX_MONITOR_ENTRIES) {
      this.monitorBuffer.shift()
    }
    this.callbacks.onMonitorEntry(entry)
  }

  getMonitorEntries(): readonly MidiMonitorEntry[] {
    return this.monitorBuffer
  }

  clearMonitor(): void {
    this.monitorBuffer = []
  }

  // ── Learn Mode ───────────────────────────────────────────────

  /** Enter learn mode — returns next MIDI message as a Promise */
  startLearn(target: string): Promise<ParsedMidiMessage> {
    this.updateState({ learnMode: true, learnTarget: target, learnCapture: null })

    return new Promise((resolve) => {
      this.learnResolve = (msg) => {
        this.updateState({ learnMode: false, learnTarget: null, learnCapture: msg })
        resolve(msg)
      }
    })
  }

  /** Cancel learn mode */
  cancelLearn(): void {
    this.learnResolve = null
    this.updateState({ learnMode: false, learnTarget: null, learnCapture: null })
  }

  // ── State Change / Disconnect ────────────────────────────────

  private handleStateChange(): void {
    this.refreshDeviceList()

    // Check if selected input is still connected
    if (this.selectedInput && this.selectedInput.state === 'disconnected') {
      this.handleDisconnect()
    }
  }

  /** Clean up all held states on disconnect */
  private handleDisconnect(): void {
    this.selectedInput = null
    this.updateState({
      connected: false,
      selectedInputId: null,
      selectedInputName: null,
    })

    // Force cleanup of all held states through the mapper
    this.mapper.resetAll()

    // Cancel any learn
    this.cancelLearn()
  }

  /** Manually disconnect / disable */
  disconnect(): void {
    this.handleDisconnect()
  }

  // ── Output ───────────────────────────────────────────────────

  /** Send MIDI output message (for LED feedback) */
  sendOutput(data: Uint8Array): void {
    if (this.selectedOutput) {
      this.selectedOutput.send(data)
    }
  }

  // ── Validation ───────────────────────────────────────────────

  /** Validate a mapping set for conflicts */
  static validateMappings(mappings: MidiMapping[]): string[] {
    const errors: string[] = []
    const seen = new Set<string>()

    for (const m of mappings) {
      const key = `${m.messageType}:${m.channel ?? '*'}:${m.data1}:${m.deck ?? '*'}`
      if (seen.has(key)) {
        errors.push(`Duplicate mapping signature: ${key} (${m.id})`)
      }
      seen.add(key)

      if (m.channel !== undefined && (m.channel < 0 || m.channel > 15)) {
        errors.push(`Invalid channel ${m.channel} in mapping ${m.id}`)
      }
      if (m.data1 < 0 || m.data1 > 127) {
        errors.push(`Invalid data1 ${m.data1} in mapping ${m.id}`)
      }
    }

    return errors
  }

  // ── Helpers ──────────────────────────────────────────────────

  private updateState(partial: Partial<MidiState>): void {
    this._state = { ...this._state, ...partial }
    this.callbacks.onStateChange(this._state)
  }

  /** Cleanup */
  destroy(): void {
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null
    }
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null
    }
    this.cancelLearn()
    this.mapper.resetAll()
    this.monitorBuffer = []
    this.selectedInput = null
    this.selectedOutput = null
    this.midiAccess = null
  }
}
