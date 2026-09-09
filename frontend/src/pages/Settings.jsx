import { useState, useEffect } from 'react'
import { getGcalStatus, getGcalConnectUrl, disconnectGcal, syncGcal, listCalendars, updateCalendars } from '../api/gcal'
import { listUsers, createUser, deleteUser, logout, getAlphaCode, setAlphaCode } from '../api/auth'
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
      <div className="px-4 pt-8 max-w-lg mx-auto w-full" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }}>

        <h1 className="text-2xl font-semibold text-ui-text mb-6" style={{ fontFamily: 'var(--font-pixel)' }}>Menu</h1>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Tasks</h2>
          <div className="space-y-2">
            <Card className="settings-nav-card px-5 py-4" onClick={() => onNavigate?.('today')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ui-text">Today 🍵</p>
                  <p className="text-xs text-ui-subtext mt-0.5">Plan and work your day</p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18, opacity: 0.3, flexShrink: 0 }}>
                  <path d="M9 6l6 6-6 6" stroke="var(--aria-text)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Card>
            <Card className="settings-nav-card px-5 py-4" onClick={() => onNavigate?.('tasks')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ui-text">All tasks</p>
                  <p className="text-xs text-ui-subtext mt-0.5">Browse, search, and batch-schedule</p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18, opacity: 0.3, flexShrink: 0 }}>
                  <path d="M9 6l6 6-6 6" stroke="var(--aria-text)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Card>
          </div>
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
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Export</h2>
          <Card className="px-5 py-4">
            <p className="text-sm font-medium text-ui-text mb-1">Export to CSV</p>
            <p className="text-xs text-ui-subtext mb-4 leading-relaxed">
              Download every task — dates, status, tags, notes — as a spreadsheet.
              Routine check-offs are one row per day and synced appointments one row
              per occurrence, so leave those out for just the tasks you wrote.
            </p>
            <CSVExportForm />
          </Card>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Display</h2>
          <ThemePicker />
          <div className="mt-3">
            <BuildChipToggle />
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Attributions</h2>
          <Card className="px-5 py-4">
            <p className="text-xs text-ui-subtext leading-relaxed">
              Watercolor textures and illustrations by{' '}
              <a
                href="https://www.vecteezy.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ui-accent underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                Vecteezy.com
              </a>
            </p>
          </Card>
        </section>

        <div className="pride-stripe my-6" />

        <section className="mb-6">
          <button
            onClick={handleLogout}
            className="text-sm text-red-400 hover:opacity-70 transition-opacity font-medium"
          >
            Sign out
          </button>
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
          <p className="text-xs text-ui-subtext mt-0.5">Tiny bottom-right tag showing the deployed build number.</p>
        </div>
        <button
          onClick={toggle}
          aria-pressed={show}
          className="settings-toggle"
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
    </Card>
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


// Routine check-offs and synced calendar events are one row per day / per
// occurrence, so they swamp the hand-written tasks in a long export. Both are
// droppable here; everything is included until she says otherwise.
const ALL_EXPORT_TYPES = ['task', 'appointment', 'routine', 'note']

function CSVExportForm() {
  const [includeDeleted,  setIncludeDeleted]  = useState(false)
  const [skipRoutines,    setSkipRoutines]    = useState(false)
  const [skipAppointments, setSkipAppointments] = useState(false)
  const [since,   setSince]   = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(null)
  const [error,   setError]   = useState(null)

  function clearResult() { setDone(null); setError(null) }

  async function handleExport() {
    setLoading(true)
    clearResult()
    try {
      const params = new URLSearchParams()
      if (includeDeleted) params.set('include_deleted', 'true')
      if (skipRoutines || skipAppointments) {
        const types = ALL_EXPORT_TYPES.filter(t =>
          !(skipRoutines && t === 'routine') && !(skipAppointments && t === 'appointment')
        )
        params.set('types', types.join(','))
      }
      if (since) params.set('since', since)
      const qs = params.toString()
      const filename = await api.download(
        `/export/tasks.csv${qs ? `?${qs}` : ''}`, 'adhtea-tasks.csv'
      )
      setDone(filename)
    } catch (err) {
      setError(err?.message || 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  const checkbox = (checked, onChange, label) => (
    <label className="flex items-center gap-2 text-xs text-ui-subtext cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => { onChange(e.target.checked); clearResult() }}
        className="accent-ui-accent"
      />
      {label}
    </label>
  )

  return (
    <div>
      <div className="space-y-2 mb-3">
        {checkbox(skipRoutines, setSkipRoutines, 'Leave out routine check-offs')}
        {checkbox(skipAppointments, setSkipAppointments, 'Leave out calendar appointments')}
        {checkbox(includeDeleted, setIncludeDeleted, 'Include deleted tasks')}
      </div>
      <label className="block text-xs text-ui-subtext mb-3">
        <span className="block mb-1">Only since (optional)</span>
        <input
          type="date"
          value={since}
          onChange={(e) => { setSince(e.target.value); clearResult() }}
          className="px-2 py-1 rounded-sm border border-ui-border bg-ui-surface text-ui-text text-xs"
        />
      </label>
      {done && (
        <p className="mb-3 text-xs text-emerald-400 font-medium">Saved {done}</p>
      )}
      {error && (
        <p className="mb-3 text-xs text-red-400">{error}</p>
      )}
      <Button size="sm" onClick={handleExport} disabled={loading}>
        {loading ? 'Exporting…' : 'Download CSV'}
      </Button>
    </div>
  )
}
