import { useState, useEffect } from 'react'
import { getSignupConfig, signup } from '../api/auth'
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
          <p className="text-sm text-center text-ui-subtext mb-6">Create your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
            <Input
              placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
              required autoCapitalize="none" autoCorrect="off"
            />
            <Input
              type="email" placeholder="Email (optional)" value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <Input
              type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} required
            />
            {alphaRequired && (
              <Input
                placeholder="Alpha code" value={alphaCode}
                onChange={e => setAlphaCode(e.target.value)} required
              />
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-center">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading}>
              {loading ? '…' : 'Create Account'}
            </Button>
          </form>

          <Button variant="ghost" className="w-full mt-6 text-sm" onClick={onGoLogin}>
            Already have an account? Sign in
          </Button>
        </div>
      </div>
    </div>
  )
}
