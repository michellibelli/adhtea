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

// Shiny gold — a completed bonus task drops into the box as one of these.
const GOLD = {
  bg: 'linear-gradient(135deg, #F6E29A 0%, #E4B63C 38%, #F3D777 58%, #C9971F 100%)',
  border: '#A6781C',
  shadow: '#7C5912',
}

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
// sort by their actual time, untimed tasks are spread through the day. The
// result is a single packed row — placement is approximate, not a timeline.
function orderedBags(tasks) {
  const capped = [...tasks]
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    .slice(0, BOX_CAPACITY)
  // Untimed bags get a stable slot from their id order. Next rewrites
  // sort_order, so ordering untimed bags by sort_order would reshuffle the
  // whole row on every press — the box must stay put while the focus moves.
  const untimed = capped.filter(t => !t.due_time).sort((a, b) => a.id - b.id)
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

// One bag in the box. `gold` bags are completed bonus tasks — decorative,
// no inspect. Each bag renders as a tag + string + body stack so the box
// reads as teabags, not as a row of tiny books (the bookshelf backdrop
// has narrow rectangles of similar muted colours).
function Bag({ colors, active, gold, onClick, title }) {
  const stringColor = '#3F2F1A'
  return (
    <div
      onClick={onClick}
      title={title}
      className={gold ? '' : 'cursor-pointer'}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 15,
        zIndex: active ? 2 : 1,
        // Bag colours pull from the same muted TAG_COLORS used by the
        // Focus tag + bookshelf, which made the bags too pale in the
        // tea-box. Re-saturate by 25% here only — keeps the rest of
        // the app calm but lets the bags pop against the wood + bg.
        filter: gold ? undefined : 'saturate(1.25)',
      }}
    >
      {/* Paper tag — small square cap at the top of the string */}
      <div style={{
        width: 7,
        height: 4,
        background: colors.bg,
        border: `0.6px solid ${colors.border}`,
        borderRadius: 1,
      }} />
      {/* String connecting tag to bag body */}
      <div style={{
        width: 1,
        height: 5,
        background: stringColor,
        opacity: 0.65,
      }} />
      {/* Bag body — the bulk of the teabag */}
      <div style={{
        width: 15,
        height: 28,
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderTopWidth: 2.5,           // crimped fold
        borderRadius: '3px 3px 2px 2px',
        boxShadow: active
          ? `0 0 0 2px #241A0F, 0 1px 5px rgba(0,0,0,0.45)`
          : `1px 1px 0 ${colors.shadow}`,
        transition: 'box-shadow 200ms ease',
      }} />
    </div>
  )
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
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: colors.text, opacity: 0.75 }}>
          {label}{time ? ` · ${time}` : ''}
        </p>
        <p className="text-base font-bold leading-snug break-words" style={{ color: colors.text }}>
          {task.title}
        </p>
      </div>
    </div>,
    document.body
  )
}

// Tea-box for the Focus page. 2D side profile, no lid: an open box holding
// today's tasks as bags in a single packed row, ordered roughly morning →
// evening. As today's tasks are completed the coloured bags drain; completed
// bonus tasks (goldCount) refill the box as gold bags. Clicking the box opens
// Today; clicking a bag inspects that task.
export default function TeaBox({ tasks = [], activeTaskId = null, goldCount = 0, onOpen }) {
  const [inspectedId, setInspectedId] = useState(null)

  const colored = orderedBags(tasks).slice(0, BOX_CAPACITY)
  const goldShown = Math.max(0, Math.min(goldCount, BOX_CAPACITY - colored.length))
  const boxFull = goldCount >= BOX_CAPACITY

  const inspected = inspectedId != null
    ? tasks.find(t => t.id === inspectedId)
    : null

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
          {colored.map(t => {
            const isProject = !!t.project_name
            const colors = isProject
              ? TAG_COLORS.project
              : (TAG_COLORS[t.task_type] || TAG_COLORS.task)
            const active = activeTaskId != null && t.id === activeTaskId
            return (
              <Bag
                key={t.id}
                colors={colors}
                active={active}
                title={t.title}
                onClick={e => { e.stopPropagation(); setInspectedId(t.id) }}
              />
            )
          })}
          {Array.from({ length: goldShown }).map((_, i) => (
            <Bag key={`gold-${i}`} colors={GOLD} gold title="Bonus task done" />
          ))}
        </div>

        {/* Box front panel — layered wood-grain texture (fine + coarse
            stripes at slight angles) on a warm oak gradient. Top lip
            softened to a warm cream-tan instead of the prior bright
            highlight; borders thinned for a less video-game-y look. */}
        <div
          className="absolute left-0 right-0 bottom-0"
          style={{
            height: 36,
            background: `
              repeating-linear-gradient(1.5deg,
                rgba(50,30,10,0) 0px,
                rgba(50,30,10,0.06) 2px,
                rgba(50,30,10,0) 4px),
              repeating-linear-gradient(0deg,
                rgba(60,38,18,0) 0px,
                rgba(60,38,18,0.11) 1px,
                rgba(60,38,18,0) 5px,
                rgba(255,238,206,0.09) 9px,
                rgba(60,38,18,0) 14px),
              linear-gradient(180deg, #C49A66 0%, #A57A48 100%)
            `,
            borderRadius: '4px 4px 7px 7px',
            border: '1.5px solid #7A5A30',
            borderTopColor: '#C9A26E',
            borderBottomWidth: 2,
            boxShadow: 'inset 0 5px 7px -4px rgba(45,26,8,0.5)',
            zIndex: 3,
          }}
        />
      </div>

      {inspected && (
        <InspectCard task={inspected} onClose={() => setInspectedId(null)} />
      )}
    </>
  )
}
