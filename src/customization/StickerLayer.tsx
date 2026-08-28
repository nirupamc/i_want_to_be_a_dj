import React, { useRef, useState } from 'react'
import type { ControllerSticker } from './controllerCustomization'
import { dragSticker, stickerTilt } from './controllerCustomization'

interface StickerLayerProps {
  stickers: ControllerSticker[]
  selectedId: string | null
  onSelect: (id: string) => void
  onChange: (sticker: ControllerSticker) => void
}

export function StickerLayer({ stickers, selectedId, onSelect, onChange }: StickerLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState<{ id: string; pointerId: number; lastX: number; lastY: number; tiltX: number; tiltY: number } | null>(null)

  return (
    <div ref={layerRef} className="sticker-layer" aria-label="Controller stickers">
      {stickers.map((sticker) => {
        const active = dragging?.id === sticker.id
        const tilt = active ? { rotateX: dragging.tiltX, rotateY: dragging.tiltY } : { rotateX: 0, rotateY: 0 }
        const size = 82 * sticker.scale
        return (
          <button
            key={sticker.id}
            type="button"
            className={`controller-sticker ${selectedId === sticker.id ? 'selected' : ''} ${active ? 'dragging' : ''}`}
            style={{
              left: `${sticker.x * 100}%`,
              top: `${sticker.y * 100}%`,
              width: size,
              height: size,
              transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) perspective(420px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale(${active ? 1.08 : 1})`,
              '--sticker-gloss': String(sticker.gloss),
            } as React.CSSProperties}
            onPointerDown={(event) => {
              const layer = layerRef.current
              if (!layer) return
              event.currentTarget.setPointerCapture(event.pointerId)
              event.stopPropagation()
              onSelect(sticker.id)
              setDragging({ id: sticker.id, pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, tiltX: 0, tiltY: 0 })
            }}
            onPointerMove={(event) => {
              if (!dragging || dragging.id !== sticker.id || dragging.pointerId !== event.pointerId) return
              const layer = layerRef.current
              if (!layer) return
              event.stopPropagation()
              const rect = layer.getBoundingClientRect()
              const dx = event.clientX - dragging.lastX
              const dy = event.clientY - dragging.lastY
              const next = dragSticker({ sticker, deltaX: dx, deltaY: dy, boundsWidth: rect.width, boundsHeight: rect.height })
              const nextTilt = stickerTilt(dx, dy)
              setDragging({ ...dragging, lastX: event.clientX, lastY: event.clientY, tiltX: nextTilt.rotateX, tiltY: nextTilt.rotateY })
              onChange(next)
            }}
            onPointerUp={(event) => {
              if (dragging?.pointerId === event.pointerId) setDragging(null)
            }}
            onPointerCancel={() => setDragging(null)}
            title={sticker.name}
          >
            <img src={sticker.imageDataUrl} alt="" draggable={false} />
          </button>
        )
      })}
    </div>
  )
}
