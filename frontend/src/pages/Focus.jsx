import { useState, useEffect, useCallback, useRef } from 'react'
import { getToday, completeTask, snoozeTask, getBonusTasks, getDoneToday, updateTask } from '../api/tasks'
import SnoozeSheet from '../components/SnoozeSheet'
import EditTaskSheet from '../components/EditTaskSheet'
import Card from '../components/Card'
import Button from '../components/Button'
import { minutesUntil, isTimedVisible } from '../utils/timing'
import { TAG_COLORS } from '../utils/taskColors'
import TeaBox from '../components/TeaBox'


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
  task: 'Task', appointment: 'Appt', routine: 'Routine', note: 'Note', project: 'Project',
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
  // Step 1 — apply the time-of-day window. Appointments + routines only
  // appear near their due time (see utils/timing.js for the windows).
  const visible = tasks.filter(isTimedVisible)

  // Step 2 — sort priorities (top wins):
  //   1. Imminent timed items (≤ 5 min away) — always trump everything else
  //   2. In-context domain (server-stamped `in_context`; out-of-context sinks)
  //   3. sort_order — user's manual priority from triage
  const copy = [...visible]
  copy.sort((a, b) => {
    const aImm = isImminent(a)
    const bImm = isImminent(b)
    if (aImm && !bImm) return -1
    if (bImm && !aImm) return 1
    // Routines float above regular tasks — gentle pressure to complete.
    const aRtn = a.task_type === 'routine'
    const bRtn = b.task_type === 'routine'
    if (aRtn && !bRtn) return -1
    if (bRtn && !aRtn) return 1
    const aCtx = a.in_context !== false
    const bCtx = b.in_context !== false
    if (aCtx !== bCtx) return aCtx ? -1 : 1
    return (a.sort_order ?? 999) - (b.sort_order ?? 999)
  })

  return copy[0] ?? null  // null means the list is empty → show "all done" celebration
}

// localStorage key for today's completed-bonus-task count — drives the gold
// bags in the tea-box. Per-day, so it resets naturally each morning.
function bonusKey() {
  return 'aria_bonus_done_' + new Date().toISOString().slice(0, 10)
}

function TeaCupBack() {
  // Back of cup — renders BEHIND the bag (used during dunk animation)
  return (
    <svg width="150" height="117" viewBox="0 0 110 86" fill="none">
      <ellipse cx="52" cy="22" rx="34" ry="4.5" fill="#DBA96A" opacity="0.55"/>
      <path d="M 14 22 A 38 6.5 0 0 0 90 22" stroke="#C4A882" strokeWidth="2.5" fill="none"/>
    </svg>
  )
}

function TeaCupFront() {
  // Front of cup — renders IN FRONT of the bag (used during dunk animation)
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



export default function Focus({ onGoToList, onTriage, onNavigate, onStatsChange, capacity }) {
  const [tasks,       setTasks]       = useState([])
  const [bonusTasks,  setBonusTasks]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [leaving,     setLeaving]     = useState(false)
  const [celebrate,   setCelebrate]   = useState(false)  // false | 'dunk' | 'fade'
  const punRef = useRef('')
  const completedTaskRef     = useRef(null)  // { taskId, wasBonus }
  const celebrationTimersRef = useRef([])
  const [showSnooze,    setShowSnooze]    = useState(false)
  const [showEdit,      setShowEdit]      = useState(false)
  const [entering,      setEntering]      = useState(false)  // next-card rise-from-box animation
  const [selectedId,    setSelectedId]    = useState(null)  // bag tapped in the tea-box
  const [localDone,     setLocalDone]     = useState(0)
  const [doneTodayBase, setDoneTodayBase] = useState(0)
  const [bonusDone,     setBonusDone]     = useState(() => {
    const v = Number(localStorage.getItem(bonusKey()))
    return Number.isFinite(v) && v > 0 ? v : 0
  })

  const fetchAll = useCallback(async () => {
    try {
      // Always fetch bonus alongside today. Display gating uses pickNext() —
      // a non-empty today list can still have nothing visible (timed routines
      // more than 5 min out are hidden), so deciding bonus-fetch from
      // list.length missed the case "no visible task but list has a hidden routine".
      const [list, done, bonus] = await Promise.all([
        getToday(), getDoneToday(), getBonusTasks(),
      ])
      setTasks(list)
      setDoneTodayBase(done.length)
      setLocalDone(0)
      setBonusTasks(bonus)
      // No need to clear selectedId here: a refetched list that no longer
      // contains the selected task makes `tasks.find(selectedId)` undefined,
      // so focus falls back to pickNext on its own.
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
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
  const todayVisible = pickNext(tasks) !== null
  const isBonusMode  = !selectedTask && !todayVisible && bonusTasks.length > 0
  const activeList   = isBonusMode ? bonusTasks : tasks
  const task         = selectedTask ?? pickNext(activeList)
  const remaining   = activeList.length
  const totalDone   = doneTodayBase + localDone

  // Push the page's headline stats up to App.jsx so the mobile top bar
  // can render "Now / X done / Y left" under the capacity bar. Clear
  // them on unmount so the slot doesn't leak Focus state into other
  // screens that don't own the data.
  useEffect(() => {
    if (!onStatsChange) return
    onStatsChange({
      label: isBonusMode ? 'Bonus' : 'Now',
      done: totalDone > 0 ? `${totalDone} done` : null,
      remaining: isBonusMode ? `${remaining} bonus` : `${remaining} left`,
      isBonus: isBonusMode,
    })
    return () => onStatsChange(null)
  }, [onStatsChange, isBonusMode, totalDone, remaining])

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
    setLeaving(true)
    // 300ms empty gap, then next card rises from tea box
    celebrationTimersRef.current = [
      setTimeout(() => {
        setLeaving(false)
        setEntering(true)
      }, 300),
      setTimeout(() => setEntering(false), 2000),
    ]
    if (pending && !pending.wasBonus) fetchAll()
  }

  async function handleComplete() {
    if (!task) return
    setLocalDone((n) => n + 1)
    // eslint-disable-next-line react-hooks/purity -- handler, not render
    punRef.current = TEA_PUNS[Math.floor(Math.random() * TEA_PUNS.length)]
    const taskId = task.id
    const wasBonus = isBonusMode
    completedTaskRef.current = { taskId, wasBonus }
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
      setTimeout(() => setCelebrate('fade'), 4600),
      setTimeout(() => skipCelebration(),    5400),
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
    <div className="aria-page flex flex-col !h-[calc(100dvh_-_64px)] !max-h-[calc(100dvh_-_64px)] !min-h-[calc(100dvh_-_64px)] md:!h-auto md:!max-h-none md:!min-h-[100dvh] overflow-hidden md:overflow-visible">
      <div className="flex-1 flex flex-col px-4 pt-1 md:pt-8 pb-8 max-w-sm mx-auto w-full">

        {/* Card area — bag + action row + tea-box stack together at the
            TOP of the column (justify-start) so the whole unit sits
            directly under the focus bar / top header instead of
            floating at the bottom of the page. */}
        <div className="flex-1 min-h-0 flex flex-col justify-start items-center gap-3 pt-2 md:pt-5">
          {/* Relative wrapper — teabag + cup/pun. Handles its own
              animation: rise-from-box on entering, instant hide on gap. */}
          <div className={`relative w-full flex justify-center ${
            celebrate ? ''
            : entering ? 'animate-bag-pull-from-box'
            : leaving ? 'opacity-0'
            : 'transition-all duration-300 opacity-100'
          }`}>

            {/* Teabag unit — tag (fixed) above, then sway-wrap (string + bag) below.
                During dunk the whole unit descends; the sway animation continues
                inside the descending wrapper. */}
            <div style={celebrate === 'dunk' ? { animation: 'teabag-descend 4250ms linear 300ms both', position: 'relative', zIndex: 1 } : celebrate === 'fade' ? { opacity: 0 } : undefined}>

            {/* Tag — outside sway-wrap so it stays still (where the string meets
                the imaginary cup rim above). String + bag swing from here. */}
            <div
              className="flex flex-col items-center"
              style={{ marginBottom: 0, zIndex: 2, position: 'relative' }}
            >
              {(() => {
                const isProject = !!task?.project_name
                const colors = isProject ? TAG_COLORS.project : (TAG_COLORS[task?.task_type] || TAG_COLORS.task)
                const tagH = isProject ? 54 : 43
                return (
                  <div
                    onClick={() => !celebrate && setShowEdit(true)}
                    title="Edit task"
                    style={{
                      width: 80, height: tagH,
                      background: colors.bg,
                      border: `2px solid ${colors.border}`,
                      borderRadius: 7,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `2px 2px 0 ${colors.shadow}`,
                      cursor: celebrate ? 'default' : 'pointer',
                    }}
                  >
                    <span style={{ color: colors.text, lineHeight: 1.25, userSelect: 'none', fontWeight: 700, textAlign: 'center', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                      {isProject ? (
                        <>
                          <span style={{ fontSize: 16 }}>Project</span>
                          <span style={{ fontWeight: 500, fontSize: 10, opacity: 0.9, maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {task.project_name}
                          </span>
                        </>
                      ) : (
                        <>
                          {(() => {
                            const name = TAG_NAMES[task?.task_type] || 'Task'
                            const fs = name.length <= 4 ? 10 : name.length <= 5 ? 9 : 8
                            return <span style={{ fontSize: fs }}>{name}</span>
                          })()}
                          {tagDateLabel(task) && <span style={{ fontWeight: 400, fontSize: 8, opacity: 0.9 }}>{tagDateLabel(task)}</span>}
                        </>
                      )}
                    </span>
                  </div>
                )
              })()}
            </div>

            {/* String + bag wrapper. Pendulum sway removed — the bag
                hangs still. The wrapper is kept so the descent during
                dunk still drives off the same node. */}
            <div
              className="flex flex-col items-center"
              style={{
                marginTop: -1, position: 'relative', zIndex: 1,
              }}
            >
              <div style={{
                width: 3,
                height: 38,
                background: 'linear-gradient(to bottom, #B8AE98 0%, #CEC4AE 55%, #DED4BE 100%)',
                borderRadius: 1,
              }} />

              {/* Bonus glow ring + clipped card. max-w keeps the bag taller-than-
                  wide on every breakpoint; extra horizontal padding keeps title
                  text inside the safe band so the clip-path's chamfered top
                  corners never clip the text. */}
              <div
                className={`w-full max-w-[200px] mx-auto ${isBonusMode ? 'rounded-2xl ring-1 ring-amber-500/50 shadow-lg shadow-amber-500/15' : ''}`}
                style={!isBonusMode ? {
                  filter: 'drop-shadow(3px 5px 6px rgba(60,40,20,0.32)) drop-shadow(0 1px 0 rgba(60,40,20,0.20))',
                } : undefined}
              >
                <div style={{ clipPath: 'polygon(22% 0%, 78% 0%, 100% 24%, 100% 94%, 93% 100%, 7% 100%, 0% 94%, 0% 24%)' }}>
                <Card className={`teabag-card${isBonusMode ? ' teabag-bonus' : ''} relative px-7 py-5 !h-[230px] flex flex-col items-center justify-center text-center`} style={{ borderRadius: 0, boxShadow: 'none' }}>
                  {task.priority && PRIORITY_BADGE[task.priority] && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded mb-2"
                      style={PRIORITY_BADGE[task.priority]}
                    >
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </span>
                  )}

                  <h2 className="text-xl md:text-2xl font-bold text-ui-text leading-snug mb-3">
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

                  {/* Stitched bottom seam — pixel-style dashed line above bag bottom */}
                  <div className="teabag-stitches" />
                </Card>
                </div>{/* end teabag clip-path */}
              </div>
            </div>{/* end sway wrapper */}
            </div>{/* end teabag unit */}


            {/* Teacup back — behind bag (back rim arc + tea pool) */}
            {(celebrate === 'dunk' || celebrate === 'fade') && (
              <div style={{
                position: 'absolute', left: 0, right: 0, margin: '0 auto',
                width: 'fit-content', top: '100%', marginTop: '-12px',
                zIndex: 0, pointerEvents: 'none',
                animation: celebrate === 'fade'
                  ? 'cup-pun-fadeout 800ms ease-in forwards'
                  : 'teacup-appear 400ms ease-out 800ms both, teacup-bounce 800ms ease-in-out 3570ms both',
              }}>
                <TeaCupBack />
              </div>
            )}

            {/* Pun text — rises from below the cup */}
            {(celebrate === 'dunk' || celebrate === 'fade') && (
              <div style={{
                position: 'absolute', left: 0, right: 0, margin: '0 auto',
                top: '100%', marginTop: '115px',
                zIndex: 4, pointerEvents: 'none', textAlign: 'center',
                animation: celebrate === 'fade'
                  ? 'cup-pun-fadeout 800ms ease-in forwards'
                  : 'pun-rise-below-cup 2400ms ease-out 1200ms both',
              }}>
                {/* eslint-disable-next-line react-hooks/refs -- punRef set in handleComplete before this renders */}
                <span className="text-lg font-semibold px-4" style={{ color: '#3D2B1F' }}>{punRef.current}</span>
              </div>
            )}

            {/* Teacup front — in front of bag (body, handle, base, front rim arc) */}
            {(celebrate === 'dunk' || celebrate === 'fade') && (
              <div style={{
                position: 'absolute', left: 0, right: 0, margin: '0 auto',
                width: 'fit-content', top: '100%', marginTop: '-12px',
                zIndex: 3, pointerEvents: 'none',
                animation: celebrate === 'fade'
                  ? 'cup-pun-fadeout 800ms ease-in forwards'
                  : 'teacup-appear 400ms ease-out 800ms both, teacup-bounce 800ms ease-in-out 3570ms both',
              }}>
                <TeaCupFront />
              </div>
            )}

          </div>{/* end relative wrapper */}

          {/* Shared 3-icon action row — same on mobile + desktop. Sits
              directly under the bag, with the tea-box directly under it.
              Spacing controlled by the card area's gap-3. */}
          {/* Tea box flanked by Capture (left) and Done (right) */}
          {!celebrate && (
            <div className={`w-full mx-auto relative flex items-center gap-3 ${entering ? 'animate-fade-in-up' : ''}`} style={{ maxWidth: 380, zIndex: 5 }}>
              <button
                onClick={() => onNavigate?.('capture')}
                aria-label="Capture"
                className="flex-shrink-0 flex items-end justify-center rounded-lg active:scale-95 transition-all"
                style={{ width: 56, height: 94 }}
              >
                <svg viewBox="0 0 56 94" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ width: 56, height: 94 }}>
                  {/* Body */}
                  <ellipse cx="26" cy="58" rx="20" ry="26" fill="url(#kettleGrad)" stroke="#8A9EAD" strokeWidth={1.5} />
                  {/* Horizontal texture lines */}
                  <ellipse cx="26" cy="48" rx="18" ry="1.5" fill="none" stroke="#A8BCC8" strokeWidth={0.6} opacity="0.5" />
                  <ellipse cx="26" cy="56" rx="19" ry="1.5" fill="none" stroke="#A8BCC8" strokeWidth={0.6} opacity="0.4" />
                  <ellipse cx="26" cy="64" rx="18" ry="1.5" fill="none" stroke="#A8BCC8" strokeWidth={0.6} opacity="0.35" />
                  {/* Small floral detail */}
                  <circle cx="26" cy="70" r="2" fill="none" stroke="#A8BCC8" strokeWidth={0.7} opacity="0.4" />
                  <circle cx="23" cy="68" r="1" fill="none" stroke="#A8BCC8" strokeWidth={0.5} opacity="0.3" />
                  <circle cx="29" cy="68" r="1" fill="none" stroke="#A8BCC8" strokeWidth={0.5} opacity="0.3" />
                  {/* Base shadow */}
                  <ellipse cx="26" cy="83" rx="15" ry="3" fill="#6B8090" opacity="0.15" />
                  {/* Rim / lip */}
                  <ellipse cx="26" cy="33" rx="12" ry="3.5" fill="#D4C8B0" stroke="#8A9EAD" strokeWidth={1.5} />
                  {/* Lid dome */}
                  <path d="M16 33 Q16 24 26 24 Q36 24 36 33" fill="#BFD0DC" stroke="#8A9EAD" strokeWidth={1.3} />
                  {/* Knob */}
                  <circle cx="26" cy="23" r="2.5" fill="#8A9EAD" />
                  {/* Spout */}
                  <path d="M6 52 Q0 44 3 36 Q5 32 9 35" stroke="#8A9EAD" strokeWidth={2.5} fill="none" />
                  {/* Handle */}
                  <path d="M44 46 Q54 46 54 58 Q54 70 44 70" stroke="#8A9EAD" strokeWidth={3} fill="none" />
                  {/* Steam */}
                  <path d="M23 18 Q21 12 23 6" stroke="#8A9EAD" strokeWidth={1} opacity="0.25" />
                  <path d="M29 16 Q27 10 29 4" stroke="#8A9EAD" strokeWidth={1} opacity="0.2" />
                  <defs>
                    <linearGradient id="kettleGrad" x1="6" y1="32" x2="46" y2="84" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#E8DFD0" />
                      <stop offset="30%" stopColor="#BFD0DC" />
                      <stop offset="70%" stopColor="#97B0BF" />
                      <stop offset="100%" stopColor="#7A92A3" />
                    </linearGradient>
                  </defs>
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <TeaBox tasks={tasks} activeTaskId={task?.id} goldCount={bonusDone} onOpen={onGoToList} onSelectTask={setSelectedId} onNavigate={onNavigate} />
              </div>
              <button
                onClick={handleComplete}
                aria-label="Done"
                className="flex-shrink-0 flex items-end justify-center rounded-lg active:scale-95 transition-all"
                style={{ width: 56, height: 94 }}
              >
                <svg viewBox="0 0 56 94" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ width: 56, height: 94 }}>
                  {/* Tapered body — matches celebration cup shape */}
                  <path d="M10 28 L38 28 L34 76 L14 76 Z" fill="url(#cupGrad)" stroke="#C4A882" strokeWidth={1.5} />
                  {/* Base ellipse */}
                  <ellipse cx="24" cy="76" rx="12" ry="4" fill="#DBC8A0" stroke="#C4A882" strokeWidth={1.5} />
                  {/* Rim ellipse — lip */}
                  <ellipse cx="24" cy="28" rx="16" ry="5" fill="#F5ECD7" stroke="#C4A882" strokeWidth={1.5} />
                  {/* Tea liquid inside */}
                  <ellipse cx="24" cy="28" rx="13" ry="3.5" fill="#DBA96A" opacity="0.45" />
                  {/* Horizontal texture lines */}
                  <line x1="12" y1="42" x2="36" y2="42" stroke="#D4C4A0" strokeWidth={0.6} opacity="0.45" />
                  <line x1="13" y1="52" x2="35" y2="52" stroke="#D4C4A0" strokeWidth={0.6} opacity="0.4" />
                  <line x1="13" y1="62" x2="34" y2="62" stroke="#D4C4A0" strokeWidth={0.6} opacity="0.35" />
                  {/* Small floral/leaf detail */}
                  <path d="M22 55 Q24 51 26 55" stroke="#C4A882" strokeWidth={0.7} fill="none" opacity="0.4" />
                  <path d="M20 56 Q24 49 28 56" stroke="#C4A882" strokeWidth={0.5} fill="none" opacity="0.3" />
                  {/* Handle */}
                  <path d="M37 36 Q50 36 50 52 Q50 66 37 66" stroke="#C4A882" strokeWidth={3} fill="none" />
                  {/* Checkmark steam */}
                  <polyline points="16 18 21 23 34 8" stroke="#C4A882" strokeWidth={2} opacity="0.35" />
                  <defs>
                    <linearGradient id="cupGrad" x1="10" y1="28" x2="38" y2="76" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#F5ECD7" />
                      <stop offset="40%" stopColor="#EDD5A8" />
                      <stop offset="100%" stopColor="#D4BC8A" />
                    </linearGradient>
                  </defs>
                </svg>
              </button>
            </div>
          )}

        </div>

      </div>

      {showSnooze && <SnoozeSheet onSnooze={handleSnooze} onClose={() => setShowSnooze(false)} domainName={task?.domain_name} />}
      {showEdit && task && <EditTaskSheet task={task} onSave={handleEditSave} onClose={() => setShowEdit(false)} />}
    </div>
  )
}
