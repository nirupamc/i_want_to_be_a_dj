import React, { useRef, useState } from 'react'
import type { ProjectedControllerBounds } from '../three/ddj-flx4/ThreeScene'
import type { ControllerSticker } from './controllerCustomization'
import { dragSticker, stickerTilt } from './controllerCustomization'

interface StickerLayerProps {
  stickers: ControllerSticker[]
  selectedId: string | null
  editMode: boolean
  controllerBounds: ProjectedControllerBounds | null
  onSelect: (id: string | null) => void
  onChange: (sticker: ControllerSticker) => void
}

export function StickerLayer({ stickers, selectedId, editMode, controllerBounds, onSelect, onChange }: StickerLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState<{ id: string; pointerId: number; lastX: number; lastY: number; tiltX: number; tiltY: number } | null>(null)

  return (
    <div
      ref={layerRef}
      className={`sticker-layer ${editMode ? 'editing' : 'normal'}`}
      aria-label="Controller stickers"
      onPointerDown={(event) => {
        if (!editMode || event.target !== event.currentTarget) return
        onSelect(null)
      }}
    >
      {stickers.map((sticker) => {
        const bounds = controllerBounds ?? { left: 0, top: 0, width: layerRef.current?.clientWidth ?? 1, height: layerRef.current?.clientHeight ?? 1 }
        const active = dragging?.id === sticker.id
        const selected = selectedId === sticker.id
        const tilt = active ? { rotateX: dragging.tiltX, rotateY: dragging.tiltY } : { rotateX: 0, rotateY: 0 }
        const size = 82 * sticker.scale
        const left = clamp(bounds.left + sticker.x * bounds.width, bounds.left + size / 2, bounds.left + bounds.width - size / 2)
        const top = clamp(bounds.top + sticker.y * bounds.height, bounds.top + size / 2, bounds.top + bounds.height - size / 2)
        return (
          <button
            key={sticker.id}
            type="button"
            className={`controller-sticker finish-${sticker.finish} ${selected ? 'selected' : ''} ${active ? 'dragging' : ''}`}
            style={{
              left,
              top,
              width: size,
              height: size,
              transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) perspective(420px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale(${active ? 1.07 : 1})`,
              '--sticker-gloss': String(sticker.gloss),
            } as React.CSSProperties}
            onPointerDown={(event) => {
              if (!editMode) return
              event.currentTarget.setPointerCapture(event.pointerId)
              event.stopPropagation()
              onSelect(sticker.id)
              setDragging({ id: sticker.id, pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, tiltX: 0, tiltY: 0 })
            }}
            onPointerMove={(event) => {
              if (!editMode || !dragging || dragging.id !== sticker.id || dragging.pointerId !== event.pointerId) return
              event.stopPropagation()
              const dx = event.clientX - dragging.lastX
              const dy = event.clientY - dragging.lastY
              const next = dragSticker({ sticker, deltaX: dx, deltaY: dy, boundsWidth: bounds.width, boundsHeight: bounds.height })
              const nextTilt = stickerTilt(dx, dy)
              setDragging({ ...dragging, lastX: event.clientX, lastY: event.clientY, tiltX: nextTilt.rotateX, tiltY: nextTilt.rotateY })
              onChange(next)
            }}
            onPointerUp={(event) => {
              if (dragging?.pointerId === event.pointerId) setDragging(null)
            }}
            onPointerCancel={() => setDragging(null)}
            title={sticker.name}
            tabIndex={editMode ? 0 : -1}
          >
            <img src={sticker.imageDataUrl} alt="" draggable={false} />
          </button>
        )
      })}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return value
  return Math.max(min, Math.min(max, value))
}
