import { useState } from 'react'
import { login, setup } from '../api/auth'
import Button from '../components/Button'
import { Input } from '../components/Input'

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    <div className="aria-page flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-5xl font-bold tracking-tight text-ui-text mb-2">ARIA</div>
          <div className="text-sm text-ui-subtext">
            {mode === 'setup' ? 'Create your account' : 'Welcome back'}
          </div>
        </div>

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

          {error && <p className="text-red-400 text-sm text-center px-2">{error}</p>}

          <Button type="submit" size="lg" disabled={loading}>
            {loading ? '…' : mode === 'setup' ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <Button
          variant="ghost"
          className="w-full mt-6 text-sm"
          onClick={() => { setMode(mode === 'login' ? 'setup' : 'login'); setError('') }}
        >
          {mode === 'login' ? 'First time? Create your account' : 'Already have an account? Sign in'}
        </Button>
      </div>
    </div>
  )
}
