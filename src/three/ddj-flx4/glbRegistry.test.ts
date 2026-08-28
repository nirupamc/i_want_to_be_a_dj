import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildControlRegistry } from './controlRegistry'
import { allExpectedIds, CONTROL_IDS } from './controlIds'

interface NodeBuffer {
  length: number
  readUInt32LE(offset: number): number
  toString(encoding: string, start?: number, end?: number): string
}

declare const require: (id: string) => { readFileSync?: (path: string) => NodeBuffer; resolve?: (...parts: string[]) => string }
declare const process: { cwd: () => string }

const fs = require('fs') as { readFileSync: (path: string) => NodeBuffer }
const path = require('path') as { resolve: (...parts: string[]) => string }

interface GlbJson {
  scene?: number
  scenes?: Array<{ nodes?: number[] }>
  nodes?: Array<{ name?: string; children?: number[] }>
}

function readGlbJson(filePath: string): GlbJson {
  const buffer = fs.readFileSync(filePath)
  let offset = 12
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset)
    const type = buffer.toString('utf8', offset + 4, offset + 8)
    offset += 8
    if (type === 'JSON') {
      return JSON.parse(buffer.toString('utf8', offset, offset + length).replace(/\0+$/, '')) as GlbJson
    }
    offset += length
  }
  throw new Error('GLB JSON chunk not found')
}

function buildObjectTree(json: GlbJson): THREE.Object3D {
  const nodes = json.nodes ?? []
  const objects = nodes.map((node) => {
    const object = /Track$|HandleBody$|HandleRidge$/.test(node.name ?? '')
      ? new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.01), new THREE.MeshBasicMaterial())
      : new THREE.Object3D()
    object.name = node.name ?? ''
    return object
  })

  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) {
      objects[index].add(objects[child])
    }
  })

  const scene = new THREE.Object3D()
  scene.name = 'GLBScene'
  const rootIndices = json.scenes?.[json.scene ?? 0]?.nodes ?? [0]
  for (const rootIndex of rootIndices) {
    scene.add(objects[rootIndex])
  }
  return scene
}

describe('current runtime GLB registry compatibility', () => {
  it('binds every expected semantic control from public/models', () => {
    const glbPath = path.resolve(process.cwd(), 'src/three/ddj-flx4/ddj-flx4-controller.glb')
    const json = readGlbJson(glbPath)
    const root = buildObjectTree(json)
    const { controls, missing } = buildControlRegistry(root)
    const expected = allExpectedIds()
    const allowedExtra = [`${CONTROL_IDS.decks.left.jog}.rim`, `${CONTROL_IDS.decks.right.jog}.rim`]

    expect(json.nodes?.length).toBe(919)
    expect(missing).toEqual([])
    expect(Object.keys(controls).sort()).toEqual([...expected, ...allowedExtra].sort())
  })
})
