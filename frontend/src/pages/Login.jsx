import { useState, useEffect } from 'react'
import { login, setup } from '../api/auth'
import { api } from '../api/client'
import Button from '../components/Button'
import { Input } from '../components/Input'

export default function Login({ onLogin, onGoSignup }) {
  const [mode,        setMode]        = useState('login')
  const [setupNeeded, setSetupNeeded] = useState(null)   // null = checking
  const [name,        setName]        = useState('')
  const [username,    setUsername]    = useState('')
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)

  useEffect(() => {
    api.get('/setup-needed')
      .then(res => setSetupNeeded(res.needed))
      .catch(() => setSetupNeeded(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      mode === 'setup' ? await setup(name, username, password) : await login(username, password)
      onLogin()
    } catch (err) {
      setError(err.message || "Couldn't sign in. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">

      {/* Orchid top — logo */}
      <div className="flex flex-col items-center justify-end pb-10 pt-16 px-6"
        style={{
          background: 'linear-gradient(180deg, #B858C8 0%, #CC6FD4 55%, #D87FDE 100%)',
          minHeight: '52vh',
        }}
      >
        <img
          src="/adhTeaLogo.png"
          alt="adhTea"
          style={{
            width: '220px',
            filter: 'drop-shadow(0 6px 32px rgba(90,0,120,0.35))',
          }}
        />
      </div>

      {/* White bottom — form */}
      <div className="flex-1 flex flex-col items-center px-6 pt-8 pb-12"
        style={{background: 'linear-gradient(180deg, #F8F0FF 0%, #FFFFFF 100%)'}}
      >
        <div className="w-full max-w-sm">
          <p className="text-sm text-center text-ui-subtext mb-6">
            {mode === 'setup' ? 'Create your account' : 'Welcome back'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'setup' && (
              <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
            )}
            <Input
              placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
              required autoCapitalize="none" autoCorrect="off"
            />
            <Input
              type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} required
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-center">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading}>
              {loading ? '…' : mode === 'setup' ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          {setupNeeded === true && (
            <Button
              variant="ghost"
              className="w-full mt-6 text-sm"
              onClick={() => { setMode(mode === 'login' ? 'setup' : 'login'); setError('') }}
            >
              {mode === 'login' ? 'First time? Create your account' : 'Already have an account? Sign in'}
            </Button>
          )}
          {setupNeeded === false && onGoSignup && (
            <Button variant="ghost" className="w-full mt-6 text-sm" onClick={onGoSignup}>
              New here? Create an account
            </Button>
          )}
        </div>
      </div>

    </div>
  )
}
