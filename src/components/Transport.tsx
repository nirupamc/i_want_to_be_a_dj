import React from 'react'
import { Action } from '../types'

interface TransportProps {
  master: { level: number }
  onAction: (a: Action) => void
}

export function Transport({ master, onAction }: TransportProps) {
  return (
    <footer className="transport">
      <div className="master">
        <label className="control">
          <span>Master</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={master.level}
            onChange={(e) => onAction({ type: 'SET_MASTER', level: Number(e.target.value) })}
          />
          <span>{(master.level * 100).toFixed(0)}%</span>
        </label>
      </div>
    </footer>
  )
}