import { TAG_COLORS } from '../utils/taskColors'

// The box holds at most 15 bags — a fully-triaged day never exceeds the
// max_total_per_day cap, so this is also the natural display limit.
const BOX_CAPACITY = 15

// Mild wood texture — warm-brown base + faint horizontal grain streaks.
const WOOD_BG = `
  repeating-linear-gradient(0deg,
    rgba(60,38,18,0) 0px,
    rgba(60,38,18,0.07) 3px,
    rgba(255,240,214,0.05) 6px,
    rgba(60,38,18,0) 11px),
  linear-gradient(180deg, #BE9A66 0%, #A37F4C 100%)
`

// Phase 1 — static tea-box for the Focus page. 2D side profile, no lid: an
// open box with today's tasks standing in it as bags, each tinted by task
// type. The bag matching the current Focus pick is raised + highlighted.
// Click handlers + animations land in later phases.
export default function TeaBox({ tasks = [], activeTaskId = null }) {
  // Bags in triage priority order (same order the Focus "Next" button walks),
  // capped at the box capacity.
  const bags = [...tasks]
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    .slice(0, BOX_CAPACITY)

  return (
    <div className="relative w-full select-none" style={{ height: 72 }}>
      {/* Bags — stand behind the box front panel, poking up above the rim */}
      <div
        className="absolute left-0 right-0 flex items-end justify-center gap-[2px] px-3"
        style={{ bottom: 22 }}
      >
        {bags.map(t => {
          const isProject = !!t.project_name
          const colors = isProject
            ? TAG_COLORS.project
            : (TAG_COLORS[t.task_type] || TAG_COLORS.task)
          const active = activeTaskId != null && t.id === activeTaskId
          return (
            <div key={t.id} className="flex flex-col items-center" style={{ width: 14 }}>
              {/* string */}
              <div
                style={{
                  width: 2,
                  height: active ? 8 : 5,
                  background: '#B8AE98',
                  transition: 'height 200ms ease',
                }}
              />
              {/* bag */}
              <div
                style={{
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

      {/* Box front panel — mild wood texture, covers the lower part of the bags */}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          height: 40,
          background: WOOD_BG,
          borderRadius: '6px 6px 7px 7px',
          border: '2px solid #8A6B40',
          borderBottomWidth: 3,
        }}
      />
    </div>
  )
}
