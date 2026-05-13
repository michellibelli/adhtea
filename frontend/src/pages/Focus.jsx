import { useState, useEffect, useCallback, useRef } from 'react'
import { getToday, completeTask, snoozeTask, deferTask, getBonusTasks } from '../api/tasks'
import { getTodayCapacity } from '../api/selfcare'
import { logout } from '../api/auth'
import SnoozeSheet from '../components/SnoozeSheet'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'
import HamburgerMenu from '../components/HamburgerMenu'

const TEA_PUNS = [
  "Steeped in success! 🍵",
  "You're brewtiful! ☕",
  "That was tea-riffic! ✨",
  "Oolong way, you did it! 🍃",
  "Matcha this energy! 💚",
  "Earl Grey-t work! 👏",
  "You're on a rolling boil! 🌊",
  "Chai-ve, that's done! 🫖",
  "Pekoe-sitively crushing it! 🌸",
  "You're steep-endous! 🏆",
  "Infuse-iastic! ☕✨",
  "No steep too deep! 🌿",
]

const TYPE_ICONS  = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }
const TYPE_LABELS = { task: 'Task', appointment: 'Appointment', routine: 'Routine', note: 'Note' }
const PRIORITY_BADGE = {
  urgent: 'bg-red-500/20 text-red-400',
  high:   'bg-amber-500/20 text-amber-400',
}

function minutesUntil(dueTime) {
  const [h, m] = dueTime.split(':').map(Number)
  const now = new Date()
  const due = new Date(now)
  due.setHours(h, m, 0, 0)
  return (due - now) / 60000
}

function isImminent(task) {
  if (!task.due_time) return false
  if (task.task_type !== 'appointment' && task.task_type !== 'routine') return false
  return minutesUntil(task.due_time) <= 5
}

function pickNext(tasks) {
  // Timed routines are invisible until 5 min before their scheduled time
  const visible = tasks.filter(t => {
    if (t.task_type === 'routine' && t.due_time) return minutesUntil(t.due_time) <= 5
    return true
  })
  const copy = [...visible]
  copy.sort((a, b) => {
    const aImm = isImminent(a)
    const bImm = isImminent(b)
    if (aImm && !bImm) return -1
    if (bImm && !aImm) return 1
    return (a.sort_order ?? 999) - (b.sort_order ?? 999)
  })
  return copy[0] ?? null
}

export default function Focus({ onGoToList, onTriage, onNavigate, doneCount = 0 }) {
  const [tasks,       setTasks]       = useState([])
  const [bonusTasks,  setBonusTasks]  = useState([])
  const [capacity,    setCapacity]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [leaving,     setLeaving]     = useState(false)
  const [celebrate,   setCelebrate]   = useState(false)  // false | 'p1' | 'p2' | 'p3'
  const punRef = useRef('')
  const [showSnooze,  setShowSnooze]  = useState(false)
  const [showMenu,    setShowMenu]    = useState(false)
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
    punRef.current = TEA_PUNS[Math.floor(Math.random() * TEA_PUNS.length)]
    setCelebrate('p1')
    setTimeout(() => setCelebrate('p2'), 720)
    setTimeout(() => setCelebrate('p3'), 1180)
    setTimeout(() => setCelebrate(false), 4300)
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
      <div className="aria-page flex items-center justify-center md:pl-20">
        <div className="px-6 pb-32 md:pb-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4 sparkle" style={{color:'#C490D1'}}>✦</div>
          <h2 className="text-sm pixel-heading text-ui-text mb-2">
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

        {/* Header — replaced by celebration during task complete */}
        {celebrate ? (
          <div
            className="relative overflow-hidden mb-4 cursor-pointer select-none"
            style={{ height: '52px' }}
            onClick={() => setCelebrate(false)}
          >
            {/* Train: cup + rainbow slide in as a unit */}
            {celebrate !== 'p3' && (
              <div
                className="absolute inset-0 flex items-center"
                style={{
                  animation: celebrate === 'p1'
                    ? 'celebrate-slide-in 720ms ease-out forwards'
                    : 'none',
                  transform: celebrate === 'p2' ? 'translateX(0)' : undefined,
                }}
              >
                {/* Rainbow strip */}
                <div
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '3px 3px 3px 3px',
                    background: 'linear-gradient(to right, #ED8E89, #F7B685, #F3EBA5, #94C691, #9BD6D9, #B4A8E0)',
                    transformOrigin: 'right center',
                    animation: celebrate === 'p2'
                      ? 'celebrate-rainbow-shrink 420ms ease-in forwards'
                      : 'none',
                  }}
                />
                {/* Cup — overlaps the rainbow front end */}
                <span style={{
                  fontSize: '2em', lineHeight: 1, flexShrink: 0,
                  paddingRight: '4px', marginLeft: '-0.9em',
                  position: 'relative', zIndex: 1,
                }}>☕</span>
              </div>
            )}
            {/* Pun text */}
            {celebrate === 'p3' && (
              <div
                className="absolute inset-0 flex items-center justify-center gap-2"
                style={{ animation: 'celebrate-pun-in 280ms ease-out forwards' }}
              >
                <span className="sparkle" style={{ fontSize: '1.1em', color: '#C490D1' }}>✨</span>
                <span className="text-sm font-semibold" style={{ color: '#3D2B1F' }}>{punRef.current}</span>
                <span className="sparkle" style={{ fontSize: '1.1em', color: '#C490D1', animationDelay: '0.5s' }}>✨</span>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h1 className={`text-[10px] font-pixel ${
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
                {onNavigate && (
                  <button
                    onClick={() => setShowMenu(true)}
                    className="text-ui-subtext hover:text-ui-text transition-colors p-1 md:hidden"
                    aria-label="Menu"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <CapacityBar capacity={capacity} compact />
          </>
        )}

        {/* Card — dunks during celebration, normal fade otherwise */}
        <div
          className={`flex-1 flex flex-col justify-center ${
            celebrate
              ? ''
              : `transition-all duration-300 ${leaving ? 'opacity-0 translate-y-2' : 'opacity-100'}`
          }`}
          style={celebrate ? { animation: 'celebrate-card-dunk 680ms ease-in 440ms both' } : undefined}
        >

          {/* Bonus glow ring wrapper */}
          <div className={isBonusMode
            ? 'rounded-2xl ring-1 ring-amber-400/40 shadow-lg shadow-amber-400/10'
            : ''
          }>
            <Card className="px-8 py-10 min-h-[220px]">

              {/* Type + priority */}
              <div className="flex items-center gap-2 mb-7">
                <span className={`text-xl ${isBonusMode ? 'text-amber-400' : 'text-ui-accent'}`}>
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

              <h2 className="text-3xl font-bold text-ui-text leading-snug mb-3">
                {task.title}
              </h2>

              {(task.due_time || task.due_date) && (
                <div className="flex items-center gap-1.5 mb-3">
                  <span className={`inline-flex items-center gap-1.5 text-base px-2.5 py-0.5 rounded-full ${
                    isImminent(task)
                      ? 'bg-amber-400/20 text-amber-400'
                      : 'text-ui-subtext'
                  }`}>
                    <span>◷</span>
                    <span>
                      {task.due_time
                        ? `${task.due_time}${task.due_date ? ` · ${task.due_date}` : ''}`
                        : task.due_date}
                    </span>
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
          <div className="mt-4 flex flex-col gap-2 relative">
            <Button
              size="lg"
              onClick={handleComplete}
              className={`w-full ${isBonusMode ? 'bg-amber-500 hover:bg-amber-400 text-white border-transparent' : 'pixel-btn-rainbow'}`}
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
              <div key={i} className={`w-2 h-2 rounded-full ${
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
      {showMenu && onNavigate && (
        <HamburgerMenu
          onNavigate={onNavigate}
          onClose={() => setShowMenu(false)}
          onLogout={() => logout().then(() => window.location.reload())}
        />
      )}
    </div>
  )
}
