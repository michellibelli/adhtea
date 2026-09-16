import { useState, useRef, useCallback } from 'react'
import { searchTasks, updateTask } from '../api/tasks'
import Card from '../components/Card'
import Button from '../components/Button'
import { Input } from '../components/Input'

const TYPE_ICONS = { task: '✦', routine: '↻', note: '◈' }

const STATUS_LABEL = {
  inbox:   { label: 'Inbox',   color: 'bg-ui-border text-ui-subtext' },
  today:   { label: 'Today',   color: 'bg-ui-accent/20 text-ui-accent' },
  snoozed: { label: 'Snoozed', color: 'bg-amber-500/20 text-amber-400' },
  done:    { label: 'Done',    color: 'bg-emerald-500/20 text-emerald-400' },
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return isoDate(d)
}

function endOfWeek() {
  const d = new Date()
  const dow = d.getDay()
  const toFri = ((5 - dow + 7) % 7) || 7
  d.setDate(d.getDate() + toFri); d.setHours(0, 0, 0, 0); return isoDate(d)
}

function nextMonday() {
  const d = new Date()
  const toMon = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + toMon); d.setHours(0, 0, 0, 0); return isoDate(d)
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({ task, selected, onToggle }) {
  const badge = STATUS_LABEL[task.status] || STATUS_LABEL.inbox
  const date = task.due_date
    ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      className={`flex items-start gap-3 py-3 border-b border-ui-border last:border-0 cursor-pointer select-none transition-colors ${
        selected ? 'bg-ui-accent/5' : ''
      }`}
      onClick={() => onToggle(task.id)}
    >
      {/* Checkbox */}
      <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
        selected ? 'bg-ui-accent border-ui-accent' : 'border-ui-border'
      }`}>
        {selected && (
          <svg viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth={2.5} className="w-2.5 h-2.5">
            <polyline points="1 4 3.5 6.5 9 1" />
          </svg>
        )}
      </div>

      <span className="text-xs mt-0.5 flex-shrink-0 text-ui-accent">{TYPE_ICONS[task.task_type] || '✦'}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ui-text leading-snug">{task.title}</p>
        {task.notes && (
          <p className="text-xs text-ui-subtext mt-0.5 truncate">{task.notes}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
          {date && <span className="text-[10px] text-ui-subtext">{date}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Search() {
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [selected,   setSelected]   = useState(new Set())
  const [pickDate,   setPickDate]   = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [applying,   setApplying]   = useState(false)
  const [feedback,   setFeedback]   = useState('')

  const debounceRef = useRef(null)

  const handleQueryChange = useCallback((e) => {
    const val = e.target.value
    setQuery(val)
    setSelected(new Set())
    setFeedback('')
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchTasks(val.trim())
        setResults(res)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map((t) => t.id)))
    }
  }

  async function applyDate(due_date) {
    if (!selected.size) return
    setApplying(true)
    setFeedback('')
    try {
      await Promise.all(
        [...selected].map((id) => updateTask(id, { due_date, status: 'inbox' }))
      )
      // Update local results
      setResults((prev) =>
        prev.map((t) => selected.has(t.id) ? { ...t, due_date, status: 'inbox' } : t)
      )
      setFeedback(`${selected.size} task${selected.size !== 1 ? 's' : ''} updated`)
      setSelected(new Set())
      setPickDate(false)
      setCustomDate('')
    } catch (err) {
      console.error(err)
      setFeedback('Error updating tasks')
    } finally {
      setApplying(false)
    }
  }

  const allSelected = results.length > 0 && selected.size === results.length

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-8 max-w-2xl mx-auto w-full">

        <h1 className="text-2xl font-semibold text-ui-text mb-6">Search Tasks</h1>

        {/* Search input */}
        <div className="mb-4">
          <Input
            value={query}
            onChange={handleQueryChange}
            placeholder="Search title or notes…"
            autoFocus
          />
        </div>

        {/* Results */}
        {loading && (
          <p className="text-sm text-ui-subtext px-1">Searching…</p>
        )}

        {!loading && query && results.length === 0 && (
          <p className="text-sm text-ui-subtext px-1">No results for "{query}"</p>
        )}

        {results.length > 0 && (
          <>
            {/* Select-all bar */}
            <div className="flex items-center justify-between mb-2 px-1">
              <button
                onClick={toggleAll}
                className="text-xs text-ui-subtext hover:text-ui-accent transition-colors"
              >
                {allSelected ? 'Deselect all' : `Select all (${results.length})`}
              </button>
              {selected.size > 0 && (
                <span className="text-xs text-ui-accent font-medium">
                  {selected.size} selected
                </span>
              )}
            </div>

            <Card className="px-4 divide-y divide-ui-border mb-4">
              {results.map((task) => (
                <ResultRow
                  key={task.id}
                  task={task}
                  selected={selected.has(task.id)}
                  onToggle={toggleOne}
                />
              ))}
            </Card>

            {/* Batch date assignment — visible when at least one selected */}
            {selected.size > 0 && (
              <Card className="px-4 py-4">
                <p className="text-xs text-ui-subtext mb-3 uppercase tracking-wider font-semibold">
                  Assign date to {selected.size} task{selected.size !== 1 ? 's' : ''}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Button size="sm" variant="secondary" onClick={() => applyDate(tomorrow())} disabled={applying}>
                    Tomorrow
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => applyDate(endOfWeek())} disabled={applying}>
                    End of week
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => applyDate(nextMonday())} disabled={applying}>
                    Next week
                  </Button>
                  <Button
                    size="sm"
                    variant={pickDate ? 'primary' : 'secondary'}
                    onClick={() => setPickDate((v) => !v)}
                    disabled={applying}
                  >
                    Pick date ◷
                  </Button>
                </div>

                {pickDate && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => customDate && applyDate(customDate)}
                      disabled={!customDate || applying}
                    >
                      Set
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {feedback && (
              <p className="text-xs text-emerald-400 mt-3 px-1">{feedback}</p>
            )}
          </>
        )}

      </div>
    </div>
  )
}
