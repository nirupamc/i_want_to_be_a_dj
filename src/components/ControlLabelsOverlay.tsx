import type { CSSProperties } from 'react'
import type { ControllerProjection } from '../three/ddj-flx4/ThreeScene'
import { CONTROL_INFO, CONTROL_INFO_BY_ID, type ControlInfo } from '../three/ddj-flx4/controlInfo'

export type ControlLabelMode = 'off' | 'minimal' | 'full'

interface DrawnLabel {
  info: ControlInfo
  x: number
  y: number
  width: number
  height: number
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export function ControlLabelsOverlay({
  mode,
  testerMode,
  hoveredId,
  projection,
}: {
  mode: ControlLabelMode
  testerMode: boolean
  hoveredId: string | null
  projection: ControllerProjection | null
}): JSX.Element | null {
  if (mode === 'off' || !projection) return null

  const anchors = new Map(projection.controls.map((anchor) => [anchor.id, anchor]))
  const bounds = projection.bounds
  const candidates = CONTROL_INFO
    .filter((info) => anchors.has(info.id))
    .filter((info) => mode === 'full' || info.labelMode === 'minimal')
    .sort((a, b) => b.priority - a.priority)

  const drawn = placeLabels(candidates, anchors, projection.canvas.width, projection.canvas.height, bounds)
  const hovered = hoveredId ? CONTROL_INFO_BY_ID.get(hoveredId) ?? null : null
  const hoverAnchor = hoveredId ? anchors.get(hoveredId) ?? null : null

  return (
    <div className={`control-labels-overlay mode-${mode} ${testerMode ? 'tester' : ''}`} aria-label="Control labels">
      {drawn.map((label) => (
        <span
          className={`control-label-callout ${toneClass(label.info)} ${label.info.implemented ? '' : 'unsupported'}`}
          key={label.info.id}
          style={{ left: label.x, top: label.y } as CSSProperties}
        >
          <span className="control-label-primary">{label.info.shortLabel}</span>
          {testerMode && <span className="control-label-status">{statusText(label.info)}</span>}
        </span>
      ))}
      {testerMode && hovered && hoverAnchor && (
        <span className={`control-hover-tooltip ${toneClass(hovered)} ${hovered.implemented ? '' : 'unsupported'}`} style={{ left: hoverAnchor.x, top: hoverAnchor.y } as CSSProperties}>
          <strong>{hovered.fullLabel}</strong>
          <span>{hovered.deck ? `Deck ${hovered.deck}` : sectionLabel(hovered.section)}</span>
          {hovered.valueHint && <span>{hovered.valueHint}</span>}
          <span>{hovered.status.replace(/_/g, ' ')}</span>
        </span>
      )}
      <span className="control-labels-note">
        Labels are screen-space helpers and do not block controller input.
      </span>
    </div>
  )
}

function placeLabels(
  candidates: ControlInfo[],
  anchors: Map<string, { x: number; y: number }>,
  width: number,
  height: number,
  bounds: ControllerProjection['bounds'],
): DrawnLabel[] {
  const placed: DrawnLabel[] = []
  const rects: Rect[] = []
  for (const info of candidates) {
    const anchor = anchors.get(info.id)
    if (!anchor) continue
    const labelWidth = estimateWidth(info)
    const labelHeight = info.implemented ? 22 : 30
    const offsets = offsetsFor(info)
    let accepted: DrawnLabel | null = null
    for (const offset of offsets) {
      const minX = Math.max(8 + labelWidth / 2, (bounds?.left ?? 0) - 28)
      const maxX = Math.min(width - 8 - labelWidth / 2, (bounds ? bounds.left + bounds.width : width) + 28)
      const minY = Math.max(8 + labelHeight / 2, (bounds?.top ?? 0) - 28)
      const maxY = Math.min(height - 8 - labelHeight / 2, (bounds ? bounds.top + bounds.height : height) + 28)
      const x = clamp(anchor.x + offset.x, minX, maxX)
      const y = clamp(anchor.y + offset.y, minY, maxY)
      const rect = { left: x - labelWidth / 2, top: y - labelHeight / 2, right: x + labelWidth / 2, bottom: y + labelHeight / 2 }
      if (rects.some((existing) => overlaps(existing, rect))) continue
      accepted = { info, x, y, width: labelWidth, height: labelHeight }
      rects.push(rect)
      break
    }
    if (accepted) placed.push(accepted)
  }
  return placed.sort((a, b) => a.y - b.y || a.x - b.x)
}

function estimateWidth(info: ControlInfo): number {
  return clamp(info.shortLabel.length * 7.3 + (info.implemented ? 18 : 38), 42, info.section === 'pads' ? 94 : 122)
}

function offsetsFor(info: ControlInfo): Array<{ x: number; y: number }> {
  if (info.section === 'pads') return [{ x: 0, y: -24 }, { x: 0, y: 25 }, { x: info.deck === 'A' ? -44 : 44, y: 0 }]
  if (info.section === 'mixer') return [{ x: 0, y: -22 }, { x: 0, y: 24 }, { x: info.deck === 'A' ? -42 : 42, y: 0 }]
  if (info.section === 'fx' || info.section === 'browse') return [{ x: 0, y: -24 }, { x: 0, y: 24 }, { x: 46, y: 0 }, { x: -46, y: 0 }]
  return [{ x: 0, y: -26 }, { x: 0, y: 26 }, { x: info.deck === 'A' ? -42 : 42, y: 0 }]
}

function overlaps(a: Rect, b: Rect): boolean {
  const gap = 5
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function toneClass(info: ControlInfo): string {
  if (info.deck === 'A') return 'deck-a'
  if (info.deck === 'B') return 'deck-b'
  if (info.section === 'mixer') return 'mixer'
  if (info.section === 'fx') return 'fx'
  return 'browse'
}

function statusText(info: ControlInfo): string {
  if (info.status === 'VERIFIED') return 'WORKING'
  if (info.status === 'IMPLEMENTED_NOT_BROWSER_VERIFIED') return 'IMPLEMENTED'
  if (info.status === 'PHYSICAL_MIDI_UNVERIFIED') return 'MIDI UNVERIFIED'
  return 'NOT IMPLEMENTED'
}

function sectionLabel(section: ControlInfo['section']): string {
  if (section === 'fx') return 'Beat FX'
  if (section === 'browse') return 'Browse'
  if (section === 'pads') return 'Performance pads'
  if (section === 'smart') return 'Smart controls'
  if (section === 'mixer') return 'Mixer'
  return 'Deck'
}
