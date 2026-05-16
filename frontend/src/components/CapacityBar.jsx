// The five inputs that feed into the capacity score.
// Each key matches a field in the CapacitySnapshot returned by the API.
const SOURCES = [
  { key: 'sleep_battery',       label: 'Sleep', color: 'bg-indigo-400' },
  { key: 'nutrition_battery',   label: 'Food',  color: 'bg-amber-400'  },
  { key: 'physical_battery',    label: 'Body',  color: 'bg-emerald-400'},
  { key: 'emotional_battery',   label: 'Mood',  color: 'bg-rose-400'   },
  { key: 'executive_capacitor', label: 'Focus', color: 'bg-violet-400' },
]

// Thresholds for the executive function (focus) score, 0–100.
// Below EXEC_OK the app surfaces a coaching note encouraging lighter work.
const EXEC_GOOD = 70  // above this → no note shown
const EXEC_OK   = 50  // above this → mild note
const EXEC_LOW  = 30  // above this → moderate note; below → heavy note

function execNote(val) {
  // Returns a coaching message when focus capacity is reduced, or null when it's fine.
  if (val >= EXEC_GOOD) return null
  if (val >= EXEC_OK)   return 'Focus may be a bit harder today'
  if (val >= EXEC_LOW)  return 'Executive tasks will take more effort — lean on your routines'
  return 'Focus is low today — lean into light tasks and self-care'
}

// compact=true: single overall bar + note (for Today / Triage headers)
// compact=false: full source breakdown (for SelfCare page)
export default function CapacityBar({ capacity, compact = false, hideLabels = false, className }) {
  if (!capacity) {
    if (hideLabels) return null
    return (
      <div className="px-4 py-2.5 rounded-2xl bg-ui-surface border border-ui-border">
        <p className="text-xs text-ui-subtext">Log your morning to see today's capacity</p>
      </div>
    )
  }

  const note = execNote(capacity.executive_capacitor)

  if (compact) {
    const pct = capacity.overall
    const color = pct >= 70 ? 'bg-emerald-400' : pct >= 45 ? 'bg-blue-400' : pct >= 25 ? 'bg-amber-400' : 'bg-red-400'
    return (
      <div className={className ?? 'mb-4'}>
        {!hideLabels && (
          <div className="flex items-center justify-between mb-1 px-0.5">
            <span className="text-sm text-ui-subtext">Focus</span>
          </div>
        )}
        <div className="h-2.5 rounded-full bg-ui-border overflow-hidden">
          <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        {!hideLabels && note && <p className="text-[13px] text-ui-subtext mt-1 px-0.5">{note}</p>}
      </div>
    )
  }

  return (
    <div className="px-4 py-3 rounded-2xl bg-ui-surface border border-ui-border">
      <div className="space-y-2">
        {SOURCES.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-ui-subtext w-10 flex-shrink-0">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-ui-border overflow-hidden">
              <div
                className={`h-full rounded-full ${color} transition-all duration-500`}
                style={{ width: `${capacity[key]}%` }}
              />
            </div>
            <span className="text-[10px] text-ui-subtext w-6 text-right">{Math.round(capacity[key])}</span>
          </div>
        ))}
      </div>
      {note && <p className="text-xs text-ui-subtext pt-2 mt-2 border-t border-ui-border">{note}</p>}
    </div>
  )
}
