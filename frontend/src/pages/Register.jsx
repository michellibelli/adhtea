import { useState } from 'react'
import { register } from '../api/auth'
import { Input } from '../components/Input'
import Button from '../components/Button'

export default function Register({ inviteToken, onRegister }) {
  const [form,  setForm]  = useState({ name: '', username: '', password: '' })
  const [error, setError] = useState(null)
  const [busy,  setBusy]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await register(inviteToken, form.name, form.username, form.password)
      onRegister()
    } catch (err) {
      setError(err?.message || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/adhTeaLogo.png" alt="adhTea" className="h-16 mx-auto mb-4" style={{ imageRendering: 'pixelated' }} />
          <h1 className="text-2xl font-semibold text-ui-text">Create your account</h1>
          <p className="text-sm text-ui-subtext mt-1">You've been invited to adhTea</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            placeholder="Your name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
            autoFocus
          />
          <Input
            placeholder="Choose a username"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
            required
          />
          <Input
            type="password"
            placeholder="Choose a password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            required
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </div>
    </div>
  )
}
