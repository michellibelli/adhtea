import { TAG_COLORS } from '../utils/taskColors'

// The box holds at most 15 bags — a fully-triaged day never exceeds the
// max_total_per_day cap, so this is also the natural display limit.
const BOX_CAPACITY = 15

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
    <div className="relative w-full select-none" style={{ height: 96 }}>
      {/* Bags — stand behind the box front panel, poking up above the rim */}
      <div
        className="absolute left-0 right-0 flex items-end justify-center gap-[3px] px-3"
        style={{ bottom: 30 }}
      >
        {bags.map(t => {
          const isProject = !!t.project_name
          const colors = isProject
            ? TAG_COLORS.project
            : (TAG_COLORS[t.task_type] || TAG_COLORS.task)
          const active = activeTaskId != null && t.id === activeTaskId
          return (
            <div key={t.id} className="flex flex-col items-center" style={{ width: 18 }}>
              {/* string */}
              <div
                style={{
                  width: 2,
                  height: active ? 9 : 6,
                  background: '#B8AE98',
                  transition: 'height 200ms ease',
                }}
              />
              {/* bag */}
              <div
                style={{
                  width: 18,
                  height: 40,
                  background: colors.bg,
                  border: `1.5px solid ${colors.border}`,
                  borderRadius: 3,
                  transform: active ? 'translateY(-7px)' : 'none',
                  boxShadow: active
                    ? `0 0 0 2px ${colors.border}, 0 5px 9px rgba(0,0,0,0.28)`
                    : `1px 1px 0 ${colors.shadow}`,
                  transition: 'transform 200ms ease, box-shadow 200ms ease',
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Box front panel — kraft-coloured, covers the lower part of the bags */}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          height: 46,
          background: 'linear-gradient(180deg, #C9A876 0%, #B8966A 100%)',
          borderRadius: '4px 4px 7px 7px',
          border: '2px solid #9B7A4E',
          borderBottomWidth: 3,
        }}
      >
        {/* Label band — letterpress treatment lands in the cafe-typography pass */}
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
          style={{
            top: 13,
            width: '64%',
            height: 20,
            border: '1.5px solid #9B7A4E',
            borderRadius: 3,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#6B5436' }}>
            TODAY
          </span>
        </div>
      </div>
    </div>
  )
}
