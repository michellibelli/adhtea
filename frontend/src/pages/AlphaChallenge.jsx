import { useState } from 'react'
import { alphaChallenge, logout } from '../api/auth'
import AuthPage from '../components/AuthPage'
import Button from '../components/Button'
import { Input } from '../components/Input'

export default function AlphaChallenge({ onVerified, onLogout }) {
  const [code,    setCode]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await alphaChallenge(code)
      onVerified()
    } catch (err) {
      setError(err.message || 'Invalid code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await logout()
    onLogout()
  }

  return (
    <AuthPage>
      <p className="text-sm text-center font-medium text-white mb-1">Access code required</p>
      <p className="text-xs text-center text-white/70 mb-6">
        The access code has changed. Enter the new code to continue.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          placeholder="Alpha code" value={code}
          onChange={e => setCode(e.target.value)} required autoFocus
        />

        {error && (
          <div className="bg-red-500/20 border border-red-300/40 rounded-xl px-4 py-3 text-center">
            <p className="text-red-200 text-sm font-medium">{error}</p>
          </div>
        )}

        <Button type="submit" size="lg" disabled={loading}>
          {loading ? '…' : 'Verify'}
        </Button>
      </form>

      <button
        className="w-full mt-5 text-sm text-white/70 hover:text-white transition-colors text-center"
        onClick={handleLogout}
      >
        Sign out
      </button>
    </AuthPage>
  )
}
