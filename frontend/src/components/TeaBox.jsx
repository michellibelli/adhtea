import { useState } from 'react'
import { createPortal } from 'react-dom'
import { TAG_COLORS } from '../utils/taskColors'

// The box holds at most 15 bags — a fully-triaged day never exceeds the
// max_total_per_day cap, so this is also the natural display limit.
const BOX_CAPACITY = 15

// The box reads left-to-right as morning → evening. Used only to give untimed
// tasks a rough slot so they interleave sensibly with timed items.
const DAY_START = 8 * 60 + 30   // 8:30am, in minutes since midnight
const DAY_SPAN  = 12 * 60       // 12 hours → 8:30pm

const TYPE_LABEL = {
  task: 'Task', appointment: 'Appointment', routine: 'Routine', note: 'Note',
}

// "14:30" -> minutes since midnight, or null when the task has no time.
function bagMinutes(t) {
  if (!t.due_time) return null
  const [h, m] = t.due_time.split(':').map(Number)
  return h * 60 + m
}

// "14:30" -> "2:30p"
function fmtTime(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

// Order the bags left-to-right as a rough morning → evening run: timed items
// sort by their actual time, untimed tasks are spread through the day in
// triage priority order so they interleave. The result is a single packed
// row — placement is approximate, not a precise timeline.
function orderedBags(tasks) {
  const capped = [...tasks]
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    .slice(0, BOX_CAPACITY)
  const untimed = capped.filter(t => !t.due_time)
  return capped
    .map(t => {
      const min = bagMinutes(t)
      const key = min != null
        ? min
        : DAY_START + ((untimed.indexOf(t) + 0.5) / Math.max(1, untimed.length)) * DAY_SPAN
      return { task: t, key }
    })
    .sort((a, b) => a.key - b.key)
    .map(x => x.task)
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
      className="fixed inset-0 z-[60] flex items-end justify-center pb-[170px] bg-black/20"
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

// Tea-box for the Focus page. 2D side profile, no lid: an open box holding
// today's tasks as bags in a single packed row, ordered roughly morning →
// evening. Each bag is tinted by task type; the bag matching the current
// Focus pick is brightened + ringed (it does not rise). Clicking the box
// opens Today; clicking a bag inspects that task.
export default function TeaBox({ tasks = [], activeTaskId = null, onOpen }) {
  const [inspectedId, setInspectedId] = useState(null)

  const bags = orderedBags(tasks)
  const inspected = inspectedId != null
    ? tasks.find(t => t.id === inspectedId)
    : null

  return (
    <>
      <div
        className="relative w-full select-none cursor-pointer active:scale-[0.98] transition-transform"
        style={{ height: 52 }}
        onClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
        role="button"
        tabIndex={0}
        aria-label="Open today's list"
        title="Open today's list"
      >
        {/* Bags — a single packed row, no gaps, rising out of the box.
            items-end keeps every bag on one baseline; the front panel (higher
            z-index) covers their lower half so they sit inside the box. */}
        <div
          className="absolute left-0 right-0 flex items-end justify-start px-3"
          style={{ bottom: 14 }}
        >
          {bags.map(t => {
            const isProject = !!t.project_name
            const colors = isProject
              ? TAG_COLORS.project
              : (TAG_COLORS[t.task_type] || TAG_COLORS.task)
            const active = activeTaskId != null && t.id === activeTaskId
            return (
              <div
                key={t.id}
                onClick={e => { e.stopPropagation(); setInspectedId(t.id) }}
                title={t.title}
                className="cursor-pointer"
                style={{
                  position: 'relative',
                  width: 15,
                  height: 34,
                  background: colors.bg,
                  border: `1.5px solid ${colors.border}`,
                  borderTopWidth: 3,           // thicker top edge — the crimped teabag fold
                  borderRadius: '3px 3px 2px 2px',
                  zIndex: active ? 2 : 1,
                  filter: active ? 'none' : 'saturate(0.85) brightness(0.94)',
                  boxShadow: active
                    ? `0 0 0 2px #FFF6E4, 0 2px 7px rgba(0,0,0,0.4)`
                    : `1px 1px 0 ${colors.shadow}`,
                  transition: 'filter 200ms ease, box-shadow 200ms ease',
                }}
              />
            )
          })}
        </div>

        {/* Box front panel — mild wood texture with a lit top lip and an inset
            interior shadow so the bags read as standing inside the box. */}
        <div
          className="absolute left-0 right-0 bottom-0"
          style={{
            height: 36,
            background: `
              repeating-linear-gradient(0deg,
                rgba(60,38,18,0) 0px,
                rgba(60,38,18,0.07) 3px,
                rgba(255,240,214,0.05) 6px,
                rgba(60,38,18,0) 11px),
              linear-gradient(180deg, #BE9A66 0%, #A37F4C 100%)
            `,
            borderRadius: '5px 5px 7px 7px',
            border: '2px solid #8A6B40',
            borderTopColor: '#DDBB86',   // lit lip — the open top edge of the box
            borderBottomWidth: 3,
            boxShadow: 'inset 0 7px 9px -5px rgba(45,26,8,0.6)',
            zIndex: 3,   // above the bags (1/2) so it covers their lower half
          }}
        />
      </div>

      {inspected && (
        <InspectCard task={inspected} onClose={() => setInspectedId(null)} />
      )}
    </>
  )
}
