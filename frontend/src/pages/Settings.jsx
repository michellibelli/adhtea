import { useState, useEffect } from 'react'
import { getGcalStatus, getGcalConnectUrl, disconnectGcal, syncGcal, listCalendars, updateCalendars } from '../api/gcal'
import { listUsers, createUser, deleteUser, logout, getAlphaCode, setAlphaCode } from '../api/auth'
import { listDomains, updateDomain, deleteDomain } from '../api/domains'
import { updateSettings } from '../api/auth'
import { api } from '../api/client'
import Card from '../components/Card'
import Button from '../components/Button'
import { Input } from '../components/Input'
import { useTheme } from '../hooks/useTheme'

function GoogleCalendarCard() {
  const [status,      setStatus]      = useState(null)
  const [syncing,     setSyncing]     = useState(false)
  const [syncResult,  setSyncResult]  = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [calendars,   setCalendars]   = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [calLoading,  setCalLoading]  = useState(false)

  useEffect(() => {
    getGcalStatus()
      .then(s => {
        setStatus(s)
        setSelectedIds(s.selected_calendar_ids || [])
      })
      .catch(() => setStatus({ connected: false, configured: false }))
      .finally(() => setLoading(false))
  }, [])

  // Handle ?gcal=connected redirect from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname)
      getGcalStatus().then(s => {
        setStatus(s)
        setSelectedIds(s.selected_calendar_ids || [])
      })
    }
  }, [])

  // Load calendar list once connected.
  useEffect(() => {
    if (!status?.connected) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalLoading(true)
    listCalendars()
      .then(setCalendars)
      .catch(() => {})
      .finally(() => setCalLoading(false))
  }, [status?.connected])

  async function handleConnect() {
    try {
      const { auth_url } = await getGcalConnectUrl()
      window.location.href = auth_url
    } catch (err) {
      alert(err?.detail || 'Google Calendar not configured on server yet.')
    }
  }

  async function handleDisconnect() {
    await disconnectGcal()
    setStatus(s => ({ ...s, connected: false, last_synced: null }))
    setCalendars([])
    setSelectedIds([])
    setSyncResult(null)
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await syncGcal()
      setSyncResult(res)
      getGcalStatus().then(s => { setStatus(s); setSelectedIds(s.selected_calendar_ids || []) })
    } finally {
      setSyncing(false)
    }
  }

  async function toggleCalendar(id) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id]
    setSelectedIds(next)
    try {
      await updateCalendars(next)
    } catch (e) {
      // revert on failure
      setSelectedIds(selectedIds)
    }
  }

  if (loading) return <Card className="px-5 py-4"><p className="text-sm text-ui-subtext">Loading…</p></Card>

  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-ui-text">Google Calendar</span>
        {status?.connected && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Connected</span>
        )}
      </div>
      <p className="text-xs text-ui-subtext leading-relaxed">
        {status?.connected
          ? `Today's events sync automatically each morning.${status.last_synced ? ` Last synced: ${new Date(status.last_synced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : ''}`
          : status?.configured
          ? "Connect your Google Calendar to pull today's events into appointments automatically."
          : 'Google Calendar not yet configured on the server. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to .env.'}
      </p>

      {status?.connected && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-ui-subtext uppercase tracking-wide mb-1.5">Calendars to sync</p>
          {calLoading ? (
            <p className="text-xs text-ui-subtext">Loading calendars…</p>
          ) : calendars.length === 0 ? (
            <p className="text-xs text-ui-subtext italic">No calendars found</p>
          ) : (
            <div className="space-y-1">
              {calendars.map(cal => {
                // Only the literal Google API id 'primary' is the user's main calendar.
                // Don't check the display name — a calendar called "Primary Work" would match falsely.
                const isPrimary = cal.id === 'primary'
                const isSelected = cal.id === 'primary' || selectedIds.includes(cal.id)
                return (
                  <label key={cal.id} className={`flex items-center gap-2 cursor-pointer ${isPrimary ? 'opacity-60 cursor-default' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isPrimary}
                      onChange={() => !isPrimary && toggleCalendar(cal.id)}
                      className="accent-ui-accent"
                    />
                    <span className="text-xs text-ui-text">{cal.name}</span>
                    {isPrimary && <span className="text-[9px] text-ui-subtext">(always synced)</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {syncResult && (
        <div className="mt-2 text-[10px] text-ui-subtext space-y-0.5">
          <p className="text-emerald-400 font-medium">{syncResult.created} new appointment{syncResult.created !== 1 ? 's' : ''} added</p>
          <p>Calendars queried: {syncResult.calendars_queried?.join(', ') || 'none'}</p>
          <p>Raw events found: {syncResult.events_found ?? '?'}</p>
          {syncResult.error && <p className="text-red-400">{syncResult.error}</p>}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {!status?.connected ? (
          <Button size="sm" onClick={handleConnect} disabled={!status?.configured}>
            Connect
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={handleSync} disabled={syncing}>
              {syncing ? '…' : 'Sync now'}
            </Button>
            <Button size="sm" variant="danger" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}


function UsersSection({ currentUserId }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState({ name: '', username: '', password: '' })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [open,    setOpen]    = useState(false)

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const user = await createUser(form.name, form.username, form.password)
      setUsers(u => [...u, user])
      setForm({ name: '', username: '', password: '' })
      setOpen(false)
    } catch (err) {
      setError(err?.message || 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remove ${name}? This deletes all their data permanently.`)) return
    try {
      await deleteUser(id)
      setUsers(u => u.filter(x => x.id !== id))
    } catch (err) {
      alert(err?.message || 'Failed to delete user')
    }
  }

  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Users</h2>
      <Card className="px-5 py-4">
        {loading ? (
          <p className="text-xs text-ui-subtext">Loading…</p>
        ) : (
          <div className="space-y-2 mb-4">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-ui-text">{u.name}</span>
                  <span className="text-xs text-ui-subtext ml-2">@{u.username}</span>
                </div>
                {u.id !== currentUserId && (
                  <button
                    onClick={() => handleDelete(u.id, u.name)}
                    className="text-xs text-red-400 hover:opacity-70 transition-opacity"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!open ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            + Add user
          </Button>
        ) : (
          <form onSubmit={handleCreate} className="space-y-2 mt-2">
            <Input
              placeholder="Name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              placeholder="Username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setOpen(false); setError(null) }}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </section>
  )
}


function AlphaCodeSection() {
  const [code,    setCode]    = useState('')
  const [current, setCurrent] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    getAlphaCode()
      .then(res => { setCurrent(res.alpha_code); setCode(res.alpha_code ?? '') })
      .catch(() => {})
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await setAlphaCode(code)
      setCurrent(code || null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Alpha code</h2>
      <Card className="px-5 py-4">
        <p className="text-xs text-ui-subtext mb-3 leading-relaxed">
          {current
            ? 'New signups must enter this code. Changing it will ask all existing users to re-verify on next visit.'
            : 'No code set — anyone with the signup link can create an account.'}
        </p>
        <form onSubmit={handleSave} className="flex gap-2">
          <Input
            placeholder="Leave empty to disable"
            value={code}
            onChange={e => setCode(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? '…' : saved ? 'Saved!' : 'Save'}
          </Button>
        </form>
      </Card>
    </section>
  )
}


export default function Settings({ onNavigate, user }) {
  function handleLogout() {
    logout().then(() => window.location.reload())
  }

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-8 max-w-lg mx-auto w-full">

        <h1 className="text-2xl font-semibold text-ui-text mb-6">Menu</h1>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Tasks</h2>
          <div className="space-y-2">
            <Card className="px-5 py-4 hover:opacity-80 transition-opacity" onClick={() => onNavigate?.('tournament')}>
              <p className="text-sm font-medium text-ui-text">Triage 🍵</p>
              <p className="text-xs text-ui-subtext mt-0.5">Bin-pack the next 7 days by score; pin items that must happen on a specific day</p>
            </Card>
            <Card className="px-5 py-4 hover:opacity-80 transition-opacity" onClick={() => onNavigate?.('tasks')}>
              <p className="text-sm font-medium text-ui-text">All tasks</p>
              <p className="text-xs text-ui-subtext mt-0.5">Browse, search, and batch-schedule</p>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Daily limits</h2>
          <DailyLimitsSection user={user} />
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Project domains</h2>
          <DomainsSection />
        </section>

        {user?.role === 'primary' && (
          <UsersSection currentUserId={user.id} />
        )}

        {user?.is_owner && <AlphaCodeSection />}

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Integrations</h2>
          <GoogleCalendarCard />
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Import</h2>
          <Card className="px-5 py-4">
            <p className="text-sm font-medium text-ui-text mb-1">Import from CSV</p>
            <p className="text-xs text-ui-subtext mb-4 leading-relaxed">
              Upload a CSV export from Notion or another task manager. Columns detected automatically.
            </p>
            <CSVImportForm />
          </Card>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Display</h2>
          <ThemePicker />
          <div className="mt-3">
            <BuildChipToggle />
          </div>
        </section>

        <section>
          <Card className="px-5 py-4">
            <button
              onClick={handleLogout}
              className="text-sm text-red-400 hover:opacity-70 transition-opacity font-medium"
            >
              Sign out
            </button>
          </Card>
        </section>

      </div>
    </div>
  )
}


function ThemePicker() {
  const { theme, setTheme, themes } = useTheme()
  return (
    <Card className="px-5 py-4">
      <p className="text-sm font-medium text-ui-text mb-1">Theme</p>
      <p className="text-xs text-ui-subtext mb-3">Tap to preview. Persists across sessions.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {themes.map(t => {
          const active = t.id === theme
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`flex flex-col items-stretch gap-1.5 p-2 rounded-xl border-2 transition-all text-left ${
                active ? 'border-ui-accent' : 'border-ui-border hover:border-ui-accent/60'
              }`}
            >
              <div className="flex h-6 rounded overflow-hidden">
                {t.swatch.map((c, i) => (
                  <div key={i} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <span className="text-xs font-medium text-ui-text">{t.label}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}


const BUILD_CHIP_KEY = 'show_build_chip'

function BuildChipToggle() {
  const [show, setShow] = useState(() => {
    const v = localStorage.getItem(BUILD_CHIP_KEY)
    return v === null ? true : v === 'true'
  })

  function toggle() {
    const next = !show
    setShow(next)
    localStorage.setItem(BUILD_CHIP_KEY, String(next))
    window.dispatchEvent(new Event('aria:build-chip-changed'))
  }

  return (
    <Card className="px-5 py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ui-text">Show build chip</p>
          <p className="text-xs text-ui-subtext mt-0.5">Tiny top-right tag showing the deployed build number.</p>
        </div>
        <button
          onClick={toggle}
          aria-pressed={show}
          className={`relative w-11 h-6 rounded-full transition-colors ${show ? 'bg-ui-accent' : 'bg-ui-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${show ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    </Card>
  )
}


function DailyLimitsSection({ user }) {
  const [tasksMax, setTasksMax] = useState(user?.max_tasks_per_day ?? 10)
  const [totalMax, setTotalMax] = useState(user?.max_total_per_day ?? 15)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  async function persist(field, val) {
    setSaving(true)
    setSaved(false)
    try {
      await updateSettings({ [field]: val })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  return (
    <Card className="px-5 py-4 space-y-4">
      <p className="text-xs text-ui-subtext leading-relaxed">
        Caps used by the Triage tournament when distributing tasks across days.
      </p>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-ui-text">Tasks per day</span>
          <span className="text-sm font-semibold text-ui-accent">{tasksMax}</span>
        </div>
        <input
          type="range"
          min={5} max={15} step={1}
          value={tasksMax}
          onChange={e => setTasksMax(Number(e.target.value))}
          onPointerUp={() => persist('max_tasks_per_day', tasksMax)}
          className="w-full accent-ui-accent"
        />
        <div className="flex justify-between text-[10px] text-ui-subtext/60">
          <span>5</span><span>10 (default)</span><span>15</span>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-ui-text">Total items per day</span>
          <span className="text-sm font-semibold text-ui-accent">{totalMax}</span>
        </div>
        <p className="text-[10px] text-ui-subtext mb-1">tasks + appointments + routines combined</p>
        <input
          type="range"
          min={10} max={20} step={1}
          value={totalMax}
          onChange={e => setTotalMax(Number(e.target.value))}
          onPointerUp={() => persist('max_total_per_day', totalMax)}
          className="w-full accent-ui-accent"
        />
        <div className="flex justify-between text-[10px] text-ui-subtext/60">
          <span>10</span><span>15 (default)</span><span>20</span>
        </div>
      </div>
      <p className="text-[10px] text-ui-subtext/60 h-3">
        {saving ? 'Saving…' : saved ? 'Saved ✓' : ''}
      </p>
    </Card>
  )
}


const DAYS_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIMES_LABEL = { morning: 'morning', afternoon: 'afternoon', evening: 'evening' }
const WEIGHTS_LABEL = { light: 'light', medium: 'medium', heavy: 'heavy' }

function ruleSummary(rule) {
  const days = (rule.days && rule.days.length) ? rule.days.map(d => DAYS_LABEL[d]).join('/') : 'any day'
  const times = (rule.times && rule.times.length) ? rule.times.map(t => TIMES_LABEL[t]).join('/') : 'any time'
  const weights = (rule.weights && rule.weights.length) ? rule.weights.map(w => WEIGHTS_LABEL[w]).join('/') : 'any size'
  return `${days} · ${times} · ${weights}`
}

function DomainRuleEditor({ rule, onChange, onRemove }) {
  function toggleInList(field, val) {
    const cur = new Set(rule[field] || [])
    cur.has(val) ? cur.delete(val) : cur.add(val)
    onChange({ ...rule, [field]: cur.size ? [...cur].sort() : null })
  }
  return (
    <div className="rounded-lg border border-ui-border p-3 space-y-2 bg-ui-input/30">
      <div>
        <p className="text-[10px] text-ui-subtext mb-1 uppercase tracking-wider">Days</p>
        <div className="flex flex-wrap gap-1">
          {DAYS_LABEL.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleInList('days', i)}
              className={`w-9 h-7 rounded text-[10px] font-medium border transition-all ${
                (rule.days || []).includes(i)
                  ? 'bg-ui-primary text-ui-primary-text border-transparent'
                  : 'border-ui-border text-ui-subtext'
              }`}
            >{d}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-ui-subtext mb-1 uppercase tracking-wider">Times (empty = any)</p>
        <div className="flex flex-wrap gap-1">
          {['morning','afternoon','evening'].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => toggleInList('times', v)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                (rule.times || []).includes(v)
                  ? 'bg-ui-primary text-ui-primary-text border-transparent'
                  : 'border-ui-border text-ui-subtext'
              }`}
            >{v}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-ui-subtext mb-1 uppercase tracking-wider">Sizes (empty = any)</p>
        <div className="flex flex-wrap gap-1">
          {['light','medium','heavy'].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => toggleInList('weights', v)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                (rule.weights || []).includes(v)
                  ? 'bg-ui-primary text-ui-primary-text border-transparent'
                  : 'border-ui-border text-ui-subtext'
              }`}
            >{v}</button>
          ))}
        </div>
      </div>
      <button type="button" onClick={onRemove} className="text-[10px] text-red-400 hover:opacity-70 transition-opacity">
        Remove rule
      </button>
    </div>
  )
}

function DomainCard({ domain, onChanged, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(domain.name)
  const [rules, setRules] = useState(domain.rules || [])
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updated = await updateDomain(domain.id, { name: name.trim(), rules })
      onChanged?.(updated)
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete domain "${domain.name}"? Projects using it will lose the domain (not be deleted).`)) return
    await deleteDomain(domain.id)
    onDeleted?.(domain.id)
  }

  if (!editing) {
    return (
      <Card className="px-4 py-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ui-text">{domain.name}</p>
            {domain.is_default && <span className="text-[9px] uppercase text-ui-subtext/60 tracking-wider">default</span>}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            {!domain.is_default && <Button size="sm" variant="danger" onClick={handleDelete}>✕</Button>}
          </div>
        </div>
        <div className="space-y-0.5">
          {(domain.rules || []).map((r, i) => (
            <p key={i} className="text-[10px] text-ui-subtext leading-snug">• {ruleSummary(r)}</p>
          ))}
          {(!domain.rules || domain.rules.length === 0) && (
            <p className="text-[10px] text-ui-subtext italic">no restrictions</p>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="px-4 py-3 space-y-3">
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Domain name" />
      <div className="space-y-2">
        {rules.map((r, i) => (
          <DomainRuleEditor
            key={i}
            rule={r}
            onChange={nr => setRules(rules.map((x, j) => j === i ? nr : x))}
            onRemove={() => setRules(rules.filter((_, j) => j !== i))}
          />
        ))}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRules([...rules, { days: [0,1,2,3,4,5,6], times: null, weights: null }])}
        >
          + Add rule
        </Button>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!name.trim() || saving}>{saving ? '…' : 'Save'}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(domain.name); setRules(domain.rules || []) }}>Cancel</Button>
      </div>
    </Card>
  )
}

function DomainsSection() {
  const [domains, setDomains] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listDomains().then(setDomains).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <Card className="px-5 py-4"><p className="text-sm text-ui-subtext">Loading…</p></Card>

  return (
    <div className="space-y-2">
      {domains.map(d => (
        <DomainCard
          key={d.id}
          domain={d}
          onChanged={u => setDomains(prev => prev.map(x => x.id === u.id ? u : x))}
          onDeleted={id => setDomains(prev => prev.filter(x => x.id !== id))}
        />
      ))}
    </div>
  )
}


function CSVImportForm() {
  const [file,     setFile]    = useState(null)
  const [result,   setResult]  = useState(null)
  const [loading,  setLoading] = useState(false)

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.postForm('/import/csv', form)
      setResult(res)
    } catch (err) {
      setResult({ error: err?.detail || 'Upload failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleUpload}>
      <input
        type="file"
        accept=".csv"
        onChange={(e) => { setFile(e.target.files[0]); setResult(null) }}
        className="block w-full text-xs text-ui-subtext mb-3
          file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-ui-border
          file:text-xs file:font-medium file:text-ui-subtext file:bg-ui-surface
          hover:file:text-ui-accent cursor-pointer"
      />
      {result && !result.error && (
        <div className="mb-3 text-xs text-ui-subtext space-y-0.5">
          <p className="text-emerald-400 font-medium">Import complete</p>
          <p>Tasks imported: {result.imported}</p>
          <p>Skipped: {result.skipped}</p>
          <p>Columns detected: {Object.entries(result.columns_detected || {}).filter(([,v]) => v).map(([k,v]) => `${k}→${v}`).join(', ')}</p>
        </div>
      )}
      {result?.error && (
        <p className="mb-3 text-xs text-red-400">{result.error}</p>
      )}
      <Button type="submit" size="sm" disabled={!file || loading}>
        {loading ? 'Importing…' : 'Import'}
      </Button>
    </form>
  )
}
