import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TAG_COLORS } from '../utils/taskColors'
import { orderTasks } from '../utils/ordering'
import { SmartPointerSensor } from '../utils/dnd'

// Pre-plan fallback slot count — mirrors Today.jsx's FALLBACK_MAX_TODAY, used
// until "Start my day" snapshots a real capacity-driven number.
const FALLBACK_SLOTS = 10

// Fallback bags-per-tier, used only before the box's real width has been
// measured (see tierCapacity below). Once a day's bags (real + routine +
// bonus) outgrow one tier, a second complete box tier stacks below it. Not a
// scrollbar, not one box stretched taller — an honest second box for an
// honest bigger day.
const ROW_CAPACITY = 9

// Bag width (see Bag's `width: 20`) and BoxTier's horizontal padding
// (`px-3` = 12px per side) — used to derive how many bags actually fit
// across the box's real measured width, so a tier fills edge-to-edge before
// wrapping instead of splitting off a second box while the first still has
// visible room.
const BAG_WIDTH = 20
const TIER_PADDING = 24

// Keeps a dragged bag inside the stack of boxes rather than letting it fly
// off into the middle of the page. Inset by SIDE_INSET horizontally — the
// bag's selection ring is a box-shadow, which paints outside the border box
// dnd-kit measures, so a flush clamp would read as the bag breaking through
// the wall. Vertically it's inset by VERTICAL_OVERHANG rather than clamped
// flush to the stack, since bags are meant to stand proud of each tier's rim
// (and, with more than one tier, a bag needs real vertical room to travel
// from one box to the other).
const SIDE_INSET = 12
const VERTICAL_OVERHANG = 20

const GOLD = {
  bg: 'linear-gradient(135deg, #F6E29A 0%, #E4B63C 38%, #F3D777 58%, #C9971F 100%)',
  border: '#A6781C',
  shadow: '#7C5912',
}

// Not-work bags override task_type color entirely — the point is to spot
// personal items in the box at a glance, regardless of what kind of task.
const NOT_WORK = {
  bg: 'linear-gradient(135deg, #EDE3F6 0%, #D9C3EE 38%, #E6D3F3 58%, #C4A3E0 100%)',
  border: '#9B7BB8',
  shadow: '#6E5486',
}

function colorsFor(t) {
  return t.is_work === false ? NOT_WORK : (TAG_COLORS[t.task_type] || TAG_COLORS.task)
}

// One bag in the box. `gold` bags are completed bonus tasks — decorative,
// not selectable. Each bag renders as a tag + string + body stack so the box
// reads as teabags, not as a row of tiny books (the bookshelf backdrop
// has narrow rectangles of similar muted colours).
function Bag({ colors, active, gold, onClick, title, dragRef, dragProps, dragStyle, dragging }) {
  const stringColor = '#3F2F1A'
  return (
    <div
      ref={dragRef}
      onClick={onClick}
      title={title}
      className={gold ? '' : 'cursor-pointer'}
      {...dragProps}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 20,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
        flexShrink: 0,
        zIndex: dragging ? 3 : active ? 2 : 1,
        // Bag colours pull from the same muted TAG_COLORS used by the
        // Focus tag + bookshelf, which made the bags too pale in the
        // tea-box. Re-saturate by 25% here only — keeps the rest of
        // the app calm but lets the bags pop against the wood + bg.
        filter: gold ? undefined : 'saturate(1.25)',
        // Pointer events only reach dnd-kit if the browser isn't claiming the
        // gesture for a scroll/pan first.
        touchAction: gold ? undefined : 'none',
        ...dragStyle,
      }}
    >
      <div style={{
        width: 9,
        height: 5,
        background: colors.bg,
        border: `0.6px solid ${colors.border}`,
        borderRadius: 1,
      }} />
      <div style={{
        width: 1,
        height: 6,
        background: stringColor,
        opacity: 0.65,
      }} />
      <div style={{
        width: 20,
        height: 36,
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderTopWidth: 2.5,           // crimped fold
        borderRadius: '3px 3px 2px 2px',
        boxShadow: dragging
          ? `0 0 0 2px #241A0F, 0 4px 10px rgba(0,0,0,0.5)`
          : active
            ? `0 0 0 2px #241A0F, 0 1px 5px rgba(0,0,0,0.45)`
            : `1px 1px 0 ${colors.shadow}`,
        transition: 'box-shadow 200ms ease',
      }} />
    </div>
  )
}

// A bag the user can pick up and drop somewhere else in the stack.
function SortableBag({ task, ...bagProps }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })
  return (
    <Bag
      {...bagProps}
      dragRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      dragging={isDragging}
      dragStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        // The lifted bag rides above its neighbours as they shuffle aside.
        opacity: isDragging ? 0.9 : 1,
      }}
    />
  )
}

// One wood-box tier holding up to ROW_CAPACITY bags: a bag row standing proud
// of the rim, over the same front panel used everywhere else in the app.
function BoxTier({ items, renderItem }) {
  return (
    <div style={{ position: 'relative', height: 62 }}>
      <div
        className="absolute left-0 right-0 flex items-end justify-start px-3"
        style={{ bottom: 16 }}
      >
        {items.map(renderItem)}
      </div>
      <div className="tea-box-front absolute left-0 right-0 bottom-0" />
    </div>
  )
}

function chunk(items, size) {
  const rows = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

// Tea-box for the Focus page. 2D side profile, no lid: an open box holding
// today's tasks as bags standing proud of the rim, ordered roughly morning →
// evening. As today's tasks are completed the coloured bags drain; completed
// bonus tasks (goldCount) refill the box as gold bags. Clicking the box opens
// Today; clicking a bag focuses that task on the Focus card (via onSelectTask)
// so the user can act on a specific item — e.g. an 8am routine done at 9am
// that the time-of-day window would otherwise keep off the card.
//
// The box is sized to the day's capacity (capacitySlots, snapshotted at
// "Start my day"): that many task bags count against the plan, padded with
// dashed empty-slot outlines if she's under plan. Routines don't count
// against that number — a routine isn't optional work she chose to take on
// today — but unlike the old tasks-then-routines layout, they're not just
// appended at the end either: orderTasks interleaves them by time-bucket
// (First/Morning/Mid Day/Afternoon) with capped slices of easy/hard tasks
// between them (see utils/ordering.js). Nothing is ever hidden: if a day's
// bags don't fit in one box tier, a second complete tier stacks below it
// (see BoxTier/ROW_CAPACITY) — no scrollbar, which read as too "app" for a
// screen meant to feel chill.
//
// Dragging a bag hands the day's order to her: onReorder persists the new
// sort_order and flips the box into manual mode, where the clock stops
// reshuffling the row (see utils/ordering.js). Since Focus picks the first bag,
// dragging a bag to the front is how she chooses what she does next. Task and
// routine bags share one sortable list, so a bag can be dragged across tiers
// or between the task and routine sections — manual order already outranks
// every automatic rule elsewhere in the app.
export default function TeaBox({ tasks = [], activeTaskId = null, goldCount = 0, capacitySlots = null, manualOrder = false, onOpen, onSelectTask, onReorder, onNavigate, showDrawers = false }) {
  const ordered = orderTasks(tasks, manualOrder)
  // Routines are additive, not counted against capacity — the count below
  // only tallies plain tasks, independent of where they land in the
  // bucket-interleaved display order.
  const taskCount = ordered.filter(t => t.task_type !== 'routine').length
  const slots = capacitySlots ?? FALLBACK_SLOTS
  const overCapacity = taskCount > slots

  const sortableIds = ordered.map(t => t.id)

  // A drag ends with a click event on the bag the user let go of, which would
  // otherwise focus it. Set on drag start, cleared on the macrotask after drop —
  // pointerup → click all dispatch before the timeout, so the guard is up in time.
  const draggedRef = useRef(false)
  // Suppresses the box's press-scale for the duration of a drag: a 0.98 scale on
  // the stack would move every bag out from under dnd-kit's measured drop targets.
  const [dragging, setDragging] = useState(false)
  const stackRef = useRef(null)
  const containerRectRef = useRef(null)

  // How many bags actually fit across one tier's real rendered width. Measured
  // (not assumed) so the box always looks genuinely full right before it
  // wraps to a second tier, instead of splitting off a new box while the
  // first still has a visible gap.
  const [tierCapacity, setTierCapacity] = useState(ROW_CAPACITY)
  useEffect(() => {
    const el = stackRef.current
    if (!el) return
    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width > 0) setTierCapacity(Math.max(1, Math.floor((width - TIER_PADDING) / BAG_WIDTH)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 6 } }),
  )

  function handleDragStart() {
    draggedRef.current = true
    setDragging(true)
    containerRectRef.current = stackRef.current?.getBoundingClientRect() ?? null
  }

  function looseInStack({ draggingNodeRect, transform }) {
    const rect = containerRectRef.current
    if (!rect || !draggingNodeRect) return transform
    const minX = (rect.left + SIDE_INSET) - draggingNodeRect.left
    const maxX = (rect.right - SIDE_INSET) - draggingNodeRect.right
    const minY = (rect.top - VERTICAL_OVERHANG) - draggingNodeRect.top
    const maxY = (rect.bottom + VERTICAL_OVERHANG) - draggingNodeRect.bottom
    return {
      ...transform,
      // A stack narrower/shorter than the inset would invert the bounds; keep min <= max.
      x: Math.min(Math.max(transform.x, Math.min(minX, maxX)), Math.max(minX, maxX)),
      y: Math.min(Math.max(transform.y, Math.min(minY, maxY)), Math.max(minY, maxY)),
    }
  }

  function handleDragEnd({ active, over }) {
    setDragging(false)
    const settle = () => setTimeout(() => { draggedRef.current = false }, 0)
    if (!over || active.id === over.id) { settle(); return }
    const from = ordered.findIndex(t => t.id === active.id)
    const to   = ordered.findIndex(t => t.id === over.id)
    if (from < 0 || to < 0) { settle(); return }
    onReorder?.(arrayMove(ordered, from, to).map((t, i) => ({ ...t, sort_order: i })))
    settle()
  }

  function handleBoxClick() {
    if (draggedRef.current) return
    onOpen?.()
  }

  function handleBagClick(t) {
    return e => {
      e.stopPropagation()
      if (draggedRef.current) return
      onSelectTask?.(t.id)
    }
  }

  // Build the flat visual sequence (already bucket-interleaved by orderTasks,
  // plus trailing gold bags), then split it into box-tier-sized chunks.
  // Whether an item is a real task or a bonus bag, it's still a bag-sized
  // thing taking up room in the box.
  const visual = [
    ...ordered.map(t => ({ kind: t.task_type === 'routine' ? 'routine' : 'slot', task: t })),
    ...Array.from({ length: goldCount }, (_, i) => ({ kind: 'gold', key: `gold-${i}` })),
  ]
  const tiers = chunk(visual, tierCapacity)

  function renderItem(item) {
    if (item.kind === 'gold') return <Bag key={item.key} colors={GOLD} gold title="Bonus task done" />
    const t = item.task
    return (
      <SortableBag
        key={t.id}
        task={t}
        colors={colorsFor(t)}
        active={activeTaskId != null && t.id === activeTaskId}
        title={t.title}
        onClick={handleBagClick(t)}
      />
    )
  }

  return (
    <>
      {overCapacity ? (
        <p className="text-center mb-1.5">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-ui-surface/85 text-[10px] font-semibold text-ui-text">
            {taskCount - slots} over today's {slots}-task plan
          </span>
        </p>
      ) : goldCount >= slots && slots > 0 ? (
        <p className="text-center mb-1.5">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-ui-surface/85 text-[10px] font-semibold text-ui-text">
            Box full — time for some well-earned self care
          </span>
        </p>
      ) : null}

      <div
        ref={stackRef}
        className={`relative w-full select-none cursor-pointer transition-transform${dragging ? '' : ' active:scale-[0.98]'}`}
        onClick={handleBoxClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBoxClick() } }}
        role="button"
        tabIndex={0}
        aria-label="Open today's list"
        title="Open today's list"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[looseInStack]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
            {tiers.map((items, i) => (
              <div key={i} style={{ marginTop: i > 0 ? 10 : 0 }}>
                <BoxTier items={items} renderItem={renderItem} />
              </div>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Drawers — three equally sized compartments below the box, same wood
          material, part of the same furniture piece. Off by default for now
          (kept for a possible future return — see showDrawers). */}
      {showDrawers && onNavigate && (
        <div className="tea-box-drawers">
          {[
            { id: 'routines', label: 'Routines', path: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' },
            { id: 'selfcare', label: 'Log', path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
          ].map(({ id, label, path }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="tea-box-drawer"
              aria-label={label}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={path} />
              </svg>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
