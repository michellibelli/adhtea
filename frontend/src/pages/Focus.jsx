import { useState, useEffect, useCallback } from 'react'
import { getToday, completeTask, snoozeTask, deferTask, getBonusTasks } from '../api/tasks'
import { getTodayCapacity } from '../api/selfcare'
import SnoozeSheet from '../components/SnoozeSheet'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'

const TYPE_ICONS  = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }
const TYPE_LABELS = { task: 'Task', appointment: 'Appointment', routine: 'Routine', note: 'Note' }
const PRIORITY_BADGE = {
  urgent: 'bg-red-500/20 text-red-400',
  high:   'bg-amber-500/20 text-amber-400',
}

function pickNext(tasks) {
  const copy = [...tasks]
  copy.sort((a, b) => {
    if (a.task_type === 'appointment' && a.due_time && !(b.task_type === 'appointment' && b.due_time)) return -1
    if (b.task_type === 'appointment' && b.due_time && !(a.task_type === 'appointment' && a.due_time)) return 1
    return (a.sort_order ?? 999) - (b.sort_order ?? 999)
  })
  return copy[0] ?? null
}

export default function Focus({ onGoToList, onTriage, doneCount = 0 }) {
  const [tasks,       setTasks]       = useState([])
  const [bonusTasks,  setBonusTasks]  = useState([])
  const [capacity,    setCapacity]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [leaving,     setLeaving]     = useState(false)
  const [showSnooze,  setShowSnooze]  = useState(false)
  const [localDone,   setLocalDone]   = useState(0)

  const fetchAll = useCallback(async () => {
    try {
      const [list, cap] = await Promise.all([getToday(), getTodayCapacity()])
      setTasks(list)
      setCapacity(cap)
      if (list.length === 0) {
        const bonus = await getBonusTasks()
        setBonusTasks(bonus)
      } else {
        setBonusTasks([])
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const isBonusMode = tasks.length === 0 && bonusTasks.length > 0
  const activeList  = isBonusMode ? bonusTasks : tasks
  const task        = pickNext(activeList)
  const remaining   = activeList.length
  const totalDone   = doneCount + localDone

  async function advance(fn) {
    setLeaving(true)
    await fn()
    setLeaving(false)
    if (isBonusMode) {
      // optimistic remove + background sync
      setBonusTasks((prev) => prev.filter((t) => t.id !== task.id))
    } else {
      fetchAll()
    }
  }

  async function handleComplete() {
    if (!task) return
    setLocalDone((n) => n + 1)
    if (isBonusMode) {
      setLeaving(true)
      await completeTask(task.id)
      setLeaving(false)
      setBonusTasks((prev) => prev.filter((t) => t.id !== task.id))
    } else {
      await advance(() => completeTask(task.id))
    }
  }

  async function handleDefer() {
    if (!task) return
    await advance(() => deferTask(task.id))
  }

  function handleBonusSkip() {
    if (!task) return
    setLeaving(true)
    setTimeout(() => {
      setLeaving(false)
      setBonusTasks((prev) => prev.filter((t) => t.id !== task.id))
    }, 250)
  }

  async function handleSnooze(isoDate) {
    if (!task) return
    setShowSnooze(false)
    if (isBonusMode) {
      setLeaving(true)
      await snoozeTask(task.id, isoDate)
      setLeaving(false)
      setBonusTasks((prev) => prev.filter((t) => t.id !== task.id))
    } else {
      await advance(() => snoozeTask(task.id, isoDate))
    }
  }

  if (loading) {
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">…</p></div>
  }

  // All done — no today tasks AND no bonus tasks
  if (!task) {
    return (
      <div className="aria-page flex items-center justify-center">
        <div className="px-6 pb-32 md:pb-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">✦</div>
          <h2 className="text-lg font-semibold text-ui-text mb-2">
            {totalDone > 0 ? `${totalDone} done today` : 'Nothing scheduled'}
          </h2>
          <p className="text-sm text-ui-subtext mb-6">
            {totalDone > 0
              ? 'Your list is clear. Rest, or check your inbox for more.'
              : 'Add something from Capture, or run triage to schedule from your inbox.'}
          </p>
          <div className="flex flex-col gap-2">
            {onGoToList && (
              <Button variant="secondary" onClick={onGoToList}>See full list</Button>
            )}
            {onTriage && (
              <Button variant="ghost" onClick={onTriage}>Open inbox →</Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="aria-page flex flex-col">
      <div className="flex-1 flex flex-col px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className={`text-sm font-semibold tracking-wide uppercase ${
              isBonusMode ? 'text-amber-400' : 'text-ui-subtext'
            }`}>
              {isBonusMode ? 'Bonus' : 'Now'}
            </h1>
            {onTriage && (
              <button onClick={onTriage} className="text-xs text-ui-subtext hover:text-ui-accent transition-colors">
                Triage ↻
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {totalDone > 0 && (
              <span className="text-xs text-ui-subtext">{totalDone} done</span>
            )}
            <span className="text-xs text-ui-subtext">
              {isBonusMode ? `${remaining} bonus` : `${remaining} left`}
            </span>
            {onGoToList && (
              <button onClick={onGoToList} className="text-xs text-ui-subtext hover:text-ui-accent transition-colors">
                See all →
              </button>
            )}
          </div>
        </div>

        <CapacityBar capacity={capacity} compact />

        {/* Card */}
        <div className={`flex-1 flex flex-col justify-center transition-all duration-300 ${leaving ? 'opacity-0 translate-y-2' : 'opacity-100'}`}>

          {/* Bonus glow ring wrapper */}
          <div className={isBonusMode
            ? 'rounded-2xl ring-1 ring-amber-400/40 shadow-lg shadow-amber-400/10'
            : ''
          }>
            <Card className="px-6 py-8">

              {/* Type + priority */}
              <div className="flex items-center gap-2 mb-5">
                <span className={`text-base ${isBonusMode ? 'text-amber-400' : 'text-ui-accent'}`}>
                  {TYPE_ICONS[task.task_type] || '✦'}
                </span>
                <span className="text-xs text-ui-subtext">{TYPE_LABELS[task.task_type] || 'Task'}</span>
                {isBonusMode && (
                  <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-400">
                    Tomorrow
                  </span>
                )}
                {!isBonusMode && task.priority && PRIORITY_BADGE[task.priority] && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ml-auto ${PRIORITY_BADGE[task.priority]}`}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </span>
                )}
              </div>

              <h2 className="text-xl font-semibold text-ui-text leading-snug mb-3">
                {task.title}
              </h2>

              {(task.due_time || task.due_date) && (
                <div className="flex items-center gap-1.5 mb-3 text-sm text-ui-subtext">
                  <span>◷</span>
                  <span>
                    {task.due_time
                      ? `${task.due_time}${task.due_date ? ` · ${task.due_date}` : ''}`
                      : task.due_date}
                  </span>
                </div>
              )}

              {task.location_detail && (
                <div className="mb-3 text-sm text-ui-subtext">
                  <span className="mr-1.5">📍</span>
                  <span>{task.location_detail}</span>
                </div>
              )}

              {task.notes && (
                <p className="text-sm text-ui-subtext leading-relaxed border-t border-ui-border pt-3 mt-3">
                  {task.notes}
                </p>
              )}

            </Card>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-col gap-2">
            <Button
              size="lg"
              onClick={handleComplete}
              className={`w-full ${isBonusMode ? 'bg-amber-500 hover:bg-amber-400 text-white border-transparent' : ''}`}
            >
              Done ✓
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowSnooze(true)}>
                Snooze
              </Button>
              {isBonusMode ? (
                <Button variant="ghost" className="flex-1" onClick={handleBonusSkip}>
                  Skip
                </Button>
              ) : (
                <Button variant="ghost" className="flex-1" onClick={handleDefer}>
                  Back to inbox
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Progress dots */}
        {remaining > 1 && (
          <div className="flex justify-center gap-1 mt-4">
            {Array.from({ length: Math.min(remaining, 8) }).map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${
                i === 0
                  ? (isBonusMode ? 'bg-amber-400' : 'bg-ui-accent')
                  : 'bg-ui-border'
              }`} />
            ))}
            {remaining > 8 && <span className="text-[10px] text-ui-subtext ml-1">+{remaining - 8}</span>}
          </div>
        )}

      </div>

      {showSnooze && <SnoozeSheet onSnooze={handleSnooze} onClose={() => setShowSnooze(false)} />}
    </div>
  )
}
