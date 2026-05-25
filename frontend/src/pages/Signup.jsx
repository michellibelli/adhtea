import { useState, useEffect } from 'react'
import { getSignupConfig, signup } from '../api/auth'
import AuthPage from '../components/AuthPage'
import Button from '../components/Button'
import { Input } from '../components/Input'

export default function Signup({ onLogin, onGoLogin }) {
  const [alphaRequired, setAlphaRequired] = useState(false)
  const [name,      setName]      = useState('')
  const [username,  setUsername]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [alphaCode, setAlphaCode] = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    getSignupConfig()
      .then(res => setAlphaRequired(res.alpha_code_required))
      .catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signup(name, username, email, password, alphaCode)
      onLogin()
    } catch (err) {
      setError(err.message || "Couldn't create account. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthPage>
      <p className="text-sm text-center text-ui-subtext mb-6">Create your account</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
        <Input
          placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
          required autoCapitalize="none" autoCorrect="off" autoComplete="username"
        />
        <Input
          type="email" placeholder="Email (optional)" value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="email"
        />
        <Input
          type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} required autoComplete="new-password"
        />
        {alphaRequired && (
          <Input
            placeholder="Alpha code" value={alphaCode}
            onChange={e => setAlphaCode(e.target.value)} required
          />
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-400/30 rounded-xl px-4 py-3 text-center">
            <p className="text-red-500 text-sm font-medium">{error}</p>
          </div>
        )}

        <Button type="submit" size="lg" disabled={loading}>
          {loading ? '…' : 'Create Account'}
        </Button>
      </form>

      <button
        className="w-full mt-5 text-sm text-ui-subtext hover:text-ui-text transition-colors text-center"
        onClick={onGoLogin}
      >
        Already have an account? Sign in
      </button>
    </AuthPage>
  )
}
