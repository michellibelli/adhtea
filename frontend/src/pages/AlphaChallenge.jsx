import { useState } from 'react'
import { alphaChallenge, logout } from '../api/auth'
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
    <div className="min-h-dvh flex flex-col">
      <div className="flex flex-col items-center justify-end pb-10 pt-16 px-6"
        style={{
          background: 'linear-gradient(180deg, #130828 0%, #2A0E58 65%, #6A3090 100%)',
          minHeight: '52vh',
        }}
      >
        <div className="pride-stripe absolute top-0 left-0 right-0" style={{height:'4px'}} />
        <img
          src="/adhTeaLogo.png"
          alt="adhTea"
          style={{
            imageRendering: 'pixelated',
            width: '200px',
            filter: 'drop-shadow(0 0 24px rgba(196,144,209,0.45))',
          }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 pt-8 pb-12"
        style={{background: 'linear-gradient(180deg, #F5EEFF 0%, #FFFBF0 100%)'}}
      >
        <div className="w-full max-w-sm">
          <p className="text-sm text-center font-medium text-ui-text mb-2">Access code required</p>
          <p className="text-xs text-center text-ui-subtext mb-6">
            The access code has changed. Enter the new code to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              placeholder="Alpha code" value={code}
              onChange={e => setCode(e.target.value)} required autoFocus
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-center">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading}>
              {loading ? '…' : 'Verify'}
            </Button>
          </form>

          <Button variant="ghost" className="w-full mt-6 text-sm" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}
