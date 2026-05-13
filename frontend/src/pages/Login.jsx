import { useState, useEffect } from 'react'
import { login, setup } from '../api/auth'
import { api } from '../api/client'
import AuthPage from '../components/AuthPage'
import Button from '../components/Button'
import { Input } from '../components/Input'

export default function Login({ onLogin, onGoSignup }) {
  const [mode,        setMode]        = useState('login')
  const [setupNeeded, setSetupNeeded] = useState(null)
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
    <AuthPage>
      <p className="text-sm text-center text-white/80 mb-6">
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
          <div className="bg-red-500/20 border border-red-300/40 rounded-xl px-4 py-3 text-center">
            <p className="text-red-200 text-sm font-medium">{error}</p>
          </div>
        )}

        <Button type="submit" size="lg" disabled={loading}>
          {loading ? '…' : mode === 'setup' ? 'Create Account' : 'Sign In'}
        </Button>
      </form>

      {setupNeeded === true && (
        <button
          className="w-full mt-5 text-sm text-white/70 hover:text-white transition-colors text-center"
          onClick={() => { setMode(mode === 'login' ? 'setup' : 'login'); setError('') }}
        >
          {mode === 'login' ? 'First time? Create your account' : 'Already have an account? Sign in'}
        </button>
      )}
      {setupNeeded === false && onGoSignup && (
        <button
          className="w-full mt-5 text-sm text-white/70 hover:text-white transition-colors text-center"
          onClick={onGoSignup}
        >
          New here? Create an account
        </button>
      )}
    </AuthPage>
  )
}
