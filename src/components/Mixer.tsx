import React from 'react'
import { Action, MixerState } from '../types'

interface MixerProps {
  mixer: MixerState
  onAction: (a: Action) => void
}

function TrimKnob({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="control">
      <span>{label}</span>
      <input
        type="range"
        min={-70}
        max={9}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="eq-val">{value > 0 ? '+' : ''}{value} dB</span>
    </label>
  )
}

function EQKnob({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="control">
      <span>{label}</span>
      <input
        type="range"
        min={-26}
        max={6}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="eq-val">{value > 0 ? '+' : ''}{value}</span>
    </label>
  )
}

function FilterKnob({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="control">
      <span>{label}</span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="eq-val">{value.toFixed(2)}</span>
    </label>
  )
}

function MeterBar({ level }: { level: number }) {
  const pct = Math.max(0, Math.min(100, level * 100))
  return (
    <div className="meter">
      <div
        className="meter-fill"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Mixer({ mixer, onAction }: MixerProps) {
  const ch0 = mixer.channels[0]
  const ch1 = mixer.channels[1]

  return (
    <div className="mixer">
      <header className="deck-head">
        <span className="deck-label">MIXER</span>
      </header>

      <div className="channel-section">
        <span className="channel-label">CH 1</span>
        <TrimKnob
          label="TRIM"
          value={ch0.trimDb}
          onChange={(v) => onAction({ type: 'SET_TRIM', deck: 0, db: v })}
        />
        <EQKnob
          label="HI"
          value={ch0.eqHighDb}
          onChange={(v) => onAction({ type: 'SET_EQ_HIGH', deck: 0, db: v })}
        />
        <EQKnob
          label="MID"
          value={ch0.eqMidDb}
          onChange={(v) => onAction({ type: 'SET_EQ_MID', deck: 0, db: v })}
        />
        <EQKnob
          label="LOW"
          value={ch0.eqLowDb}
          onChange={(v) => onAction({ type: 'SET_EQ_LOW', deck: 0, db: v })}
        />
        <FilterKnob
          label="CFX"
          value={ch0.filter}
          onChange={(v) => onAction({ type: 'SET_FILTER', deck: 0, p: v })}
        />
        <MeterBar level={ch0.meter} />
        <label className="control vertical">
          <span>FADER</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={ch0.channelFader}
            onChange={(e) =>
              onAction({ type: 'SET_CHANNEL_FADER', deck: 0, fader: Number(e.target.value) })
            }
          />
          <span>{(ch0.channelFader * 100).toFixed(0)}%</span>
        </label>
      </div>

      <div className="channel-section">
        <span className="channel-label">CH 2</span>
        <TrimKnob
          label="TRIM"
          value={ch1.trimDb}
          onChange={(v) => onAction({ type: 'SET_TRIM', deck: 1, db: v })}
        />
        <EQKnob
          label="HI"
          value={ch1.eqHighDb}
          onChange={(v) => onAction({ type: 'SET_EQ_HIGH', deck: 1, db: v })}
        />
        <EQKnob
          label="MID"
          value={ch1.eqMidDb}
          onChange={(v) => onAction({ type: 'SET_EQ_MID', deck: 1, db: v })}
        />
        <EQKnob
          label="LOW"
          value={ch1.eqLowDb}
          onChange={(v) => onAction({ type: 'SET_EQ_LOW', deck: 1, db: v })}
        />
        <FilterKnob
          label="CFX"
          value={ch1.filter}
          onChange={(v) => onAction({ type: 'SET_FILTER', deck: 1, p: v })}
        />
        <MeterBar level={ch1.meter} />
        <label className="control vertical">
          <span>FADER</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={ch1.channelFader}
            onChange={(e) =>
              onAction({ type: 'SET_CHANNEL_FADER', deck: 1, fader: Number(e.target.value) })
            }
          />
          <span>{(ch1.channelFader * 100).toFixed(0)}%</span>
        </label>
      </div>

      <div className="crossfader">
        <label className="control">
          <span>Crossfader</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={mixer.crossfader}
            onChange={(e) =>
              onAction({ type: 'SET_CROSSFADER', x: Number(e.target.value) })
            }
          />
        </label>
        <div className="xf-gains">
          <span>A: {Math.cos((mixer.crossfader * Math.PI) / 2).toFixed(3)}</span>
          <span>B: {Math.sin((mixer.crossfader * Math.PI) / 2).toFixed(3)}</span>
        </div>
      </div>

      <label className="control">
        <span>Master</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={mixer.master}
          onChange={(e) =>
            onAction({ type: 'SET_MASTER', level: Number(e.target.value) })
          }
        />
        <span>{(mixer.master * 100).toFixed(0)}%</span>
      </label>
    </div>
  )
}
