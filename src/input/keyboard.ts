export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable ||
    !!target.closest('[contenteditable="true"]')
  )
}

export function shouldHandleGlobalDjKey(event: KeyboardEvent): boolean {
  return !isEditableTarget(event.target)
}
