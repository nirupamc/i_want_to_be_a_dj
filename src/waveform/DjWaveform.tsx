import { useCallback, useEffect, useRef, useState } from 'react'
import type { HotCue, LoopState, WaveformData } from '../types'
import {
  beatGridMarkers,
  detailWindow,
  hotCueMarkers,
  loopRegion,
  overviewWindow,
  timeToX,
  xToTime,
  type TimeWindow,
} from './beatOverlay'
import { WAVEFORM_THEME } from './waveformTheme'

interface DjWaveformProps {
  deck: 0 | 1
  variant: 'overview' | 'detail'
  waveformData: WaveformData | null
  position: number
  duration: number
  beatGrid?: { bpm: number; firstBeatSeconds: number; beats: number[] } | null
  loop?: LoopState
  hotCues?: HotCue[]
  onSeek?: (seconds: number) => void
}

interface CanvasSize {
  cssWidth: number
  cssHeight: number
  pixelWidth: number
  pixelHeight: number
}

const DETAIL_SECONDS = 8

function resizeCanvas(canvas: HTMLCanvasElement, size: CanvasSize): void {
  if (canvas.width !== size.pixelWidth || canvas.height !== size.pixelHeight) {
    canvas.width = size.pixelWidth
    canvas.height = size.pixelHeight
  }
}

function setupCanvas(ctx: CanvasRenderingContext2D, size: CanvasSize): void {
  ctx.setTransform(size.pixelWidth / size.cssWidth, 0, 0, size.pixelHeight / size.cssHeight, 0, 0)
  ctx.clearRect(0, 0, size.cssWidth, size.cssHeight)
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, WAVEFORM_THEME.backgroundTop)
  gradient.addColorStop(1, WAVEFORM_THEME.backgroundBottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = WAVEFORM_THEME.laneLine
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, Math.round(height / 2) + 0.5)
  ctx.lineTo(width, Math.round(height / 2) + 0.5)
  ctx.stroke()
}

function peakRange(waveformData: WaveformData, startSeconds: number, endSeconds: number): { max: number; rms: number } {
  const start = Math.max(0, Math.floor(startSeconds * waveformData.pointsPerSecond))
  const end = Math.min(waveformData.peaks.length, Math.ceil(endSeconds * waveformData.pointsPerSecond))
  let max = 0
  let rmsSum = 0
  let rmsCount = 0
  for (let index = start; index < end; index += 1) {
    max = Math.max(max, waveformData.peaks[index] ?? 0)
    if (waveformData.rms) {
      rmsSum += waveformData.rms[index] ?? 0
      rmsCount += 1
    }
  }
  return { max, rms: rmsCount > 0 ? rmsSum / rmsCount : max * 0.45 }
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  waveformData: WaveformData,
  window: TimeWindow,
  width: number,
  height: number,
  position: number,
  variant: 'overview' | 'detail',
): void {
  const mid = height / 2
  const sampleSecondsPerPixel = (window.end - window.start) / Math.max(1, width)
  ctx.lineCap = 'butt'

  for (let x = 0; x < width; x += 1) {
    const t0 = window.start + x * sampleSecondsPerPixel
    const t1 = t0 + sampleSecondsPerPixel
    const { max, rms } = peakRange(waveformData, t0, t1)
    const peakHeight = Math.max(1, max * height * (variant === 'detail' ? 0.88 : 0.76))
    const rmsHeight = Math.max(1, rms * height * (variant === 'detail' ? 0.56 : 0.44))
    const secondsAtX = xToTime(x, window, width)
    ctx.strokeStyle = variant === 'overview' && secondsAtX <= position ? WAVEFORM_THEME.overviewPlayed : WAVEFORM_THEME.detailPeak
    if (variant === 'overview' && secondsAtX > position) ctx.strokeStyle = WAVEFORM_THEME.overviewUnplayed
    ctx.globalAlpha = variant === 'detail' ? 0.94 : 0.86
    ctx.beginPath()
    ctx.moveTo(x + 0.5, mid - peakHeight / 2)
    ctx.lineTo(x + 0.5, mid + peakHeight / 2)
    ctx.stroke()

    ctx.strokeStyle = WAVEFORM_THEME.detailRms
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.moveTo(x + 0.5, mid - rmsHeight / 2)
    ctx.lineTo(x + 0.5, mid + rmsHeight / 2)
    ctx.stroke()
  }
}

function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  beats: number[] | undefined,
  window: TimeWindow,
  width: number,
  height: number,
): void {
  for (const marker of beatGridMarkers(beats, window, width)) {
    ctx.strokeStyle = marker.emphasis === 'strong' ? WAVEFORM_THEME.beatStrong : WAVEFORM_THEME.beatMinor
    ctx.lineWidth = marker.emphasis === 'strong' ? 1.5 : 1
    ctx.beginPath()
    ctx.moveTo(Math.round(marker.x) + 0.5, 0)
    ctx.lineTo(Math.round(marker.x) + 0.5, height)
    ctx.stroke()
  }
}

function drawLoop(
  ctx: CanvasRenderingContext2D,
  loop: LoopState | undefined,
  window: TimeWindow,
  width: number,
  height: number,
): void {
  const region = loopRegion(loop, window, width)
  if (!region) return
  ctx.fillStyle = WAVEFORM_THEME.loopFill
  ctx.fillRect(region.x, 0, region.width, height)
  ctx.strokeStyle = WAVEFORM_THEME.loopLine
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(Math.round(region.x) + 0.5, 0)
  ctx.lineTo(Math.round(region.x) + 0.5, height)
  ctx.moveTo(Math.round(region.x + region.width) + 0.5, 0)
  ctx.lineTo(Math.round(region.x + region.width) + 0.5, height)
  ctx.stroke()
}

function drawHotCues(
  ctx: CanvasRenderingContext2D,
  hotCues: HotCue[] | undefined,
  window: TimeWindow,
  width: number,
  height: number,
): void {
  for (const marker of hotCueMarkers(hotCues, window, width)) {
    const color = WAVEFORM_THEME.hotCueColors[marker.index % WAVEFORM_THEME.hotCueColors.length]
    const x = Math.round(marker.x) + 0.5
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = '700 10px ui-sans-serif, system-ui'
    ctx.fillText(String(marker.index + 1), marker.x + 3, 11)
  }
}

function drawPlayhead(ctx: CanvasRenderingContext2D, x: number, height: number, variant: 'overview' | 'detail'): void {
  ctx.strokeStyle = WAVEFORM_THEME.centerLine
  ctx.lineWidth = variant === 'detail' ? 2 : 1.5
  ctx.shadowColor = WAVEFORM_THEME.centerGlow
  ctx.shadowBlur = variant === 'detail' ? 10 : 5
  ctx.beginPath()
  ctx.moveTo(Math.round(x) + 0.5, 0)
  ctx.lineTo(Math.round(x) + 0.5, height)
  ctx.stroke()
  ctx.shadowBlur = 0
  if (variant === 'detail') {
    ctx.fillStyle = '#f6a33a'
    ctx.beginPath()
    ctx.moveTo(x - 5, 0)
    ctx.lineTo(x + 5, 0)
    ctx.lineTo(x, 7)
    ctx.closePath()
    ctx.fill()
  }
}

function drawEmpty(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  drawBackground(ctx, width, height)
  ctx.strokeStyle = WAVEFORM_THEME.emptyLine
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()
}

export function DjWaveform({
  deck,
  variant,
  waveformData,
  position,
  duration,
  beatGrid,
  loop,
  hotCues,
  onSeek,
}: DjWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<CanvasSize | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const cssWidth = Math.max(1, Math.round(rect.width))
      const cssHeight = Math.max(1, Math.round(rect.height))
      setSize({
        cssWidth,
        cssHeight,
        pixelWidth: Math.max(1, Math.round(cssWidth * dpr)),
        pixelHeight: Math.max(1, Math.round(cssHeight * dpr)),
      })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(canvas)
    window.addEventListener('resize', updateSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    resizeCanvas(canvas, size)
    setupCanvas(ctx, size)
    const width = size.cssWidth
    const height = size.cssHeight

    if (!waveformData || waveformData.peaks.length === 0 || duration <= 0) {
      drawEmpty(ctx, width, height)
      return
    }

    const window = variant === 'overview' ? overviewWindow(duration) : detailWindow(position, duration, DETAIL_SECONDS)
    drawBackground(ctx, width, height)
    drawBeatGrid(ctx, beatGrid?.beats, window, width, height)
    drawLoop(ctx, loop, window, width, height)
    drawWaveform(ctx, waveformData, window, width, height, position, variant)
    drawHotCues(ctx, hotCues, window, width, height)
    drawPlayhead(ctx, timeToX(position, window, width), height, variant)
  }, [beatGrid, duration, hotCues, loop, position, size, variant, waveformData])

  const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !size || duration <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const window = variant === 'overview' ? overviewWindow(duration) : detailWindow(position, duration, DETAIL_SECONDS)
    onSeek(Math.max(0, Math.min(duration, xToTime(x, window, rect.width))))
  }, [duration, onSeek, position, size, variant])

  return (
    <canvas
      ref={canvasRef}
      className={`dj-waveform dj-waveform-${variant} deck-${deck === 0 ? 'a' : 'b'}`}
      onClick={handleClick}
      data-testid={`dj-waveform-${variant}-${deck === 0 ? 'a' : 'b'}`}
      aria-label={`Deck ${deck === 0 ? 'A' : 'B'} ${variant} waveform`}
    />
  )
}
