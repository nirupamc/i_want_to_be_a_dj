import React, { useRef, useEffect, useCallback } from 'react'
import type { WaveformData, LoopState, HotCue } from '../types'

interface WaveformDisplayProps {
  waveformData: WaveformData | null
  position: number
  duration: number
  beatGrid?: { bpm: number; firstBeatSeconds: number; beats: number[] } | null
  loop?: LoopState
  hotCues?: HotCue[]
  onClick?: (percent: number) => void
  compact?: boolean
}

const HOT_CUE_COLORS = ['#ff4444', '#ff8800', '#ffcc00', '#44ff44', '#44ccff', '#4488ff', '#aa44ff', '#ff44aa']

export function WaveformDisplay({ waveformData, position, duration, beatGrid, loop, hotCues, onClick, compact = false }: WaveformDisplayProps) {
  const overviewRef = useRef<HTMLCanvasElement>(null)
  const detailRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const drawOverview = useCallback(() => {
    const canvas = overviewRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width; const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    if (!waveformData || waveformData.peaks.length === 0) {
      ctx.fillStyle = '#20242c'
      ctx.fillRect(0, h / 2 - 1, w, 2)
      if (!compact) {
        ctx.fillStyle = '#646a75'
        ctx.font = '12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('No track loaded', w / 2, h / 2 - 6)
        ctx.textAlign = 'start'
      }
      return
    }

    const peaks = waveformData.peaks
    const posX = duration > 0 ? Math.max(0, Math.min(w, (position / duration) * w)) : 0
    const barWidth = Math.max(1, w / peaks.length)
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * w
      const peakH = peaks[i] * h * 0.8
      ctx.fillStyle = x <= posX ? '#8fd0ff' : '#2f83d8'
      ctx.fillRect(x, (h - peakH) / 2, barWidth, peakH)
    }

    if (beatGrid && duration > 0) {
      for (let i = 0; i < beatGrid.beats.length; i++) {
        const beat = beatGrid.beats[i]
        if (beat < 0 || beat > duration) continue
        const x = (beat / duration) * w
        ctx.strokeStyle = i % 4 === 0 ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.18)'
        ctx.lineWidth = i % 4 === 0 ? 1.5 : 1
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
    }

    // Loop overlay
    if (loop?.active && loop.startSeconds !== null && loop.endSeconds !== null && duration > 0) {
      const lsx = (loop.startSeconds / duration) * w
      const lex = (loop.endSeconds / duration) * w
      ctx.fillStyle = 'rgba(0, 255, 100, 0.15)'
      ctx.fillRect(lsx, 0, lex - lsx, h)
      ctx.strokeStyle = '#00ff64'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(lsx, 0); ctx.lineTo(lsx, h); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(lex, 0); ctx.lineTo(lex, h); ctx.stroke()
      ctx.fillStyle = '#00ff64'; ctx.font = '10px monospace'; ctx.fillText('LOOP', lsx + 2, 12)
    }

    // Hot cue markers
    if (hotCues && duration > 0) {
      for (const hc of hotCues) {
        if (!hc.active) continue
        const x = (hc.positionSeconds / duration) * w
        ctx.strokeStyle = HOT_CUE_COLORS[hc.index % HOT_CUE_COLORS.length]
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
        ctx.fillStyle = HOT_CUE_COLORS[hc.index % HOT_CUE_COLORS.length]
        ctx.font = 'bold 10px monospace'
        ctx.fillText(`${hc.index + 1}`, x + 2, 12)
      }
    }

    // Position indicator
    if (duration > 0) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(255, 74, 74, 0.85)'
      ctx.shadowBlur = 6
      ctx.beginPath(); ctx.moveTo(posX, 0); ctx.lineTo(posX, h); ctx.stroke()
      ctx.shadowBlur = 0
    }
  }, [waveformData, position, duration, beatGrid, loop, hotCues, compact])

  const drawDetail = useCallback(() => {
    const canvas = detailRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width; const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    if (!waveformData || waveformData.peaks.length === 0 || duration <= 0) {
      ctx.fillStyle = '#20242c'
      ctx.fillRect(0, h / 2 - 1, w, 2)
      return
    }

    const peaks = waveformData.peaks
    const pps = waveformData.pointsPerSecond
    const viewportSeconds = 4
    const startSec = Math.max(0, position - viewportSeconds / 2)
    const endSec = Math.min(duration, position + viewportSeconds / 2)
    const startIdx = Math.floor(startSec * pps)
    const endIdx = Math.ceil(endSec * pps)
    const visiblePeaks = peaks.slice(Math.max(0, startIdx), Math.min(peaks.length, endIdx))
    if (visiblePeaks.length === 0) return
    const barWidth = Math.max(1, w / visiblePeaks.length)
    for (let i = 0; i < visiblePeaks.length; i++) {
      const x = (i / visiblePeaks.length) * w
      const peakH = visiblePeaks[i] * h * 0.8
      ctx.fillStyle = i < visiblePeaks.length / 2 ? '#8fd0ff' : '#2f83d8'
      ctx.fillRect(x, (h - peakH) / 2, barWidth, peakH)
    }

    if (beatGrid) {
      for (let i = 0; i < beatGrid.beats.length; i++) {
        const beat = beatGrid.beats[i]
        if (beat < startSec || beat > endSec) continue
        const x = ((beat - startSec) / (endSec - startSec)) * w
        ctx.strokeStyle = i % 4 === 0 ? 'rgba(255, 255, 255, 0.48)' : 'rgba(255, 255, 255, 0.2)'
        ctx.lineWidth = i % 4 === 0 ? 1.5 : 1
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
    }

    // Loop boundaries
    if (loop?.active && loop.startSeconds !== null && loop.endSeconds !== null) {
      if (loop.startSeconds >= startSec && loop.startSeconds <= endSec) {
        const lx = ((loop.startSeconds - startSec) / (endSec - startSec)) * w
        ctx.strokeStyle = '#00ff64'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke()
      }
      if (loop.endSeconds >= startSec && loop.endSeconds <= endSec) {
        const lx = ((loop.endSeconds - startSec) / (endSec - startSec)) * w
        ctx.strokeStyle = '#00ff64'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke()
      }
    }

    // Hot cue markers in detail view
    if (hotCues) {
      for (const hc of hotCues) {
        if (!hc.active) continue
        if (hc.positionSeconds >= startSec && hc.positionSeconds <= endSec) {
          const x = ((hc.positionSeconds - startSec) / (endSec - startSec)) * w
          ctx.strokeStyle = HOT_CUE_COLORS[hc.index % HOT_CUE_COLORS.length]
          ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
        }
      }
    }

    // Playhead
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2
    ctx.shadowColor = 'rgba(255, 74, 74, 0.85)'
    ctx.shadowBlur = 6
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ff4444'
    ctx.beginPath(); ctx.moveTo(w / 2 - 4, 0); ctx.lineTo(w / 2 + 4, 0); ctx.lineTo(w / 2, 6); ctx.closePath(); ctx.fill()
  }, [waveformData, position, duration, beatGrid, loop, hotCues])

  useEffect(() => {
    const animate = () => { drawOverview(); drawDetail(); animRef.current = requestAnimationFrame(animate) }
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [drawOverview, drawDetail])

  const handleOverviewClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onClick || !overviewRef.current) return
      const rect = overviewRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      onClick(Math.max(0, Math.min(100, (x / rect.width) * 100)))
    },
    [onClick],
  )

  return (
    <div className={`waveform-container ${compact ? 'compact' : ''}`}>
      <canvas ref={overviewRef} width={600} height={compact ? 26 : 60} className="waveform-overview"
        onClick={handleOverviewClick} style={{ cursor: onClick ? 'pointer' : 'default' }} />
      <canvas ref={detailRef} width={600} height={compact ? 26 : 80} className="waveform-detail" />
    </div>
  )
}
