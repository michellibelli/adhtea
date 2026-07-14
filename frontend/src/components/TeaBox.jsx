import { useRef, useState } from 'react'
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
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TAG_COLORS } from '../utils/taskColors'
import { orderTasks } from '../utils/ordering'
import { SmartPointerSensor, looseInBox } from '../utils/dnd'

// The box holds at most 15 bags — the natural display limit for a day's plan.
const BOX_CAPACITY = 15

const GOLD = {
  bg: 'linear-gradient(135deg, #F6E29A 0%, #E4B63C 38%, #F3D777 58%, #C9971F 100%)',
  border: '#A6781C',
  shadow: '#7C5912',
}

// Bags sit in the shared today-order (see utils/ordering.js) — the same order
// Focus picks from, so the focused task is the first selectable bag.
function orderedBags(tasks, manual) {
  return orderTasks(tasks, manual).slice(0, BOX_CAPACITY)
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

// A bag the user can pick up and drop somewhere else in the row.
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

// Tea-box for the Focus page. 2D side profile, no lid: an open box holding
// today's tasks as bags in a single packed row, ordered roughly morning →
// evening. As today's tasks are completed the coloured bags drain; completed
// bonus tasks (goldCount) refill the box as gold bags. Clicking the box opens
// Today; clicking a bag focuses that task on the Focus card (via onSelectTask)
// so the user can act on a specific item — e.g. an 8am routine done at 9am
// that the time-of-day window would otherwise keep off the card.
//
// Dragging a bag hands the day's order to her: onReorder persists the new
// sort_order and flips the box into manual mode, where the clock stops
// reshuffling the row (see utils/ordering.js). Since Focus picks the first bag,
// dragging a bag to the front is how she chooses what she does next.
export default function TeaBox({ tasks = [], activeTaskId = null, goldCount = 0, overCapacity = false, manualOrder = false, onOpen, onSelectTask, onReorder, onNavigate }) {
  const BOX_VISIBLE = 9
  const ordered = orderedBags(tasks, manualOrder)
  const colored = ordered.slice(0, BOX_VISIBLE)
  const goldShown = Math.max(0, Math.min(goldCount, BOX_VISIBLE - colored.length))
  const boxFull = goldCount >= BOX_VISIBLE

  // A drag ends with a click event on the bag the user let go of, which would
  // otherwise focus it. Set on drag start, cleared on the macrotask after drop —
  // pointerup → click all dispatch before the timeout, so the guard is up in time.
  const draggedRef = useRef(false)
  // Suppresses the box's press-scale for the duration of a drag: a 0.98 scale on
  // the row would move every bag out from under dnd-kit's measured drop targets.
  const [dragging, setDragging] = useState(false)
  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 6 } }),
  )

  function handleDragStart() {
    draggedRef.current = true
    setDragging(true)
  }

  function handleDragEnd({ active, over }) {
    setDragging(false)
    const settle = () => setTimeout(() => { draggedRef.current = false }, 0)
    if (!over || active.id === over.id) { settle(); return }
    const from = ordered.findIndex(t => t.id === active.id)
    const to   = ordered.findIndex(t => t.id === over.id)
    if (from < 0 || to < 0) { settle(); return }
    // Renumber the whole ordered list, not just the nine visible bags, so the
    // bags below the fold keep a coherent sort_order behind the ones on screen.
    onReorder?.(arrayMove(ordered, from, to).map((t, i) => ({ ...t, sort_order: i })))
    settle()
  }

  return (
    <>
      {boxFull && (
        <p className="text-center mb-1.5">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-ui-surface/85 text-[10px] font-semibold text-ui-text">
            Box full — time for some well-earned self care
          </span>
        </p>
      )}

      <div
        className={`relative w-full select-none cursor-pointer transition-transform${dragging ? '' : ' active:scale-[0.98]'}`}
        style={{ height: 62 }}
        onClick={() => { if (!draggedRef.current) onOpen?.() }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
        role="button"
        tabIndex={0}
        aria-label="Open today's list"
        title="Open today's list"
      >
        <div
          className="absolute left-0 right-0 flex items-end justify-start px-3"
          style={{ bottom: 16, transition: 'all 0.3s ease' }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[looseInBox]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={colored.map(t => t.id)} strategy={horizontalListSortingStrategy}>
              {colored.map(t => {
                const isProject = !!t.project_name
                const colors = isProject
                  ? TAG_COLORS.project
                  : (TAG_COLORS[t.task_type] || TAG_COLORS.task)
                const active = activeTaskId != null && t.id === activeTaskId
                return (
                  <SortableBag
                    key={t.id}
                    task={t}
                    colors={colors}
                    active={active}
                    title={t.title}
                    onClick={e => {
                      e.stopPropagation()
                      if (draggedRef.current) return
                      onSelectTask?.(t.id)
                    }}
                  />
                )
              })}
            </SortableContext>
          </DndContext>
          {Array.from({ length: goldShown }).map((_, i) => (
            <Bag key={`gold-${i}`} colors={GOLD} gold title="Bonus task done" />
          ))}
        </div>

        {/* Box front panel */}
        <div
          className="tea-box-front absolute left-0 right-0 bottom-0"
          style={overCapacity ? { boxShadow: '0 0 8px 2px rgba(217,119,6,0.25)' } : undefined}
        />
      </div>

      {/* Drawers — three equally sized compartments below the box,
          same wood material, part of the same furniture piece. */}
      {onNavigate && (
        <div className="tea-box-drawers">
          {[
            { id: 'projects', label: 'Projects', path: 'M12 22v-9 M12 13C12 13 7 10 7 5c0 0 3.5 0 5 3.5C13.5 5 17 5 17 5c0 5-5 8-5 8z' },
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
