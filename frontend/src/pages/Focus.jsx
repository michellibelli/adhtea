import { useState, useEffect, useCallback, useRef, useContext } from 'react'
import { getToday, completeTask, snoozeTask, getBonusTasks, getDoneToday, updateTask, reorderTasks, createTask } from '../api/tasks'
import SnoozeSheet from '../components/SnoozeSheet'
import { resolveSnoozeDate } from '../utils/snooze'
import EditTaskSheet from '../components/EditTaskSheet'
import MinutesPrompt from '../components/MinutesPrompt'
import Card from '../components/Card'
import Button from '../components/Button'
import { orderTasks } from '../utils/ordering'
import { elapsedMinutesSinceLastCompletion, markWorkCompletionNow } from '../utils/lastWorkCompletion'
import TeaBox from '../components/TeaBox'
import { PageError } from '../components/PageState'
import { ThemeContext } from '../context/ThemeContext'


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
  "Kettle done, well done! 🫖",
  "You're a cup above! ☕",
  "Leaf it to you! 🍃",
  "Sencha-tional work! 🌿",
  "That's the last drop! 💧",
  "Tisane of the times! 🌸",
  "You've got it down to a tea! 🫖",
  "Per-mint condition! 🌿",
  "Darjeeling with it! 🏔️",
  "Chamomile and chill! 🌼",
]

const PRIORITY_BADGE = {
  urgent: { background: 'rgba(176,74,29,0.18)', color: '#8C3010' },
  high:   { background: 'rgba(181,137,0,0.22)', color: '#7A5C00' },
}
const TAG_NAMES = {
  task: 'Task', routine: 'Routine', note: 'Note',
}

function seededRandom(seed) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647 }
}

function makeSpeckles(taskId) {
  const rand = seededRandom(typeof taskId === 'number' ? taskId : 1)
  const count = 4 + Math.floor(rand() * 3)
  const blobs = []
  for (let i = 0; i < count; i++) {
    const x = rand() * 100
    const y = rand() * 100
    const r = 14 + rand() * 18
    blobs.push(`radial-gradient(circle ${r}px at ${x}% ${y}%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 45%, transparent 100%)`)
  }
  return blobs.join(',')
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

function tomorrowISO() {
  return resolveSnoozeDate('tomorrow').toISOString()
}

function pickNext(tasks, manual = false) {
  // Take the top of the shared today-order, the same order the tea-box packs
  // its bags in (see utils/ordering.js). Once she's hand-ordered the box,
  // that's the order — the front bag is the card.
  return orderTasks(tasks, manual)[0] ?? null  // null → list empty → "all done" celebration
}

// localStorage key for today's completed-bonus-task count — drives the gold
// bags in the tea-box. Per-day, so it resets naturally each morning.
function bonusKey() {
  return 'aria_bonus_done_' + new Date().toISOString().slice(0, 10)
}

function TeaCup() {
  return (
    <img
      src="/flowers/tea-cup-desat.png"
      alt=""
      width="160"
      height="125"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    />
  )
}



export default function Focus({ onGoToList, onNavigate, boxManual = false, onBoxOrdered }) {
  const [manualOrder, setManualOrder] = useState(boxManual)
  const [tasks,       setTasks]       = useState([])
  const [bonusTasks,  setBonusTasks]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [leaving,     setLeaving]     = useState(false)
  const [celebrate,   setCelebrate]   = useState(false)  // false | 'dunk' | 'wipe'
  const punRef = useRef('')
  const completedTaskRef     = useRef(null)  // { taskId, wasBonus }
  const celebrationTimersRef = useRef([])
  const [showSnooze,    setShowSnooze]    = useState(false)
  const [showEdit,      setShowEdit]      = useState(false)
  const [editIsNew,     setEditIsNew]     = useState(false)  // opened straight from the kettle
  const [selectedId,    setSelectedId]    = useState(null)  // bag tapped in the tea-box
  const [pendingMinutes, setPendingMinutes] = useState(null)  // { taskId, title, defaultMinutes }
  const minutesWaitRef = useRef(null)        // full { taskId, wasBonus } while the minutes prompt is up
  const { theme } = useContext(ThemeContext)
  const isLinen = theme === 'aria-linen'
  const [localDone,     setLocalDone]     = useState(0)
  const [doneTodayBase, setDoneTodayBase] = useState(0)
  const [bonusDone,     setBonusDone]     = useState(() => {
    const v = Number(localStorage.getItem(bonusKey()))
    return Number.isFinite(v) && v > 0 ? v : 0
  })

  const fetchAll = useCallback(async () => {
    setError(null)
    try {
      const [list, done, bonus] = await Promise.all([
        getToday(), getDoneToday(), getBonusTasks(),
      ])
      setTasks(list)
      setDoneTodayBase(done.length)
      setLocalDone(0)
      setBonusTasks(bonus)
    } catch (err) {
      console.error(err)
      if (import.meta.env.DEV) {
        setTasks([{ id: 0, title: 'Read Messages (email, whatsapp, slack)', task_type: 'routine', status: 'today', priority: null, due_date: new Date().toISOString().slice(0,10), due_time: '08:00', sort_order: 1 }])
      } else {
        setError(true)
      }
    }
    finally {
      setLoading(false)
      // Signal the app shell that data has landed so the loading cover lifts
      // onto a populated page rather than the "…" placeholder.
      window.dispatchEvent(new Event('aria:page-loaded'))
    }
  }, [])

  // Mount-only fetch; fetchAll is stable (useCallback []).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll() }, [fetchAll])

  // Bonus mode triggers when no visible today-task exists. pickNext filters
  // routines that aren't yet within 5 min — those don't count as "anything to do".
  // A bag tapped in the tea-box manually focuses that task, overriding the
  // pickNext ranking. Lets the user act on a specific item the time-of-day
  // window would otherwise hide — e.g. an 8am routine completed at 9am.
  const selectedTask = selectedId != null ? tasks.find(t => t.id === selectedId) : null
  const todayVisible = pickNext(tasks, manualOrder) !== null
  const isBonusMode  = !selectedTask && !todayVisible && bonusTasks.length > 0
  const activeList   = isBonusMode ? bonusTasks : tasks
  const task         = selectedTask ?? pickNext(activeList, manualOrder)
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

  function finishTransition(pending) {
    setCelebrate(false)
    setLeaving(true)
    celebrationTimersRef.current = [
      setTimeout(() => setLeaving(false), 300),
    ]
    if (pending && !pending.wasBonus) fetchAll()
  }

  function skipCelebration() {
    celebrationTimersRef.current.forEach(clearTimeout)
    celebrationTimersRef.current = []
    const pending = completedTaskRef.current
    completedTaskRef.current = null
    if (pending) {
      if (pending.wasBonus) {
        setBonusTasks((prev) => prev.filter((t) => t.id !== pending.taskId))
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== pending.taskId))
      }
    }
    setCelebrate(false)

    // Only a task the gate/capture/promote flow already marked as work gets
    // asked for minutes — everything else (not-work, routines, anything
    // never classified) goes straight through, unchanged.
    if (pending && pending.isWork === true) {
      minutesWaitRef.current = pending
      setPendingMinutes({ taskId: pending.taskId, title: pending.title, defaultMinutes: pending.defaultMinutes })
      return
    }

    finishTransition(pending)
  }

  function handleMinutesSave(minutes) {
    const taskInfo = pendingMinutes
    const pending = minutesWaitRef.current
    minutesWaitRef.current = null
    setPendingMinutes(null)
    if (!taskInfo) return
    updateTask(taskInfo.taskId, { minutes_spent: minutes }).catch((err) => console.error(err))
    markWorkCompletionNow()
    finishTransition(pending)
  }

  function handleMinutesSkip() {
    const pending = minutesWaitRef.current
    minutesWaitRef.current = null
    setPendingMinutes(null)
    markWorkCompletionNow()
    finishTransition(pending)
  }

  async function handleComplete() {
    if (!task) return
    setLocalDone((n) => n + 1)
    // eslint-disable-next-line react-hooks/purity -- handler, not render
    punRef.current = TEA_PUNS[Math.floor(Math.random() * TEA_PUNS.length)]
    const taskId = task.id
    const wasBonus = isBonusMode
    completedTaskRef.current = {
      taskId, wasBonus,
      title: task.title,
      // Plain tasks default to work at creation now — missing/null reads the
      // same as true (covers pre-4.21.0 tasks too). Routines never get
      // classified, so they're excluded by type, not by value.
      isWork: task.task_type === 'task' && task.is_work !== false,
      defaultMinutes: elapsedMinutesSinceLastCompletion(),
    }
    // Each completed bonus task drops into the tea-box as a gold bag.
    if (wasBonus) {
      setBonusDone((n) => {
        const next = n + 1
        try { localStorage.setItem(bonusKey(), String(next)) } catch { /* ignore */ }
        return next
      })
    }
    completeTask(taskId)
    setCelebrate('dunk')
    celebrationTimersRef.current.forEach(clearTimeout)
    celebrationTimersRef.current = [
      setTimeout(() => setCelebrate('wipe'), 3910),
      setTimeout(() => skipCelebration(),    5650),
    ]
  }

  async function handleEditSave(patch) {
    if (!task) return
    try {
      await updateTask(task.id, patch)
      // If due_date moved off today, refetch so the task drops out of view
      // and the next-priority item backfills. Backend demotes status=today→inbox
      // when due_date > today (demote_misclassified_today).
      const todayIso = new Date().toISOString().slice(0, 10)
      const movedOffToday = patch.due_date && patch.due_date > todayIso
      if (movedOffToday) {
        await fetchAll()
      } else {
        const updater = (prev) => prev.map((t) => t.id === task.id ? { ...t, ...patch } : t)
        if (isBonusMode) setBonusTasks(updater)
        else setTasks(updater)
      }
    } catch (err) { console.error(err) }
  }

  // Every plain task defaults to work at creation (missing/null reads the
  // same as true) — this is the correction control on the focused card's
  // tag, not an ask. No popup; tap flips it immediately.
  function handleToggleWork() {
    if (!task || celebrate) return
    const next = task.is_work === false
    const updater = (prev) => prev.map((t) => t.id === task.id ? { ...t, is_work: next } : t)
    if (isBonusMode) setBonusTasks(updater)
    else setTasks(updater)
    updateTask(task.id, { is_work: next }).catch((err) => console.error(err))
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

  // Kettle press — a blank bag, ready to name, dropped in right after whatever
  // routine currently sits topmost in the box (or at the very front if there's
  // no routine yet). Reindexes sort_order over the current visual order and
  // switches to manual mode, the same as a hand-drag would, so the placement
  // sticks regardless of what the automatic bucket order would've picked.
  // Full Capture stays reachable from the "all done" screen for anything that
  // needs a due date, notes, or type other than a plain task.
  async function handleQuickAdd() {
    const todayIso = new Date().toISOString().slice(0, 10)
    try {
      const created = await createTask({ title: 'New task', task_type: 'task', due_date: todayIso })
      if (created.status === 'today') {
        const currentOrder = orderTasks(tasks, manualOrder)
        const routineIdx = currentOrder.findIndex(t => t.task_type === 'routine')
        const insertAt = routineIdx === -1 ? 0 : routineIdx + 1
        const reordered = [
          ...currentOrder.slice(0, insertAt),
          created,
          ...currentOrder.slice(insertAt),
        ].map((t, i) => ({ ...t, sort_order: i }))
        setTasks(reordered)
        setManualOrder(true)
        setSelectedId(created.id)
        setEditIsNew(true)
        setShowEdit(true)
        try {
          await reorderTasks(reordered.map(t => t.id), true)
          onBoxOrdered?.()
        } catch (err) {
          console.error(err)
          fetchAll()
        }
      } else {
        // Today was full — backend snapped it to tomorrow. Refetch so bonus/
        // capacity counts stay right; she'll find and name it in Inbox.
        fetchAll()
      }
    } catch (err) { console.error(err) }
  }

  // A bag dragged in the tea-box. Her order wins for the rest of the app-day, so
  // the card follows the front bag from here on. Optimistic — the bags have
  // already moved under her finger; a failed save reverts to the server's order.
  async function handleReorder(reordered) {
    const orderById = new Map(reordered.map(t => [t.id, t.sort_order]))
    setTasks(prev => prev.map(t => orderById.has(t.id) ? { ...t, sort_order: orderById.get(t.id) } : t))
    setManualOrder(true)
    setSelectedId(null)   // the front bag is the card now; drop any manual pick
    try {
      await reorderTasks(reordered.map(t => t.id), true)
      onBoxOrdered?.()
    } catch (err) {
      console.error(err)
      setManualOrder(boxManual)
      fetchAll()
    }
  }

  if (loading) {
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">…</p></div>
  }
  if (error) return <PageError onRetry={fetchAll} />

  // All done — no today tasks AND no bonus tasks
  if (!task) {
    return (
      <div className="aria-page flex items-center justify-center">
        <div className="px-6 pb-32 md:pb-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4 sparkle" style={{color:'#C490D1'}}>✦</div>
          <h2 className="text-sm pixel-heading text-ui-text mb-2">
            {totalDone > 0 ? `${totalDone} done today` : 'Nothing scheduled'}
          </h2>
          <p className="text-sm text-ui-subtext mb-6">
            {totalDone > 0
              ? 'Your list is clear. Rest, or check your inbox for more.'
              : 'Add something from Capture, or check Today to schedule from your inbox.'}
          </p>
          <div className="flex flex-col gap-2">
            {onGoToList && (
              <Button variant="secondary" onClick={onGoToList}>See full list</Button>
            )}
            {onNavigate && (
              <Button variant="ghost" onClick={() => onNavigate('today')}>Open today →</Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    // focus-page trims the Linen bottom reserve from 200px to 80 — see the rule
    // in index.css. It is a class rather than an inline style because it must be
    // gated on BOTH the theme and the viewport: desktop is h-auto with room to
    // spare and still wants the full 200, and an inline style cannot carry a
    // media query.
    <div className="aria-page focus-page flex flex-col !h-[calc(100dvh_-_64px)] !max-h-[calc(100dvh_-_64px)] !min-h-[calc(100dvh_-_64px)] md:!h-auto md:!max-h-none md:!min-h-[100dvh] overflow-hidden md:overflow-visible">
      <div className="flex-1 flex flex-col px-4 max-w-sm mx-auto w-full" style={{ gap: 16, minHeight: 0, paddingTop: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>

        {/* Teabag zone */}
        {/* max-h caps the growth, not just the bag. `grow` hands the zone every
            spare pixel; once the bag hits its 260 cap the surplus pooled inside
            the zone below it and kept pushing the note and tea box down, which
            put the box in the flowers on a narrow-but-tall window. 384 is the
            zone at full size — tag 86 + string 38 + bag 260 — so past that the
            slack falls below the box instead, where it belongs. */}
        <div className="flex justify-center min-h-0 grow max-h-[384px] md:grow-0 md:max-h-none">
          {/* Relative wrapper — teabag + cup/pun */}
          <div className={`relative w-full flex justify-center min-h-0 ${
            celebrate ? ''
            : leaving ? 'opacity-0'
            : 'transition-opacity duration-500 opacity-100'
          }`}>

            {/* Teabag unit — tag (fixed) above, then sway-wrap (string + bag) below.
                During dunk the whole unit descends; the sway animation continues
                inside the descending wrapper. */}
            <div className="flex flex-col items-center min-h-0 w-full" style={celebrate === 'dunk' ? { animation: 'teabag-descend 3610ms linear 255ms both', position: 'relative', zIndex: 1, transformOrigin: 'calc(50% - 10px) 50%' } : celebrate === 'wipe' ? { opacity: 0 } : undefined}>

            {/* Bonus ribbon — above tag, persists during animation */}
            {isBonusMode && celebrate !== 'wipe' && (
              <div className="bonus-ribbon-wrap">
                <div className="bonus-ribbon-tail left" />
                <div className="bonus-ribbon"><span>✦ BONUS ✦</span></div>
                <div className="bonus-ribbon-tail right" />
              </div>
            )}

            {/* Tag — outside sway-wrap so it stays still (where the string meets
                the imaginary cup rim above). String + bag swing from here. */}
            <div
              className="flex flex-col items-center"
              style={{ marginBottom: 0, zIndex: 2, position: 'relative' }}
            >
              {(() => {
                const wcType = task?.task_type || 'task'
                const name = TAG_NAMES[task?.task_type] || 'Task'
                const fs = name.length <= 4 ? 20 : name.length <= 5 ? 18 : 16
                return (
                  <div className={`tag-wc wc-${wcType}`}>
                    <div className="edge-bleed" />
                    <div className="tag-wc-inner">
                      <div className="tag-wc-speckles" style={{ backgroundImage: makeSpeckles(task?.id) }} />
                      <span className="tag-type" style={{ fontSize: fs }}>{name}</span>
                      {tagDateLabel(task) && <span className="tag-date">{tagDateLabel(task)}</span>}
                    </div>

                    {/* Corner actions. The whole tag used to be one big edit
                        target, which made an accidental brush of the card open a
                        sheet; the two corners are now the only things that act. */}
                    <button
                      className="tag-corner tag-corner-left"
                      onClick={() => !celebrate && setShowEdit(true)}
                      disabled={celebrate}
                      aria-label="Edit task"
                      title="Edit task"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      className="tag-corner tag-corner-right"
                      onClick={() => !celebrate && handleSnooze(tomorrowISO())}
                      disabled={celebrate}
                      aria-label="Snooze until tomorrow"
                      title="Snooze until tomorrow"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="13" r="8" />
                        <path d="M12 9v4l2.5 1.5" />
                        <path d="M5 3 2.5 5.5M19 3l2.5 2.5" />
                      </svg>
                    </button>
                    {task?.task_type === 'task' && (
                      <button
                        className="tag-corner tag-corner-center"
                        onClick={(e) => { e.stopPropagation(); handleToggleWork() }}
                        disabled={celebrate}
                        aria-label="Toggle work"
                        title={task.is_work === false ? 'Not work — tap to mark work' : 'Work — tap to mark not work'}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke={task.is_work === false ? '#8A7050' : '#8C5A2B'}
                          fill={task.is_work === false ? 'none' : '#8C5A2B'}
                        >
                          <path d="M4 3h11v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V3Z" />
                          <path d="M15 6h2a3 3 0 0 1 0 6h-2" />
                          <line x1="3" y1="20" x2="17" y2="20" />
                        </svg>
                      </button>
                    )}

                    <div className="tag-dot" />
                  </div>
                )
              })()}
            </div>

            {/* String + bag wrapper. Pendulum sway removed — the bag
                hangs still. The wrapper is kept so the descent during
                dunk still drives off the same node. */}
            <div
              className="flex flex-col items-center flex-1 min-h-0 w-full"
              style={{
                marginTop: -1, position: 'relative', zIndex: 1,
              }}
            >
              {/* The string scales with the viewport too — 38px of it is a lot
                  of the budget on a short phone. */}
              <div className="teabag-string shrink-0" style={{ height: 'clamp(14px, 2.4dvh, 38px)' }} />

              {/* max-h caps the whole subtree, not just the Card: the clip-path
                  is resolved against its container's box, so capping only the
                  card would leave the notched corners cut at the taller
                  wrapper's geometry and deform the bag. */}
              <div
                className="w-full min-w-[180px] max-w-[180px] mx-auto flex flex-col flex-1 min-h-0 max-h-[260px]"
                style={{
                  filter: 'drop-shadow(3px 5px 6px rgba(60,40,20,0.32)) drop-shadow(0 1px 0 rgba(60,40,20,0.20))',
                }}
              >
                <div className="flex flex-col flex-1 min-h-0" style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 15%, 100% 100%, 0% 100%, 0% 15%)' }}>
                {/* h-full so the bag fills whatever the column has left,
                    between the 110px floor below and the wrapper's 260px cap
                    above — 260 being the fixed height it used to have. Without
                    the cap, `grow` on the teabag zone hands the bag every spare
                    pixel and it balloons on a tall window. */}
                <Card className="teabag-card relative px-7 py-5 h-full min-h-[clamp(110px,20dvh,260px)] md:min-h-[260px] flex flex-col items-center justify-center text-center overflow-hidden" style={{ borderRadius: 0, boxShadow: 'none' }}>
                  {task.priority && PRIORITY_BADGE[task.priority] && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded mb-2"
                      style={PRIORITY_BADGE[task.priority]}
                    >
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </span>
                  )}

                  <h2 className="text-xl md:text-2xl font-bold text-ui-text leading-snug mb-3 line-clamp-4">
                    {task.title}
                  </h2>

                  {task.location_detail && (
                    <div className="mb-2 text-sm text-ui-text/85">
                      <span className="mr-1.5">📍</span>
                      <span>{task.location_detail}</span>
                    </div>
                  )}

                  {task.notes && (
                    <p className="text-xs italic text-ui-text/75 leading-relaxed border-t border-ui-border pt-3 mt-1 w-full line-clamp-2">
                      {task.notes}
                    </p>
                  )}

                  {/* Stitched bottom seam — pixel-style dashed line above bag bottom */}
                  <div className="teabag-stitches" />
                </Card>
                </div>{/* end teabag clip-path */}
              </div>
            </div>{/* end sway wrapper */}

            {/* Bonus skip ribbon — snooze to tomorrow, load next bonus task */}
            {isBonusMode && !celebrate && (
              <div className="bonus-skip-wrap">
                <div className="bonus-skip-tail left" />
                <button className="bonus-skip" onClick={() => handleSnooze(tomorrowISO())}>
                  <span>not now</span>
                </button>
                <div className="bonus-skip-tail right" />
              </div>
            )}

            </div>{/* end teabag unit */}

            {/* Bonus sparkles — scattered around bag, persist during animation */}
            {isBonusMode && celebrate !== 'wipe' && (
              <div className="bonus-sparkle-field" aria-hidden="true">
                <span className="bonus-sparkle s1">✦</span>
                <span className="bonus-sparkle s2">✦</span>
                <span className="bonus-sparkle s3">✦</span>
                <span className="bonus-sparkle s4">✦</span>
                <span className="bonus-sparkle s5">✦</span>
                <span className="bonus-sparkle s6">✦</span>
              </div>
            )}

            {/* Watercolor teacup — single image, appears behind bag */}
            {(celebrate === 'dunk' || celebrate === 'wipe') && (
              <div style={{
                position: 'absolute', left: 0, right: 0, margin: '0 auto',
                width: 'fit-content', bottom: 70,
                zIndex: 3, pointerEvents: 'none',
                transform: 'translateX(0)',
                animation: 'teacup-appear 340ms ease-out 680ms both',
              }}>
                <TeaCup />
              </div>
            )}

            {/* Pun text — below the cup */}
            {(celebrate === 'dunk' || celebrate === 'wipe') && (
              <div style={{
                position: 'absolute', left: 0, right: 0, margin: '0 auto',
                bottom: 50,
                zIndex: 4, pointerEvents: 'none', textAlign: 'center',
                animation: 'pun-rise-below-cup 2040ms ease-out 1020ms both',
              }}>
                {/* eslint-disable-next-line react-hooks/refs -- punRef set in handleComplete before this renders */}
                <span className="pun-text px-4">{punRef.current}</span>
              </div>
            )}

            {/* Brush wipe — painted over the scene, reveals left to right */}
            {celebrate === 'wipe' && (
              <div className="brush-wipe-overlay">
                <img src="/flowers/brush-wipe.webp" alt="" className="brush-wipe-img" />
              </div>
            )}

          </div>{/* end relative wrapper */}
        </div>{/* end teabag zone */}

        {/* Tea box flanked by Capture (left) and Done (right) */}
        <div className="w-full mx-auto relative flex items-end gap-3" style={{ maxWidth: isLinen ? 220 : 380, zIndex: 5 }}>
              <button
                onClick={handleQuickAdd}
                aria-label="Capture"
                className={isLinen ? 'focus-btn-wc active:scale-95 transition-all' : 'focus-btn-capture flex-shrink-0 flex items-center justify-center rounded-lg active:scale-95 transition-all'}
                style={isLinen ? { position: 'absolute', left: -80, bottom: -10 } : undefined}
              >
                {isLinen ? (
                  <img src="/flowers/tea-kettle-desat.png?v=2" alt="Capture" className="focus-wc-img" style={{ width: 91, height: 91 }} />
                ) : (
                <svg viewBox="-2 20 60 62" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ width: 50, height: 52 }}>
                  <ellipse cx="26" cy="55" rx="18" ry="24" fill="url(#kettleGrad)" stroke="#8A9EAD" strokeWidth={1.5} />
                  <line x1="26" y1="47" x2="26" y2="63" stroke="#4A5E6D" strokeWidth={2.5} opacity="0.5" />
                  <line x1="18" y1="55" x2="34" y2="55" stroke="#4A5E6D" strokeWidth={2.5} opacity="0.5" />
                  <ellipse cx="26" cy="32" rx="11" ry="3" fill="#D4C8B0" stroke="#8A9EAD" strokeWidth={1.5} />
                  <path d="M17 32 Q17 24 26 24 Q35 24 35 32" fill="#BFD0DC" stroke="#8A9EAD" strokeWidth={1.3} />
                  <circle cx="26" cy="23" r="2" fill="#8A9EAD" />
                  <path d="M8 50 Q2 43 4 36 Q6 32 9 34" stroke="#8A9EAD" strokeWidth={2.2} fill="none" />
                  <path d="M42 44 Q52 44 52 55 Q52 66 42 66" stroke="#8A9EAD" strokeWidth={2.5} fill="none" />
                  <path d="M23 18 Q21 13 23 8" stroke="#8A9EAD" strokeWidth={1} opacity="0.2" />
                  <path d="M29 16 Q27 11 29 6" stroke="#8A9EAD" strokeWidth={1} opacity="0.15" />
                  <defs>
                    <linearGradient id="kettleGrad" x1="8" y1="31" x2="44" y2="79" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#E8DFD0" />
                      <stop offset="30%" stopColor="#BFD0DC" />
                      <stop offset="70%" stopColor="#97B0BF" />
                      <stop offset="100%" stopColor="#7A92A3" />
                    </linearGradient>
                  </defs>
                </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <TeaBox tasks={tasks} activeTaskId={task?.id} goldCount={bonusDone} manualOrder={manualOrder} onOpen={onGoToList} onSelectTask={setSelectedId} onReorder={handleReorder} onNavigate={onNavigate} />
              </div>
              <button
                onClick={handleComplete}
                aria-label="Done"
                className={isLinen ? 'focus-btn-wc active:scale-95 transition-all' : 'focus-btn-done flex-shrink-0 flex items-center justify-center rounded-lg active:scale-95 transition-all'}
                style={isLinen ? { position: 'absolute', right: -85, bottom: -10 } : undefined}
              >
                {isLinen ? (
                  <img src="/flowers/tea-cup-desat.png?v=2" alt="Done" className="focus-wc-img" style={{ width: 91, height: 91 }} />
                ) : (
                <svg viewBox="-2 18 114 68" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ width: 54, height: 32 }}>
                  <ellipse cx="52" cy="77" rx="36" ry="5.5" fill="#C4A878" stroke="#8A7050" strokeWidth={2} />
                  <path d="M 20 22 L 84 22 L 76 71 L 28 71 Z" fill="url(#cupGrad)" stroke="#8A7050" strokeWidth={2.5} />
                  <polyline points="38 48 48 58 68 36" stroke="#5A4A2A" strokeWidth={3.5} opacity="0.55" fill="none" />
                  <path d="M 84 32 Q 100 32 100 48 Q 100 62 84 60" stroke="#8A7050" strokeWidth={3.5} fill="none" />
                  <ellipse cx="52" cy="22" rx="34" ry="5.5" fill="#E8D8B8" stroke="#8A7050" strokeWidth={2} />
                  <ellipse cx="52" cy="22" rx="28" ry="3.5" fill="#C49A5A" opacity="0.45" />
                  <defs>
                    <linearGradient id="cupGrad" x1="20" y1="22" x2="84" y2="71" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#E8D8B8" />
                      <stop offset="40%" stopColor="#D4BC8A" />
                      <stop offset="100%" stopColor="#B8A070" />
                    </linearGradient>
                  </defs>
                </svg>
                )}
              </button>
        </div>

      </div>

      {showSnooze && <SnoozeSheet onSnooze={handleSnooze} onClose={() => setShowSnooze(false)} />}
      {showEdit && task && (
        <EditTaskSheet
          task={task}
          isNew={editIsNew}
          onSave={handleEditSave}
          onClose={() => { setShowEdit(false); setEditIsNew(false) }}
        />
      )}
      {pendingMinutes && (
        <MinutesPrompt
          title={pendingMinutes.title}
          defaultMinutes={pendingMinutes.defaultMinutes}
          onSave={handleMinutesSave}
          onSkip={handleMinutesSkip}
        />
      )}
    </div>
  )
}
