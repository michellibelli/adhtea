import { useState, useEffect, useCallback, useRef } from 'react'
import { getToday, completeTask, snoozeTask, deferTask, getBonusTasks, getDoneToday, updateTask } from '../api/tasks'
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
const TAG_COLORS = {
  task:        { bg: 'linear-gradient(135deg, #C97068, #E8968C)', border: '#9B4E4E', shadow: '#7A3030' },
  appointment: { bg: 'linear-gradient(135deg, #5B8FD4, #7FB3F0)', border: '#3D6FA8', shadow: '#2A5080' },
  routine:     { bg: 'linear-gradient(135deg, #5BA876, #7FC898)', border: '#3D7A56', shadow: '#2A5A3C' },
  note:        { bg: 'linear-gradient(135deg, #9068C9, #B48CE8)', border: '#6A4A9B', shadow: '#4A3070' },
  project:     { bg: 'linear-gradient(135deg, #C98A40, #E8B268)', border: '#9B6A2E', shadow: '#7A4A18' },
}
const TAG_NAMES = {
  task: 'Task', appointment: 'Appt', routine: 'Routine', note: 'Note', project: 'Project',
}

function minutesUntil(dueTime) {
  const [h, m] = dueTime.split(':').map(Number)
  const now = new Date()
  const due = new Date(now)
  due.setHours(h, m, 0, 0)
  return (due - now) / 60000
}

function tagDateLabel(task) {
  if (!task) return null
  if (task.due_time) {
    const [h, m] = task.due_time.split(':').map(Number)
    const ampm = h >= 12 ? 'p' : 'a'
    const hour = h % 12 || 12
    return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
  }
  if (task.due_date) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const d = new Date(task.due_date + 'T00:00:00')
    if (d <= today) return 'Today'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return null
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

function TeaCupBack() {
  // Back of cup — renders BEHIND the bag
  // Tea pool + back arc of rim (top half of oval = the far side)
  return (
    <svg width="150" height="117" viewBox="0 0 110 86" fill="none">
      <ellipse cx="52" cy="22" rx="34" ry="4.5" fill="#DBA96A" opacity="0.55"/>
      <path d="M 14 22 A 38 6.5 0 0 0 90 22" stroke="#C4A882" strokeWidth="2.5" fill="none"/>
    </svg>
  )
}

function TeaCupFront() {
  // Front of cup — renders IN FRONT of the bag
  // Base, body (front wall), handle, rim fill + front arc of rim (bottom half of oval = near side)
  return (
    <svg width="150" height="117" viewBox="0 0 110 86" fill="none">
      <ellipse cx="52" cy="77" rx="46" ry="7" fill="#EDD5A8" stroke="#C4A882" strokeWidth="2"/>
      <path d="M 14 22 L 90 22 L 80 71 L 24 71 Z" fill="#F5ECD7" stroke="#C4A882" strokeWidth="2.5"/>
      <path d="M 90 32 Q 108 32 108 50 Q 108 66 90 62" stroke="#C4A882" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="52" cy="22" rx="38" ry="6.5" fill="#EDD5A8" stroke="none"/>
      <path d="M 14 22 A 38 6.5 0 0 1 90 22" stroke="#C4A882" strokeWidth="2.5" fill="none"/>
    </svg>
  )
}

function EditTaskSheet({ task, onSave, onClose }) {
  const [title,   setTitle]   = useState(task.title)
  const [notes,   setNotes]   = useState(task.notes || '')
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [dueTime, setDueTime] = useState(task.due_time || '')

  async function handleSave() {
    await onSave({
      title:    title.trim() || task.title,
      notes:    notes.trim() || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
    })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-ui-surface border-t border-ui-border rounded-t-2xl pb-safe md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-96 md:rounded-2xl md:border">
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-ui-border" />
        </div>
        <div className="px-4 pt-2 pb-6 space-y-3">
          <p className="text-base font-semibold text-ui-text">Edit task</p>
          <input
            className="w-full text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
            placeholder="Task title"
            autoFocus
          />
          <textarea
            className="w-full text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors resize-none"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Notes…"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="flex-1 text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors"
            />
            {(task.task_type === 'appointment' || task.task_type === 'routine') && (
              <input
                type="time"
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="flex-1 text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors"
              />
            )}
          </div>
          <Button onClick={handleSave} className="w-full">Save</Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </>
  )
}

export default function Focus({ onGoToList, onTriage, onNavigate, doneCount = 0 }) {
  const [tasks,       setTasks]       = useState([])
  const [bonusTasks,  setBonusTasks]  = useState([])
  const [capacity,    setCapacity]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [leaving,     setLeaving]     = useState(false)
  const [celebrate,   setCelebrate]   = useState(false)  // false | 'dunk' | 'p1' | 'p2' | 'p3'
  const punRef = useRef('')
  const completedTaskRef     = useRef(null)  // { taskId, wasBonus }
  const celebrationTimersRef = useRef([])
  const [showSnooze,    setShowSnooze]    = useState(false)
  const [showMenu,      setShowMenu]      = useState(false)
  const [showEdit,      setShowEdit]      = useState(false)
  const [localDone,     setLocalDone]     = useState(0)
  const [doneTodayBase, setDoneTodayBase] = useState(0)

  const fetchAll = useCallback(async () => {
    try {
      const [list, cap, done] = await Promise.all([getToday(), getTodayCapacity(), getDoneToday()])
      setTasks(list)
      setCapacity(cap)
      setDoneTodayBase(done.length)
      setLocalDone(0)
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
  const totalDone   = doneTodayBase + localDone

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

  function skipCelebration() {
    celebrationTimersRef.current.forEach(clearTimeout)
    celebrationTimersRef.current = []
    setCelebrate(false)
    setLeaving(true)
    const pending = completedTaskRef.current
    completedTaskRef.current = null
    if (pending) {
      if (pending.wasBonus) {
        setBonusTasks((prev) => prev.filter((t) => t.id !== pending.taskId))
        setTimeout(() => setLeaving(false), 50)
      } else {
        fetchAll().then(() => setTimeout(() => setLeaving(false), 50))
      }
    } else {
      setLeaving(false)
    }
  }

  async function handleComplete() {
    if (!task) return
    setLocalDone((n) => n + 1)
    punRef.current = TEA_PUNS[Math.floor(Math.random() * TEA_PUNS.length)]
    const taskId = task.id
    const wasBonus = isBonusMode
    completedTaskRef.current = { taskId, wasBonus }
    completeTask(taskId)
    setCelebrate('dunk')
    celebrationTimersRef.current.forEach(clearTimeout)
    celebrationTimersRef.current = [
      setTimeout(() => setCelebrate('p1'),  5350),
      setTimeout(() => setCelebrate('p2'),  5350 + 720),
      setTimeout(() => setCelebrate('p3'),  5350 + 1180),
      setTimeout(() => skipCelebration(),   5350 + 1180 + 3000),
    ]
  }

  async function handleDefer() {
    if (!task) return
    await advance(() => deferTask(task.id))
  }

  async function handleEditSave(patch) {
    if (!task) return
    try {
      await updateTask(task.id, patch)
      const updater = (prev) => prev.map((t) => t.id === task.id ? { ...t, ...patch } : t)
      if (isBonusMode) setBonusTasks(updater)
      else setTasks(updater)
    } catch (err) { console.error(err) }
  }

  function handleNext() {
    if (!task) return
    setLeaving(true)
    setTimeout(() => {
      setTasks(prev => {
        const maxOrder = Math.max(0, ...prev.map(t => t.sort_order ?? 0))
        return prev.map(t => t.id === task.id ? { ...t, sort_order: maxOrder + 1 } : t)
      })
      setLeaving(false)
    }, 300)
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
      <div className="flex-1 flex flex-col px-20 md:px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-sm mx-auto w-full">

        {/* Header — normal when idle, hidden during dunk, celebration overlay for p1–p3 */}
        {(celebrate === 'p1' || celebrate === 'p2' || celebrate === 'p3') ? (
          <div
            className="fixed left-0 right-0 overflow-hidden cursor-pointer select-none pointer-events-auto"
            style={{ top: '20%', height: '90px', zIndex: 20 }}
            onClick={skipCelebration}
          >
            {/* Train: cup + rainbow slide in as a unit */}
            {celebrate !== 'p3' && (
              <div
                className="absolute inset-0 flex items-center px-4"
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
                    height: '10px',
                    borderRadius: '5px',
                    background: 'linear-gradient(to right, #ED8E89, #F7B685, #F3EBA5, #94C691, #9BD6D9, #B4A8E0)',
                    transformOrigin: 'right center',
                    animation: celebrate === 'p2'
                      ? 'celebrate-rainbow-shrink 420ms ease-in forwards'
                      : 'none',
                  }}
                />
                {/* Cup — overlaps the rainbow front end */}
                <span style={{
                  fontSize: '3.2em', lineHeight: 1, flexShrink: 0,
                  paddingRight: '8px', marginLeft: '-1.1em',
                  position: 'relative', zIndex: 1,
                }}>☕</span>
              </div>
            )}
            {/* Pun text */}
            {celebrate === 'p3' && (
              <div
                className="absolute inset-0 flex items-center justify-center gap-3"
                style={{ animation: 'celebrate-pun-in 280ms ease-out forwards' }}
              >
                <span className="sparkle" style={{ fontSize: '1.6em', color: '#C490D1' }}>✨</span>
                <span className="text-lg font-semibold" style={{ color: '#3D2B1F' }}>{punRef.current}</span>
                <span className="sparkle" style={{ fontSize: '1.6em', color: '#C490D1', animationDelay: '0.5s' }}>✨</span>
              </div>
            )}
          </div>
        ) : celebrate !== 'dunk' ? (
          <>
            <div className="bg-ui-surface/70 rounded-2xl px-3 py-3 mb-4 backdrop-blur-sm border border-ui-border/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h1 className={`text-[10px] font-pixel ${
                    isBonusMode ? 'text-orange-400' : 'text-ui-subtext'
                  }`}>
                    {isBonusMode ? 'Bonus' : 'Now'}
                  </h1>
                </div>
                <div className="flex items-center gap-3">
                  {totalDone > 0 && (
                    <span className="text-xs text-ui-subtext">{totalDone} done</span>
                  )}
                  <span className="text-xs text-ui-subtext">
                    {isBonusMode ? `${remaining} bonus` : `${remaining} left`}
                  </span>
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
              <CapacityBar capacity={capacity} compact className="" />
            </div>
          </>
        ) : null}

        {/* Card */}
        <div
          className={`flex-1 flex flex-col justify-center ${
            celebrate === 'p1' || celebrate === 'p2' || celebrate === 'p3'
              ? 'opacity-0 pointer-events-none'
              : !celebrate
                ? `transition-all duration-300 ${leaving ? 'opacity-0 translate-y-2' : 'opacity-100'}`
                : ''
          }`}
        >
          {/* Relative wrapper — anchors cup position; pb reserves space for scale(1.15) overflow */}
          <div className="relative">

            {/* Teabag unit — tag + string + card descend as one */}
            <div style={celebrate === 'dunk' ? { animation: 'teabag-descend 5000ms linear 350ms both', position: 'relative', zIndex: 1 } : undefined}>

            {/* Tag + string */}
            <div
              className="flex flex-col items-center"
              style={{ marginBottom: '-1px', zIndex: 1, position: 'relative' }}
            >
              <div
                onClick={() => !celebrate && setShowEdit(true)}
                title="Edit task"
                style={{
                  width: 80, height: 43,
                  background: (TAG_COLORS[task?.task_type] || TAG_COLORS.task).bg,
                  border: `2px solid ${(TAG_COLORS[task?.task_type] || TAG_COLORS.task).border}`,
                  borderRadius: 7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `2px 2px 0 ${(TAG_COLORS[task?.task_type] || TAG_COLORS.task).shadow}`,
                  cursor: celebrate ? 'default' : 'pointer',
                }}
              >
                <span style={{ color: '#fff', lineHeight: 1.3, userSelect: 'none', fontWeight: 700, textAlign: 'center', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {(() => {
                    const name = TAG_NAMES[task?.task_type] || 'Task'
                    const fs = name.length <= 4 ? 10 : name.length <= 5 ? 9 : 8
                    return <span style={{ fontSize: fs }}>{name}</span>
                  })()}
                  {tagDateLabel(task) && <span style={{ fontWeight: 400, fontSize: 8, opacity: 0.9 }}>{tagDateLabel(task)}</span>}
                </span>
              </div>
              <div style={{
                width: 3,
                height: 38,
                background: 'linear-gradient(to bottom, #B8AE98 0%, #CEC4AE 55%, #DED4BE 100%)',
                borderRadius: 1,
              }} />
            </div>

            {/* Bonus glow ring + clipped card */}
            <div
              className={isBonusMode
                ? 'rounded-2xl ring-1 ring-orange-400/40 shadow-lg shadow-orange-400/10'
                : ''
              }
            >
              <div style={{ clipPath: 'polygon(40% 0%, 60% 0%, 100% 8%, 100% 100%, 0% 100%, 0% 8%)' }}>
              <Card className="teabag-card px-5 py-5 min-h-[220px] flex flex-col items-center justify-center text-center">

                {task.priority && PRIORITY_BADGE[task.priority] && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mb-2 ${PRIORITY_BADGE[task.priority]}`}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </span>
                )}

                <h2 className="text-2xl font-bold text-ui-text leading-snug mb-3">
                  {task.title}
                </h2>

                {task.location_detail && (
                  <div className="mb-2 text-sm text-ui-subtext">
                    <span className="mr-1.5">📍</span>
                    <span>{task.location_detail}</span>
                  </div>
                )}

                {task.notes && (
                  <p className="text-xs italic text-ui-subtext leading-relaxed border-t border-ui-border pt-3 mt-1 w-full">
                    {task.notes}
                  </p>
                )}

              </Card>
              </div>{/* end teabag clip-path */}
            </div>
            </div>{/* end teabag unit */}

            {/* Teacup back — behind bag (back rim arc + tea pool) */}
            {celebrate === 'dunk' && (
              <div style={{
                position: 'absolute', left: 0, right: 0, margin: '0 auto',
                width: 'fit-content', top: '100%', marginTop: '-12px',
                zIndex: 0, pointerEvents: 'none',
                animation: 'teacup-appear 400ms ease-out 950ms both, teacup-bounce 950ms ease-in-out 4200ms both, teacup-exit 400ms ease-in 5150ms forwards',
              }}>
                <TeaCupBack />
              </div>
            )}

            {/* Teacup front — in front of bag (body, handle, base, front rim arc) */}
            {celebrate === 'dunk' && (
              <div style={{
                position: 'absolute', left: 0, right: 0, margin: '0 auto',
                width: 'fit-content', top: '100%', marginTop: '-12px',
                zIndex: 3, pointerEvents: 'none',
                animation: 'teacup-appear 400ms ease-out 950ms both, teacup-bounce 950ms ease-in-out 4200ms both, teacup-exit 400ms ease-in 5150ms forwards',
              }}>
                <TeaCupFront />
              </div>
            )}

          </div>{/* end relative wrapper */}

          {/* Actions — hidden during dunk */}
          {celebrate !== 'dunk' && (
            <div className="mt-4 flex flex-col gap-2 relative">
              <Button
                size="lg"
                onClick={handleComplete}
                className={`w-full ${isBonusMode ? 'bg-orange-500 hover:bg-orange-400 text-white border-transparent' : 'pixel-btn-rainbow'}`}
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
                  <Button variant="ghost" className="flex-1" onClick={handleNext}>
                    Next
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Progress dots */}
        {remaining > 1 && !celebrate && (
          <div className="flex justify-center gap-1 mt-4">
            {Array.from({ length: Math.min(remaining, 8) }).map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${
                i === 0
                  ? (isBonusMode ? 'bg-orange-400' : 'bg-ui-accent')
                  : 'bg-ui-border'
              }`} />
            ))}
            {remaining > 8 && <span className="text-[10px] text-ui-subtext ml-1">+{remaining - 8}</span>}
          </div>
        )}

      </div>

      {showSnooze && <SnoozeSheet onSnooze={handleSnooze} onClose={() => setShowSnooze(false)} />}
      {showEdit && task && <EditTaskSheet task={task} onSave={handleEditSave} onClose={() => setShowEdit(false)} />}
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
