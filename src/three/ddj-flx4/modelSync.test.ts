import { describe, expect, it } from 'vitest'

interface NodeBuffer {
  length: number
  [index: number]: number
}

declare const require: (id: string) => { readFileSync?: (path: string) => NodeBuffer; resolve?: (...parts: string[]) => string }
declare const process: { cwd: () => string }

const fs = require('fs') as { readFileSync: (path: string) => NodeBuffer }
const path = require('path') as { resolve: (...parts: string[]) => string }

function read(relativePath: string): NodeBuffer {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath))
}

describe('controller model source/runtime sync', () => {
  it('keeps the source GLB and public runtime GLB byte-identical', () => {
    const source = read('src/three/ddj-flx4/ddj-flx4-controller.glb')
    const runtime = read('public/models/ddj-flx4/ddj-flx4-controller.glb')

    expect(runtime.length, 'Run npm run sync:model after replacing the source controller GLB.').toBe(source.length)
    for (let i = 0; i < source.length; i += 1) {
      expect(runtime[i], `Controller model differs at byte ${i}. Run npm run sync:model.`).toBe(source[i])
    }
  })

  it('uses one public runtime model URL and no bundled GLB import', () => {
    const presentation = fs.readFileSync(path.resolve(process.cwd(), 'src/three/ddj-flx4/presentation.ts')).toString()
    expect(presentation.match(/\/models\/ddj-flx4\/ddj-flx4-controller\.glb/g)).toHaveLength(1)
    expect(presentation).not.toMatch(/import\s+\S+\s+from\s+['"].*ddj-flx4-controller\.glb/)
  })
})
