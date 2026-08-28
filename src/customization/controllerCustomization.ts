export type ControllerThemeId = 'default-dark' | 'glossy-black' | 'accent-neon'

export interface ControllerTheme {
  id: ControllerThemeId
  label: string
  gloss: number
  exposure: number
  accent: string
}

export interface ControllerSticker {
  id: string
  name: string
  imageDataUrl: string
  x: number
  y: number
  scale: number
  rotation: number
  gloss: number
}

export interface StickerDragInput {
  sticker: ControllerSticker
  deltaX: number
  deltaY: number
  boundsWidth: number
  boundsHeight: number
}

export const CONTROLLER_THEMES: ControllerTheme[] = [
  { id: 'default-dark', label: 'Default dark', gloss: 0.35, exposure: 1.38, accent: '#72b7ff' },
  { id: 'glossy-black', label: 'Glossy black', gloss: 0.7, exposure: 1.52, accent: '#f3f7ff' },
  { id: 'accent-neon', label: 'Accent neon', gloss: 0.58, exposure: 1.48, accent: '#ff9b43' },
]

export function getControllerTheme(id: ControllerThemeId): ControllerTheme {
  return CONTROLLER_THEMES.find((theme) => theme.id === id) ?? CONTROLLER_THEMES[0]
}

export function createSticker(input: { id: string; name: string; imageDataUrl: string; x?: number; y?: number }): ControllerSticker {
  return {
    id: input.id,
    name: input.name,
    imageDataUrl: input.imageDataUrl,
    x: clamp01(input.x ?? 0.5),
    y: clamp01(input.y ?? 0.5),
    scale: 1,
    rotation: 0,
    gloss: 0.55,
  }
}

export function updateSticker(stickers: ControllerSticker[], id: string, patch: Partial<Omit<ControllerSticker, 'id' | 'imageDataUrl'>>): ControllerSticker[] {
  return stickers.map((sticker) => {
    if (sticker.id !== id) return sticker
    return sanitizeSticker({
      ...sticker,
      ...patch,
    })
  })
}

export function removeSticker(stickers: ControllerSticker[], id: string): ControllerSticker[] {
  return stickers.filter((sticker) => sticker.id !== id)
}

export function dragSticker({ sticker, deltaX, deltaY, boundsWidth, boundsHeight }: StickerDragInput): ControllerSticker {
  const width = Math.max(1, boundsWidth)
  const height = Math.max(1, boundsHeight)
  return sanitizeSticker({
    ...sticker,
    x: sticker.x + deltaX / width,
    y: sticker.y + deltaY / height,
  })
}

export function stickerTilt(deltaX: number, deltaY: number): { rotateX: number; rotateY: number } {
  const clamp = (value: number) => Math.max(-12, Math.min(12, value))
  return {
    rotateX: clamp(-deltaY * 0.18),
    rotateY: clamp(deltaX * 0.18),
  }
}

export function serializeStickers(stickers: ControllerSticker[]): string {
  return JSON.stringify(stickers.map(sanitizeSticker))
}

function sanitizeSticker(sticker: ControllerSticker): ControllerSticker {
  return {
    ...sticker,
    x: clamp01(sticker.x),
    y: clamp01(sticker.y),
    scale: Math.max(0.35, Math.min(2.2, sticker.scale)),
    rotation: normalizeRotation(sticker.rotation),
    gloss: clamp01(sticker.gloss),
  }
}

function normalizeRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0
  let next = rotation % 360
  if (next > 180) next -= 360
  if (next < -180) next += 360
  return next
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
