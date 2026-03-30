'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function AuthPage() {
  const router = useRouter()
  const sb = getSupabase()

  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [selectedPlan, setSelectedPlan] = useState('basic')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [location, setLocation] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
    })
  }, [])

  function detectLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
        const d = await r.json()
        const city = d.address.city || d.address.town || d.address.village || ''
        const state = d.address.state_code || ''
        setLocation(city ? `${city}, ${state}` : d.address.postcode || '')
      } catch (e) {}
    }, () => {})
  }

  async function handleSignup() {
    setError(''); setSuccess('')
    if (!name) return setError('Please enter your name.')
    if (!email || !email.includes('@')) return setError('Please enter a valid email.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (!location) return setError('Please enter your city or zip code.')
    setLoading(true)
    const { data, error: err } = await sb.auth.signUp({
      email, password,
      options: { data: { name, location, plan: selectedPlan } }
    })
    if (err) { setError(err.message); setLoading(false); return }
    if (data.user) {
      await sb.from('profiles').upsert({ id: data.user.id, name, location, plan: selectedPlan })
      localStorage.setItem('calldid_user', JSON.stringify({ name, email, location, plan: selectedPlan, joined: new Date().toLocaleDateString() }))
      router.replace('/')
    } else {
      setSuccess('Account created! Please check your email then log in.')
      setMode('login')
      setLoading(false)
    }
  }

  async function handleLogin() {
    setError(''); setSuccess('')
    if (!loginEmail || !loginEmail.includes('@')) return setError('Please enter a valid email.')
    if (!loginPassword) return setError('Please enter your password.')
    setLoading(true)
    const { data, error: err } = await sb.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (err) { setError('Wrong email or password. Please try again.'); setLoading(false); return }
    const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single()
    localStorage.setItem('calldid_user', JSON.stringify({
      name: profile?.name || data.user.user_metadata?.name || 'User',
      email: loginEmail,
      location: profile?.location || 'Kansas City, MO',
      plan: profile?.plan || 'basic',
      joined: new Date(data.user.created_at).toLocaleDateString()
    }))
    router.replace('/')
  }

  async function handleForgot() {
    if (!loginEmail) return setError('Enter your email above first.')
    const { error: err } = await sb.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: window.location.origin + '/auth'
    })
    if (err) setError(err.message)
    else setSuccess('Password reset email sent! Check your inbox.')
  }

  async function handleGoogle() {
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' }
    })
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') mode === 'login' ? handleLogin() : handleSignup()
  }

  return (
    <div className="auth-root" onKeyDown={onKey}>
      <div className="auth-card">
        <div className="auth-logo">Call<span>did</span></div>
        <div className="auth-tagline">Find. Call. Track. Local businesses made easy.</div>

        <div className="auth-tabs">
          <button className={`auth-tab${mode === 'signup' ? ' active' : ''}`} onClick={() => { setMode('signup'); setError(''); setSuccess('') }}>Sign Up</button>
          <button className={`auth-tab${mode === 'login' ? ' active' : ''}`} onClick={() => { setMode('login'); setError(''); setSuccess('') }}>Log In</button>
        </div>

        {error && <div className="error-msg">{error}</div>}
        {success && <div className="success-msg">{success}</div>}

        {mode === 'signup' && (
          <div>
            <div className="field">
              <label className="f-label">Full Name</label>
              <input className="input" type="text" placeholder="John Smith" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label className="f-label">Email</label>
              <input className="input" type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label className="f-label">Password</label>
              <input className="input" type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label className="f-label">Your City or Zip Code</label>
              <div className="loc-row">
                <input className="input" type="text" placeholder="e.g. Kansas City, MO or 64101" value={location} onChange={e => setLocation(e.target.value)} />
                <button className="loc-btn" onClick={detectLocation} type="button">📍</button>
              </div>
            </div>
            <div className="plans">
              <div className={`plan${selectedPlan === 'basic' ? ' selected' : ''}`} onClick={() => setSelectedPlan('basic')}>
                <span className="plan-badge badge-free">FREE</span>
                <div className="plan-name">Basic</div>
                <div className="plan-price">$0<span>/mo</span></div>
                <div className="plan-features">✓ 2 lists<br />✓ Search &amp; call<br />✓ Notes</div>
              </div>
              <div className={`plan premium${selectedPlan === 'premium' ? ' selected' : ''}`} onClick={() => setSelectedPlan('premium')}>
                <span className="plan-badge badge-pro">PRO</span>
                <div className="plan-name">Premium</div>
                <div className="plan-price">$4.99<span>/mo</span></div>
                <div className="plan-features">✓ Unlimited lists<br />✓ Share &amp; export<br />✓ Priority support</div>
              </div>
            </div>
            <button className="submit-btn" disabled={loading} onClick={handleSignup}>{loading ? 'Please wait...' : 'Create Account'}</button>
            <div className="divider">or</div>
            <button className="google-btn" onClick={handleGoogle}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
            <div className="terms">By signing up you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a></div>
          </div>
        )}

        {mode === 'login' && (
          <div>
            <div className="field">
              <label className="f-label">Email</label>
              <input className="input" type="email" placeholder="you@email.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
            </div>
            <div className="field">
              <label className="f-label">Password</label>
              <input className="input" type="password" placeholder="Your password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            </div>
            <div className="forgot"><a onClick={handleForgot}>Forgot password?</a></div>
            <button className="submit-btn" disabled={loading} onClick={handleLogin}>{loading ? 'Please wait...' : 'Log In'}</button>
            <div className="divider">or</div>
            <button className="google-btn" onClick={handleGoogle}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
