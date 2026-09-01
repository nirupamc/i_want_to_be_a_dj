// Type declarations for troika-three-text
declare module 'troika-three-text' {
  import * as THREE from 'three'

  export class Text extends THREE.Mesh {
    text: string
    fontSize: number
    maxWidth: number
    textAlign: 'left' | 'center' | 'right' | 'justify'
    anchorX: 'left' | 'center' | 'right' | string | number
    anchorY: 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom' | string | number
    font: string | null
    fontWeight: number | string
    letterSpacing: number
    color: string | number | THREE.Color
    outlineWidth: number | string
    outlineColor: string | number | THREE.Color
    outlineOpacity: number
    depthOffset: number
    renderOrder: number
    sync(callback?: () => void): void
    dispose(): void
  }
}
