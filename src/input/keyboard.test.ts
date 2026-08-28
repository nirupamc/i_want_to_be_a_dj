import { describe, expect, it } from 'vitest'
import { isEditableTarget, shouldHandleGlobalDjKey } from './keyboard'

function keyEvent(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('keyboard target scoping', () => {
  it('treats input, textarea, select, and contentEditable as editable', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const nested = document.createElement('span')
    editable.appendChild(nested)
    document.body.append(input, textarea, select, editable)

    expect(isEditableTarget(input)).toBe(true)
    expect(isEditableTarget(textarea)).toBe(true)
    expect(isEditableTarget(select)).toBe(true)
    expect(isEditableTarget(editable)).toBe(true)
    expect(isEditableTarget(nested)).toBe(true)
  })

  it('does not treat body, canvas, or ordinary divs as editable', () => {
    const canvas = document.createElement('canvas')
    const div = document.createElement('div')
    document.body.append(canvas, div)

    expect(isEditableTarget(document.body)).toBe(false)
    expect(isEditableTarget(canvas)).toBe(false)
    expect(isEditableTarget(div)).toBe(false)
  })

  it('global DJ key handlers ignore editable targets and allow non-editable targets', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const canvas = document.createElement('canvas')
    const div = document.createElement('div')
    document.body.append(input, textarea, select, editable, canvas, div)

    expect(shouldHandleGlobalDjKey(keyEvent(input))).toBe(false)
    expect(shouldHandleGlobalDjKey(keyEvent(textarea))).toBe(false)
    expect(shouldHandleGlobalDjKey(keyEvent(select))).toBe(false)
    expect(shouldHandleGlobalDjKey(keyEvent(editable))).toBe(false)
    expect(shouldHandleGlobalDjKey(keyEvent(document.body))).toBe(true)
    expect(shouldHandleGlobalDjKey(keyEvent(canvas))).toBe(true)
    expect(shouldHandleGlobalDjKey(keyEvent(div))).toBe(true)
  })
})
