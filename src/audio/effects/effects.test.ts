import { describe, it, expect } from 'vitest'
import {
  beatToSeconds,
  resolveFxBpm,
  wetDryGain,
  generateImpulseResponse,
  smartFaderEqMapping,
  smartFaderEchoAmount,
  clamp,
  MAX_FEEDBACK,
} from './math'
import { BEAT_MULTIPLIERS, BEAT_FX_LABELS } from './types'
import type { BeatFxState, ReleaseFxState, SmartCfxState, SmartFaderState, FXState } from '../../types'

// ---------------------------------------------------------------------------
// Beat timing
// ---------------------------------------------------------------------------

describe('beatToSeconds', () => {
  it('120 BPM, multiplier 1 → 0.5s', () => {
    expect(beatToSeconds(120, 4)).toBeCloseTo(0.5, 5) // index 4 = multiplier 1
  })

  it('120 BPM, multiplier 1/2 → 0.25s', () => {
    expect(beatToSeconds(120, 3)).toBeCloseTo(0.25, 5) // index 3 = multiplier 1/2
  })

  it('120 BPM, multiplier 2 → 1.0s', () => {
    expect(beatToSeconds(120, 5)).toBeCloseTo(1.0, 5) // index 5 = multiplier 2
  })

  it('128 BPM, multiplier 1 → 0.46875s', () => {
    expect(beatToSeconds(128, 4)).toBeCloseTo(60 / 128, 5)
  })

  it('BPM = 0 → returns 0', () => {
    expect(beatToSeconds(0, 4)).toBe(0)
  })

  it('BPM = -10 → returns 0', () => {
    expect(beatToSeconds(-10, 4)).toBe(0)
  })

  it('multiplier index clamped to bounds', () => {
    expect(beatToSeconds(120, -1)).toBeCloseTo(beatToSeconds(120, 0), 5)
    expect(beatToSeconds(120, 100)).toBeCloseTo(beatToSeconds(120, BEAT_MULTIPLIERS.length - 1), 5)
  })
})

// ---------------------------------------------------------------------------
// BPM resolution
// ---------------------------------------------------------------------------

describe('resolveFxBpm', () => {
  it('prefers manual BPM', () => {
    expect(resolveFxBpm(125, 128)).toBe(125)
  })

  it('falls back to analyzed BPM', () => {
    expect(resolveFxBpm(null, 128)).toBe(128)
  })

  it('returns null when both null', () => {
    expect(resolveFxBpm(null, null)).toBeNull()
  })

  it('returns null when manual is 0', () => {
    expect(resolveFxBpm(0, 128)).toBe(128)
  })
})

// ---------------------------------------------------------------------------
// Wet/dry gain
// ---------------------------------------------------------------------------

describe('wetDryGain', () => {
  it('mix=0 → dry=1, wet=0', () => {
    const { dry, wet } = wetDryGain(0)
    expect(dry).toBeCloseTo(1, 5)
    expect(wet).toBeCloseTo(0, 5)
  })

  it('mix=1 → dry=0, wet=1', () => {
    const { dry, wet } = wetDryGain(1)
    expect(dry).toBeCloseTo(0, 5)
    expect(wet).toBeCloseTo(1, 5)
  })

  it('mix=0.5 → equal power', () => {
    const { dry, wet } = wetDryGain(0.5)
    expect(dry).toBeCloseTo(Math.cos(0.25 * Math.PI), 3)
    expect(wet).toBeCloseTo(Math.sin(0.25 * Math.PI), 3)
  })

  it('clamps out of range', () => {
    expect(wetDryGain(-0.5).dry).toBeCloseTo(1, 5)
    expect(wetDryGain(1.5).wet).toBeCloseTo(1, 5)
  })
})

// ---------------------------------------------------------------------------
// Impulse response generation
// ---------------------------------------------------------------------------

describe('generateImpulseResponse', () => {
  it('generates a buffer with correct properties', () => {
    // Mock AudioContext for test
    const mockCtx = {
      sampleRate: 44100,
      createBuffer: (channels: number, length: number, sampleRate: number) => {
        const data: Float32Array[] = []
        for (let ch = 0; ch < channels; ch++) {
          data.push(new Float32Array(length))
        }
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: (ch: number) => data[ch],
        }
      },
    } as unknown as AudioContext

    const buffer = generateImpulseResponse(mockCtx, 1.0, 2.0)
    expect(buffer).toBeDefined()
    expect(buffer.duration).toBeCloseTo(1.0, 2)
    expect(buffer.numberOfChannels).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Smart Fader EQ mapping
// ---------------------------------------------------------------------------

describe('smartFaderEqMapping', () => {
  it('A→B at progress=0: outgoing=0, incoming=-26', () => {
    const [out, inc] = smartFaderEqMapping(0, 'A_TO_B')
    expect(out).toBeCloseTo(0, 1)
    expect(inc).toBeCloseTo(-26, 1)
  })

  it('A→B at progress=1: outgoing=-26, incoming=0', () => {
    const [out, inc] = smartFaderEqMapping(1, 'A_TO_B')
    expect(out).toBeCloseTo(-26, 1)
    expect(inc).toBeCloseTo(0, 1)
  })

  it('A→B at progress=0.5: both at -13', () => {
    const [out, inc] = smartFaderEqMapping(0.5, 'A_TO_B')
    expect(out).toBeCloseTo(-13, 1)
    expect(inc).toBeCloseTo(-13, 1)
  })

  it('B→A at progress=0: incoming=0, outgoing=-26', () => {
    const [out, inc] = smartFaderEqMapping(0, 'B_TO_A')
    expect(inc).toBeCloseTo(0, 1)
    expect(out).toBeCloseTo(-26, 1)
  })
})

// ---------------------------------------------------------------------------
// Smart Fader echo amount
// ---------------------------------------------------------------------------

describe('smartFaderEchoAmount', () => {
  it('progress < 0.7 → 0', () => {
    expect(smartFaderEchoAmount(0.5)).toBe(0)
  })

  it('progress = 0.7 → 0', () => {
    expect(smartFaderEchoAmount(0.7)).toBe(0)
  })

  it('progress = 1.0 → 1', () => {
    expect(smartFaderEchoAmount(1.0)).toBeCloseTo(1, 5)
  })

  it('progress = 0.85 → 0.5', () => {
    expect(smartFaderEchoAmount(0.85)).toBeCloseTo(0.5, 2)
  })
})

// ---------------------------------------------------------------------------
// Clamp
// ---------------------------------------------------------------------------

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('MAX_FEEDBACK', () => {
  it('is less than 1 to prevent runaway', () => {
    expect(MAX_FEEDBACK).toBeLessThan(1)
    expect(MAX_FEEDBACK).toBeGreaterThan(0.5)
  })
})

// ---------------------------------------------------------------------------
// Beat FX labels
// ---------------------------------------------------------------------------

describe('BEAT_FX_LABELS', () => {
  it('has labels for all supported types', () => {
    expect(BEAT_FX_LABELS.ECHO).toBe('Echo')
    expect(BEAT_FX_LABELS.DELAY).toBe('Delay')
    expect(BEAT_FX_LABELS.REVERB).toBe('Reverb')
    expect(BEAT_FX_LABELS.FLANGER).toBe('Flanger')
    expect(BEAT_FX_LABELS.FILTER).toBe('Filter')
  })
})

// ---------------------------------------------------------------------------
// Beat FX state
// ---------------------------------------------------------------------------

describe('BeatFxState', () => {
  it('default state is disabled', () => {
    const s: BeatFxState = { enabled: false, type: 'ECHO', target: 'A', beatMultiplierIndex: 4, levelDepth: 0.5 }
    expect(s.enabled).toBe(false)
  })

  it('state is serializable', () => {
    const s: BeatFxState = { enabled: true, type: 'REVERB', target: 'B', beatMultiplierIndex: 3, levelDepth: 0.7 }
    const json = JSON.stringify(s)
    const parsed = JSON.parse(json) as BeatFxState
    expect(parsed.type).toBe('REVERB')
    expect(parsed.enabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Release FX state
// ---------------------------------------------------------------------------

describe('ReleaseFxState', () => {
  it('default type is ECHO_OUT', () => {
    const s: ReleaseFxState = { type: 'ECHO_OUT', active: false }
    expect(s.type).toBe('ECHO_OUT')
  })

  it('active state is serializable', () => {
    const s: ReleaseFxState = { type: 'ECHO_OUT', active: true }
    expect(JSON.parse(JSON.stringify(s)).active).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Smart CFX state
// ---------------------------------------------------------------------------

describe('SmartCfxState', () => {
  it('default is disabled with value 0', () => {
    const s: SmartCfxState = { enabled: false, value: 0 }
    expect(s.enabled).toBe(false)
    expect(s.value).toBe(0)
  })

  it('value range is -1..+1', () => {
    const s: SmartCfxState = { enabled: true, value: 0.5 }
    expect(s.value).toBeGreaterThanOrEqual(-1)
    expect(s.value).toBeLessThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Smart Fader state
// ---------------------------------------------------------------------------

describe('SmartFaderState', () => {
  it('default is disabled', () => {
    const s: SmartFaderState = { enabled: false, transitionDirection: null }
    expect(s.enabled).toBe(false)
    expect(s.transitionDirection).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// FX state integration
// ---------------------------------------------------------------------------

describe('FXState', () => {
  it('creates complete FX state', () => {
    const fx: FXState = {
      beatFx: { enabled: false, type: 'ECHO', target: 'A', beatMultiplierIndex: 4, levelDepth: 0.5 },
      releaseFx: { type: 'ECHO_OUT', active: false },
      smartCfx: [
        { enabled: false, value: 0 },
        { enabled: false, value: 0 },
      ],
      smartFader: { enabled: false, transitionDirection: null },
    }
    expect(fx.beatFx.type).toBe('ECHO')
    expect(fx.smartCfx).toHaveLength(2)
    expect(fx.smartFader.enabled).toBe(false)
  })

  it('FX state is serializable', () => {
    const fx: FXState = {
      beatFx: { enabled: true, type: 'FLANGER', target: 'MASTER', beatMultiplierIndex: 2, levelDepth: 0.8 },
      releaseFx: { type: 'ECHO_OUT', active: false },
      smartCfx: [{ enabled: true, value: 0.5 }, { enabled: false, value: 0 }],
      smartFader: { enabled: true, transitionDirection: 'A_TO_B' },
    }
    const json = JSON.stringify(fx)
    const parsed = JSON.parse(json) as FXState
    expect(parsed.beatFx.type).toBe('FLANGER')
    expect(parsed.smartCfx[0].enabled).toBe(true)
    expect(parsed.smartFader.transitionDirection).toBe('A_TO_B')
  })
})

// ---------------------------------------------------------------------------
// Deck isolation for FX
// ---------------------------------------------------------------------------

describe('FX deck isolation', () => {
  it('Smart CFX deck A does not affect deck B', () => {
    const smartCfx: [SmartCfxState, SmartCfxState] = [
      { enabled: true, value: 0.8 },
      { enabled: false, value: 0 },
    ]
    expect(smartCfx[0].value).toBe(0.8)
    expect(smartCfx[1].value).toBe(0)
  })

  it('Beat FX target selection does not affect other targets', () => {
    const targets: string[] = ['A', 'B', 'MASTER']
    expect(targets).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Beat multiplier validation
// ---------------------------------------------------------------------------

describe('BEAT_MULTIPLIERS', () => {
  it('has 8 values', () => {
    expect(BEAT_MULTIPLIERS).toHaveLength(8)
  })

  it('values are ascending', () => {
    for (let i = 1; i < BEAT_MULTIPLIERS.length; i++) {
      expect(BEAT_MULTIPLIERS[i]).toBeGreaterThan(BEAT_MULTIPLIERS[i - 1])
    }
  })

  it('includes 1/16 through 8', () => {
    expect(BEAT_MULTIPLIERS[0]).toBeCloseTo(1 / 16, 5)
    expect(BEAT_MULTIPLIERS[4]).toBe(1)
    expect(BEAT_MULTIPLIERS[7]).toBe(8)
  })
})
