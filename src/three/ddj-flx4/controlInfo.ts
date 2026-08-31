import { CONTROL_IDS, padId } from './controlIds'

export type ControlStatus =
  | 'VERIFIED'
  | 'IMPLEMENTED_NOT_BROWSER_VERIFIED'
  | 'UNBOUND_ENGINE_FEATURE'
  | 'NOT_IMPLEMENTED'
  | 'PHYSICAL_MIDI_UNVERIFIED'

export type ControlSection = 'deck' | 'pads' | 'mixer' | 'fx' | 'browse' | 'smart'

export interface ControlInfo {
  id: string
  shortLabel: string
  fullLabel: string
  section: ControlSection
  deck?: 'A' | 'B'
  implemented: boolean
  status: ControlStatus
  description?: string
  valueHint?: string
  priority: number
  labelMode: 'minimal' | 'full'
}

function deckInfo(side: 'left' | 'right', deck: 'A' | 'B'): ControlInfo[] {
  const ids = side === 'left' ? CONTROL_IDS.decks.left : CONTROL_IDS.decks.right
  return [
    info(ids.play, 'PLAY', 'PLAY / PAUSE', 'deck', deck, true, 'VERIFIED', 'Toggle deck playback', undefined, 95, 'minimal'),
    info(ids.cue, 'CUE', 'CUE', 'deck', deck, true, 'VERIFIED', 'Set or trigger the cue point', undefined, 94, 'minimal'),
    info(ids.shift, 'SHIFT', 'SHIFT', 'deck', deck, true, 'VERIFIED', 'Modifier for supported shifted actions', undefined, 70, 'full'),
    info(ids.sync, 'SYNC', 'BEAT SYNC', 'deck', deck, true, 'VERIFIED', 'Sync tempo and beat phase to the master deck', undefined, 78, 'full'),
    info(ids.tempo, 'TEMPO', 'TEMPO', 'deck', deck, true, 'VERIFIED', 'Adjust playback speed', 'Tempo range follows deck setting', 90, 'minimal'),
    info(ids.loopIn, 'IN', 'LOOP IN', 'deck', deck, true, 'VERIFIED', 'Set loop in point', undefined, 72, 'full'),
    info(ids.loopOut, 'OUT', 'LOOP OUT', 'deck', deck, true, 'VERIFIED', 'Set loop out point and activate loop', undefined, 72, 'full'),
    info(ids.fourBeatExit, '4 BEAT', '4 BEAT / EXIT', 'deck', deck, true, 'VERIFIED', 'Start or exit a 4-beat loop', undefined, 74, 'full'),
    info(ids.callLeft, 'CALL <', 'CUE / LOOP CALL <', 'deck', deck, true, 'VERIFIED', 'Halve active loop length', undefined, 62, 'full'),
    info(ids.callRight, 'CALL >', 'CUE / LOOP CALL >', 'deck', deck, true, 'VERIFIED', 'Double active loop length', undefined, 62, 'full'),
    info(ids.hotCueMode, 'HOT CUE', 'HOT CUE', 'pads', deck, true, 'VERIFIED', 'Select hot cue pad mode', 'Shift: clear hot cue via pad', 100, 'minimal'),
    info(ids.padFx1Mode, 'PAD FX1', 'PAD FX1', 'pads', deck, false, 'NOT_IMPLEMENTED', 'Pad FX mode is visible but not implemented in the browser engine', undefined, 99, 'minimal'),
    info(ids.beatJumpMode, 'BEAT JUMP', 'BEAT JUMP', 'pads', deck, true, 'VERIFIED', 'Select beat jump pad mode', undefined, 98, 'minimal'),
    info(ids.samplerMode, 'SAMPLER', 'SAMPLER', 'pads', deck, true, 'VERIFIED', 'Select global sampler pad mode', 'Shift: stop sampler slot', 97, 'minimal'),
    info(ids.jog, 'JOG', 'JOG WHEEL', 'deck', deck, true, 'VERIFIED', 'Scratch on platter, nudge on rim', undefined, 58, 'full'),
    info(`${ids.jog}.rim`, 'RIM', 'JOG RIM', 'deck', deck, true, 'VERIFIED', 'Pitch bend / nudge', undefined, 54, 'full'),
    ...Array.from({ length: 8 }, (_, i) =>
      info(padId(side, i + 1), `PAD ${i + 1}`, `PAD ${i + 1}`, 'pads', deck, true, 'VERIFIED', 'Pad action follows the selected pad mode', undefined, 50 - i, 'full')
    ),
  ]
}

function info(
  id: string,
  shortLabel: string,
  fullLabel: string,
  section: ControlSection,
  deck: 'A' | 'B' | undefined,
  implemented: boolean,
  status: ControlStatus,
  description: string,
  valueHint: string | undefined,
  priority: number,
  labelMode: 'minimal' | 'full',
): ControlInfo {
  return { id, shortLabel, fullLabel, section, deck, implemented, status, description, valueHint, priority, labelMode }
}

export const CONTROL_INFO: ControlInfo[] = [
  ...deckInfo('left', 'A'),
  ...deckInfo('right', 'B'),
  info(CONTROL_IDS.mixer.channel1.trim, 'TRIM', 'TRIM', 'mixer', 'A', true, 'VERIFIED', 'Adjust Deck A input gain', '-12 dB to +12 dB', 86, 'minimal'),
  info(CONTROL_IDS.mixer.channel1.eqHigh, 'HIGH', 'HIGH EQ', 'mixer', 'A', true, 'VERIFIED', 'Deck A high EQ', '-26 dB to +6 dB', 84, 'minimal'),
  info(CONTROL_IDS.mixer.channel1.eqMid, 'MID', 'MID EQ', 'mixer', 'A', true, 'VERIFIED', 'Deck A mid EQ', '-26 dB to +6 dB', 83, 'minimal'),
  info(CONTROL_IDS.mixer.channel1.eqLow, 'LOW', 'LOW EQ', 'mixer', 'A', true, 'VERIFIED', 'Deck A low EQ', '-26 dB to +6 dB', 82, 'minimal'),
  info(CONTROL_IDS.mixer.channel1.cfx, 'CFX', 'CFX', 'mixer', 'A', true, 'VERIFIED', 'Deck A filter / color effect', 'Low-pass to high-pass', 80, 'minimal'),
  info(CONTROL_IDS.mixer.channel1.fader, 'CH 1', 'CHANNEL 1 FADER', 'mixer', 'A', true, 'VERIFIED', 'Deck A channel volume', '0 to 100%', 88, 'minimal'),
  info(CONTROL_IDS.mixer.channel1.cue, 'CUE 1', 'CHANNEL 1 CUE', 'mixer', 'A', false, 'UNBOUND_ENGINE_FEATURE', 'Headphone cue routing is not implemented', undefined, 45, 'full'),
  info(CONTROL_IDS.mixer.channel2.trim, 'TRIM', 'TRIM', 'mixer', 'B', true, 'VERIFIED', 'Adjust Deck B input gain', '-12 dB to +12 dB', 86, 'minimal'),
  info(CONTROL_IDS.mixer.channel2.eqHigh, 'HIGH', 'HIGH EQ', 'mixer', 'B', true, 'VERIFIED', 'Deck B high EQ', '-26 dB to +6 dB', 84, 'minimal'),
  info(CONTROL_IDS.mixer.channel2.eqMid, 'MID', 'MID EQ', 'mixer', 'B', true, 'VERIFIED', 'Deck B mid EQ', '-26 dB to +6 dB', 83, 'minimal'),
  info(CONTROL_IDS.mixer.channel2.eqLow, 'LOW', 'LOW EQ', 'mixer', 'B', true, 'VERIFIED', 'Deck B low EQ', '-26 dB to +6 dB', 82, 'minimal'),
  info(CONTROL_IDS.mixer.channel2.cfx, 'CFX', 'CFX', 'mixer', 'B', true, 'VERIFIED', 'Deck B filter / color effect', 'Low-pass to high-pass', 80, 'minimal'),
  info(CONTROL_IDS.mixer.channel2.fader, 'CH 2', 'CHANNEL 2 FADER', 'mixer', 'B', true, 'VERIFIED', 'Deck B channel volume', '0 to 100%', 88, 'minimal'),
  info(CONTROL_IDS.mixer.channel2.cue, 'CUE 2', 'CHANNEL 2 CUE', 'mixer', 'B', false, 'UNBOUND_ENGINE_FEATURE', 'Headphone cue routing is not implemented', undefined, 45, 'full'),
  info(CONTROL_IDS.mixer.crossfader, 'CROSSFADER', 'CROSSFADER', 'mixer', undefined, true, 'VERIFIED', 'Equal-power blend between Deck A and Deck B', 'A to B', 92, 'minimal'),
  info(CONTROL_IDS.mixer.master.level, 'MASTER', 'MASTER LEVEL', 'mixer', undefined, true, 'VERIFIED', 'Master output level', '0 to 100%', 76, 'minimal'),
  info(CONTROL_IDS.mixer.master.cue, 'MASTER CUE', 'MASTER CUE', 'mixer', undefined, false, 'UNBOUND_ENGINE_FEATURE', 'Master headphone cue is not implemented', undefined, 44, 'full'),
  info(CONTROL_IDS.mixer.headphones.mix, 'HP MIX', 'HEADPHONES MIX', 'mixer', undefined, false, 'UNBOUND_ENGINE_FEATURE', 'Headphone mix bus is not implemented', undefined, 65, 'minimal'),
  info(CONTROL_IDS.mixer.headphones.level, 'HP LEVEL', 'HEADPHONES LEVEL', 'mixer', undefined, false, 'UNBOUND_ENGINE_FEATURE', 'Headphone output bus is not implemented', undefined, 64, 'minimal'),
  info(CONTROL_IDS.mixer.mic.level, 'MIC', 'MIC LEVEL', 'mixer', undefined, false, 'UNBOUND_ENGINE_FEATURE', 'Microphone input is not implemented', undefined, 60, 'minimal'),
  info(CONTROL_IDS.fx.select, 'FX SELECT', 'BEAT FX SELECT', 'fx', undefined, true, 'VERIFIED', 'Select Beat FX type', 'Echo, delay, reverb, flanger, filter', 82, 'minimal'),
  info(CONTROL_IDS.fx.beatLeft, 'BEAT -', 'BEAT -', 'fx', undefined, true, 'VERIFIED', 'Decrease Beat FX multiplier', undefined, 79, 'minimal'),
  info(CONTROL_IDS.fx.beatRight, 'BEAT +', 'BEAT +', 'fx', undefined, true, 'VERIFIED', 'Increase Beat FX multiplier', undefined, 79, 'minimal'),
  info(CONTROL_IDS.fx.levelDepth, 'DEPTH', 'LEVEL / DEPTH', 'fx', undefined, true, 'VERIFIED', 'Beat FX wet/dry depth', '0 to 100%', 81, 'minimal'),
  info(CONTROL_IDS.fx.onOff, 'FX ON', 'BEAT FX ON / OFF', 'fx', undefined, true, 'VERIFIED', 'Toggle Beat FX', undefined, 80, 'minimal'),
  info(CONTROL_IDS.fx.channelSelect, 'TARGET', 'BEAT FX TARGET', 'fx', undefined, true, 'VERIFIED', 'Select Beat FX target channel', 'A, B, or master', 68, 'full'),
  info(CONTROL_IDS.browse.encoder, 'BROWSE', 'BROWSE', 'browse', undefined, true, 'IMPLEMENTED_NOT_BROWSER_VERIFIED', 'Move library selection', undefined, 89, 'minimal'),
  info(CONTROL_IDS.browse.load1, 'LOAD A', 'LOAD A', 'browse', 'A', true, 'VERIFIED', 'Load selected library track to Deck A', undefined, 91, 'minimal'),
  info(CONTROL_IDS.browse.load2, 'LOAD B', 'LOAD B', 'browse', 'B', true, 'VERIFIED', 'Load selected library track to Deck B', undefined, 91, 'minimal'),
  info(CONTROL_IDS.mixer.smartCfx, 'SMART CFX', 'SMART CFX', 'smart', undefined, true, 'VERIFIED', 'Toggle smart color FX macro', undefined, 48, 'full'),
  info(CONTROL_IDS.mixer.smartFader, 'SMART FADER', 'SMART FADER', 'smart', undefined, true, 'VERIFIED', 'Toggle smart fader automation', undefined, 48, 'full'),
]

export const CONTROL_INFO_BY_ID = new Map(CONTROL_INFO.map((entry) => [entry.id, entry]))
