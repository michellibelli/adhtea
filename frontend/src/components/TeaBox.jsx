import { useState } from 'react'
import { createPortal } from 'react-dom'
import { TAG_COLORS } from '../utils/taskColors'

// The box holds at most 15 bags — a fully-triaged day never exceeds the
// max_total_per_day cap, so this is also the natural display limit.
const BOX_CAPACITY = 15

// The box is a time axis: 8:30am on the left, 8:30pm on the right.
const AXIS_START = 8 * 60 + 30   // 510  (minutes since midnight)
const AXIS_SPAN  = 12 * 60       // 720  (12 hours → 8:30pm)

// Minimum centre-to-centre gap between bags, as a fraction of the axis.
// Keeps bags from overlapping when timed + untimed positions collide; small
// enough that all 15 still fit (14 gaps × 0.066 < 1).
const MIN_GAP = 0.066

// Mild wood texture — warm-brown base + faint horizontal grain streaks.
const WOOD_BG = `
  repeating-linear-gradient(0deg,
    rgba(60,38,18,0) 0px,
    rgba(60,38,18,0.07) 3px,
    rgba(255,240,214,0.05) 6px,
    rgba(60,38,18,0) 11px),
  linear-gradient(180deg, #BE9A66 0%, #A37F4C 100%)
`

const TYPE_LABEL = {
  task: 'Task', appointment: 'Appointment', routine: 'Routine', note: 'Note',
}

// "14:30" -> minutes since midnight, or null when the task has no time.
function bagMinutes(t) {
  if (!t.due_time) return null
  const [h, m] = t.due_time.split(':').map(Number)
  return h * 60 + m
}

// minutes -> 0..1 position along the 8:30a–8:30p axis (clamped).
function axisPos(min) {
  return Math.min(1, Math.max(0, (min - AXIS_START) / AXIS_SPAN))
}

// "14:30" -> "2:30p"
function fmtTime(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

// Lay the bags out along the axis: timed items at their exact time, untimed
// tasks spread evenly. Then nudge any overlapping bags apart while keeping
// time order, so the row never collapses into a pile.
function layoutBags(tasks) {
  const capped = [...tasks]
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    .slice(0, BOX_CAPACITY)
  const untimed = capped.filter(t => !t.due_time)

  const placed = capped.map(t => {
    const min = bagMinutes(t)
    const pos = min != null
      ? axisPos(min)
      : (untimed.indexOf(t) + 0.5) / Math.max(1, untimed.length)
    return { task: t, pos }
  })

  placed.sort((a, b) => a.pos - b.pos)

  // Forward pass — push each bag right until it clears the previous one.
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].pos < placed[i - 1].pos + MIN_GAP) {
      placed[i].pos = placed[i - 1].pos + MIN_GAP
    }
  }
  // If that ran past the right edge, pull the tail back left.
  const last = placed.length - 1
  if (last >= 0 && placed[last].pos > 1) {
    placed[last].pos = 1
    for (let i = last - 1; i >= 0; i--) {
      if (placed[i].pos > placed[i + 1].pos - MIN_GAP) {
        placed[i].pos = placed[i + 1].pos - MIN_GAP
      }
    }
    if (placed[0].pos < 0) placed[0].pos = 0
  }
  return placed
}

// Inspect card — an enlarged bag that rises out of the box and turns to face
// the viewer. Portaled to <body> with a tap-anywhere backdrop to dismiss.
function InspectCard({ task, onClose }) {
  const isProject = !!task.project_name
  const colors = isProject
    ? TAG_COLORS.project
    : (TAG_COLORS[task.task_type] || TAG_COLORS.task)
  const label = isProject
    ? `Project · ${task.project_name}`
    : (TYPE_LABEL[task.task_type] || 'Task')
  const time = fmtTime(task.due_time)
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center pb-[180px] bg-black/20"
      style={{ perspective: '700px' }}
      onClick={onClose}
    >
      <div
        className="w-[78vw] max-w-[280px] rounded-xl px-5 py-4 text-center"
        style={{
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          boxShadow: `3px 5px 0 ${colors.shadow}, 0 10px 24px rgba(0,0,0,0.3)`,
          animation: 'bag-inspect-in 360ms cubic-bezier(0.34,1.2,0.64,1) both',
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/80 mb-1">
          {label}{time ? ` · ${time}` : ''}
        </p>
        <p className="text-base font-bold text-white leading-snug break-words">
          {task.title}
        </p>
      </div>
    </div>,
    document.body
  )
}

// Tea-box for the Focus page. 2D side profile, no lid: an open box whose
// horizontal span is the day, 8:30am → 8:30pm. Timed items sit at their exact
// time; untimed tasks are spread evenly across the axis. Each bag is tinted by
// task type; the bag matching the current Focus pick is raised + highlighted.
// Clicking the box opens Today; clicking a bag inspects that task.
export default function TeaBox({ tasks = [], activeTaskId = null, onOpen }) {
  const [inspectedId, setInspectedId] = useState(null)

  const bags = layoutBags(tasks)
  const inspected = inspectedId != null
    ? tasks.find(t => t.id === inspectedId)
    : null

  return (
    <>
      <div
        className="relative w-full select-none cursor-pointer active:scale-[0.98] transition-transform"
        style={{ height: 72 }}
        onClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
        role="button"
        tabIndex={0}
        aria-label="Open today's list"
        title="Open today's list"
      >
        {/* Bag layer — positioned context, inset so end-of-axis bags don't
            overflow the box. Each bag is placed by its position on the axis;
            bag + string are absolutely positioned so every bag shares one
            baseline (only the active bag lifts). */}
        <div className="absolute" style={{ left: 12, right: 12, bottom: 22, height: 44 }}>
          {bags.map(({ task: t, pos }) => {
            const isProject = !!t.project_name
            const colors = isProject
              ? TAG_COLORS.project
              : (TAG_COLORS[t.task_type] || TAG_COLORS.task)
            const active = activeTaskId != null && t.id === activeTaskId
            return (
              <div
                key={t.id}
                className="absolute cursor-pointer"
                style={{
                  left: `${pos * 100}%`,
                  bottom: 0,
                  width: 14,
                  height: 44,
                  transform: 'translateX(-50%)',
                  zIndex: active ? 2 : 1,
                }}
                onClick={e => { e.stopPropagation(); setInspectedId(t.id) }}
                title={t.title}
              >
                {/* string */}
                <div
                  style={{
                    position: 'absolute',
                    left: 6,
                    width: 2,
                    bottom: active ? 36 : 30,
                    height: active ? 8 : 5,
                    background: '#B8AE98',
                    transition: 'bottom 200ms ease, height 200ms ease',
                  }}
                />
                {/* bag */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    bottom: 0,
                    width: 14,
                    height: 30,
                    background: colors.bg,
                    border: `1.5px solid ${colors.border}`,
                    borderRadius: 2.5,
                    transform: active ? 'translateY(-6px)' : 'none',
                    boxShadow: active
                      ? `0 0 0 2px ${colors.border}, 0 4px 7px rgba(0,0,0,0.28)`
                      : `1px 1px 0 ${colors.shadow}`,
                    transition: 'transform 200ms ease, box-shadow 200ms ease',
                  }}
                />
              </div>
            )
          })}
        </div>

        {/* Box front panel — mild wood texture, covers the lower part of the
            bags. Carries the axis end-times. */}
        <div
          className="absolute left-0 right-0 bottom-0"
          style={{
            height: 40,
            background: WOOD_BG,
            borderRadius: '6px 6px 7px 7px',
            border: '2px solid #8A6B40',
            borderBottomWidth: 3,
          }}
        >
          <span
            className="absolute"
            style={{ left: 7, bottom: 4, fontSize: 8, fontWeight: 700, color: '#5E4628' }}
          >8:30a</span>
          <span
            className="absolute"
            style={{ right: 7, bottom: 4, fontSize: 8, fontWeight: 700, color: '#5E4628' }}
          >8:30p</span>
        </div>
      </div>

      {inspected && (
        <InspectCard task={inspected} onClose={() => setInspectedId(null)} />
      )}
    </>
  )
}
