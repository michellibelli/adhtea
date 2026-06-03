import { TAG_COLORS } from '../utils/taskColors'

// The box holds at most 15 bags — a fully-triaged day never exceeds the
// max_total_per_day cap, so this is also the natural display limit.
const BOX_CAPACITY = 15

const GOLD = {
  bg: 'linear-gradient(135deg, #F6E29A 0%, #E4B63C 38%, #F3D777 58%, #C9971F 100%)',
  border: '#A6781C',
  shadow: '#7C5912',
}

// Order bags left-to-right by triage priority (sort_order).
function orderedBags(tasks) {
  return [...tasks]
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    .slice(0, BOX_CAPACITY)
}

// One bag in the box. `gold` bags are completed bonus tasks — decorative,
// not selectable. Each bag renders as a tag + string + body stack so the box
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
        width: 20,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
        flexShrink: 0,
        zIndex: active ? 2 : 1,
        // Bag colours pull from the same muted TAG_COLORS used by the
        // Focus tag + bookshelf, which made the bags too pale in the
        // tea-box. Re-saturate by 25% here only — keeps the rest of
        // the app calm but lets the bags pop against the wood + bg.
        filter: gold ? undefined : 'saturate(1.25)',
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
        boxShadow: active
          ? `0 0 0 2px #241A0F, 0 1px 5px rgba(0,0,0,0.45)`
          : `1px 1px 0 ${colors.shadow}`,
        transition: 'box-shadow 200ms ease',
      }} />
    </div>
  )
}

// Tea-box for the Focus page. 2D side profile, no lid: an open box holding
// today's tasks as bags in a single packed row, ordered roughly morning →
// evening. As today's tasks are completed the coloured bags drain; completed
// bonus tasks (goldCount) refill the box as gold bags. Clicking the box opens
// Today; clicking a bag focuses that task on the Focus card (via onSelectTask)
// so the user can act on a specific item — e.g. an 8am routine done at 9am
// that the time-of-day window would otherwise keep off the card.
export default function TeaBox({ tasks = [], activeTaskId = null, goldCount = 0, onOpen, onSelectTask, onNavigate }) {
  const colored = orderedBags(tasks).slice(0, BOX_CAPACITY)
  const goldShown = Math.max(0, Math.min(goldCount, BOX_CAPACITY - colored.length))
  const boxFull = goldCount >= BOX_CAPACITY

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
        style={{ height: 62 }}
        onClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
        role="button"
        tabIndex={0}
        aria-label="Open today's list"
        title="Open today's list"
      >
        <div
          className="absolute left-0 right-0 flex items-end justify-start px-3 overflow-hidden"
          style={{ bottom: 16, transition: 'all 0.3s ease' }}
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
                onClick={e => { e.stopPropagation(); onSelectTask?.(t.id) }}
              />
            )
          })}
          {Array.from({ length: goldShown }).map((_, i) => (
            <Bag key={`gold-${i}`} colors={GOLD} gold title="Bonus task done" />
          ))}
        </div>

        {/* Box front panel */}
        <div
          className="absolute left-0 right-0 bottom-0"
          style={{
            height: 40,
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
