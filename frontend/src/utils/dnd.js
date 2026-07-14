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

// dnd-kit modifier for the tea-box: a dragged bag stays in the box.
//
// Horizontally it's clamped to the bag row, so a bag can't be carried off into
// the middle of the page and dropped nowhere — the box is a container and the
// bags behave like objects inside it.
//
// Vertically it gets a little play instead of a hard lock: the bag can lift and
// dip by 15% of its own height, enough to feel loose in the box and to follow
// the thumb a little, but never enough to leave. A hard y-lock reads as stiff;
// unrestricted y lets a wobbly phone drag pull the bag clean out of the row.
const VERTICAL_PLAY = 0.15   // fraction of the bag's height

export function looseInBox({ containerNodeRect, draggingNodeRect, transform }) {
  if (!draggingNodeRect || !containerNodeRect) return transform

  const minX = containerNodeRect.left - draggingNodeRect.left
  const maxX = containerNodeRect.right - draggingNodeRect.right
  const play = draggingNodeRect.height * VERTICAL_PLAY

  return {
    ...transform,
    x: Math.min(Math.max(transform.x, minX), maxX),
    y: Math.min(Math.max(transform.y, -play), play),
  }
}
