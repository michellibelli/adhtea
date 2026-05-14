import { PointerSensor } from '@dnd-kit/core'

function isInteractiveTarget(el) {
  const tags = new Set(['input', 'textarea', 'select', 'option', 'button', 'label'])
  let node = el
  while (node && node !== document.body) {
    if (tags.has(node.tagName?.toLowerCase())) return true
    if (node.isContentEditable) return true
    node = node.parentElement
  }
  return false
}

export class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown',
      handler: ({ nativeEvent }) =>
        nativeEvent.isPrimary &&
        nativeEvent.button === 0 &&
        !isInteractiveTarget(nativeEvent.target),
    },
  ]
}
