import { describe, expect, it } from 'vitest'
import {
  createSticker,
  dragSticker,
  getControllerTheme,
  removeSticker,
  serializeStickers,
  stickerTilt,
  updateSticker,
} from './controllerCustomization'

describe('controller customization state', () => {
  it('resolves themes with a safe default', () => {
    expect(getControllerTheme('glossy-black').label).toBe('Glossy black')
    expect(getControllerTheme('missing' as never).id).toBe('default-dark')
  })

  it('creates serializable sticker state', () => {
    const sticker = createSticker({ id: 's1', name: 'logo', imageDataUrl: 'data:image/png;base64,abc', x: 2, y: -1 })
    expect(sticker.x).toBe(1)
    expect(sticker.y).toBe(0)
    expect(JSON.parse(serializeStickers([sticker]))[0].id).toBe('s1')
  })

  it('updates, clamps, and removes stickers', () => {
    const stickers = [createSticker({ id: 's1', name: 'logo', imageDataUrl: 'data:' })]
    const updated = updateSticker(stickers, 's1', { scale: 99, rotation: 540, gloss: -4 })
    expect(updated[0].scale).toBe(2.2)
    expect(updated[0].rotation).toBe(180)
    expect(updated[0].gloss).toBe(0)
    expect(removeSticker(updated, 's1')).toEqual([])
  })

  it('converts pointer drag pixels to normalized controller-stage placement', () => {
    const sticker = createSticker({ id: 's1', name: 'logo', imageDataUrl: 'data:', x: 0.5, y: 0.5 })
    const dragged = dragSticker({ sticker, deltaX: 100, deltaY: -50, boundsWidth: 1000, boundsHeight: 500 })
    expect(dragged.x).toBeCloseTo(0.6)
    expect(dragged.y).toBeCloseTo(0.4)
  })

  it('derives bounded tilt from drag velocity', () => {
    expect(stickerTilt(200, -200)).toEqual({ rotateX: 12, rotateY: 12 })
    expect(stickerTilt(-10, 20)).toEqual({ rotateX: -3.5999999999999996, rotateY: -1.7999999999999998 })
  })
})
