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
// The clamp is inset by SIDE_INSET, because the bag's selection ring is a
// box-shadow and box-shadows paint OUTSIDE the border box that dnd-kit measures.
// Clamped flush to the row, a bag stops with its body against the wall and the
// ring alone bleeds past it — the bag reads as having broken through the side of
// the box. The inset is the row's own horizontal padding: it holds the bag off
// the wooden walls, which is where the bags sit at rest anyway.
//
// Vertically it gets a little play instead of a hard lock: the bag can lift and
// dip by 15% of its own height, enough to feel loose in the box and to follow
// the thumb a little, but never enough to leave. A hard y-lock reads as stiff;
// unrestricted y lets a wobbly phone drag pull the bag clean out of the row.
// No inset is needed above — bags are meant to stand proud of the rim.
const VERTICAL_PLAY = 0.15   // fraction of the bag's height
const SIDE_INSET = 12        // px — matches the bag row's px-3

export function looseInBox({ containerNodeRect, draggingNodeRect, transform }) {
  if (!draggingNodeRect || !containerNodeRect) return transform

  const minX = (containerNodeRect.left + SIDE_INSET) - draggingNodeRect.left
  const maxX = (containerNodeRect.right - SIDE_INSET) - draggingNodeRect.right
  const play = draggingNodeRect.height * VERTICAL_PLAY

  return {
    ...transform,
    // A row narrower than the inset would invert the bounds; keep min <= max.
    x: Math.min(Math.max(transform.x, Math.min(minX, maxX)), Math.max(minX, maxX)),
    y: Math.min(Math.max(transform.y, -play), play),
  }
}
