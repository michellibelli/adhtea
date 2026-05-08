import { useState, useEffect } from 'react'
import { getGcalStatus, getGcalConnectUrl, disconnectGcal, syncGcal } from '../api/gcal'
import { api } from '../api/client'
import Card from '../components/Card'
import Button from '../components/Button'

function GoogleCalendarCard() {
  const [status,   setStatus]   = useState(null)
  const [syncing,  setSyncing]  = useState(false)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    getGcalStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false, configured: false }))
      .finally(() => setLoading(false))
  }, [])

  // Handle ?gcal=connected redirect from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname)
      getGcalStatus().then(setStatus)
    }
  }, [])

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
    setStatus((s) => ({ ...s, connected: false, last_synced: null }))
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const { created } = await syncGcal()
      alert(`Synced — ${created} new appointment${created !== 1 ? 's' : ''} added to Today.`)
      getGcalStatus().then(setStatus)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <Card className="px-5 py-4"><p className="text-sm text-ui-subtext">Loading…</p></Card>

  return (
    <Card className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
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
              ? 'Connect your Google Calendar to pull today\'s events into appointments automatically.'
              : 'Google Calendar not yet configured on the server. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to .env.'}
          </p>
        </div>
      </div>

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


export default function Settings({ onNavigate }) {
  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">

        <h1 className="text-2xl font-semibold text-ui-text mb-6">Settings</h1>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Waiting Tasks</h2>
          <Card className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ui-text">Snoozed items</p>
                <p className="text-xs text-ui-subtext mt-0.5">Tasks with a scheduled return date</p>
              </div>
              <button
                onClick={() => onNavigate?.('waiting')}
                className="text-sm text-ui-accent hover:opacity-70 transition-opacity font-medium"
              >
                Open →
              </button>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Integrations</h2>
          <GoogleCalendarCard />
        </section>

        <section>
          <h2 className="text-xs font-semibold text-ui-subtext uppercase tracking-wide mb-3">Import</h2>
          <Card className="px-5 py-4">
            <p className="text-sm font-medium text-ui-text mb-1">Import from CSV</p>
            <p className="text-xs text-ui-subtext mb-4 leading-relaxed">
              Upload a CSV export from Notion or another task manager. Columns detected automatically.
            </p>
            <CSVImportForm />
          </Card>
        </section>

      </div>
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
