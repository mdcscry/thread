import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function PasswordReset({ onReset, isVerifyEmail }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
  const isResetMode = !!token
  const isVerifyMode = isVerifyEmail
  
  async function handleRequestReset(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const email = e.target.email.value
    
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      
      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.error || 'Failed to send reset email')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }
  
  async function handleResetPassword(e) {
    e.preventDefault()
    
    if (!isVerifyMode && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    if (!isVerifyMode && password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const endpoint = isVerifyMode ? '/api/v1/auth/verify-email' : '/api/v1/auth/reset-password'
      const body = isVerifyMode 
        ? { token }
        : { token, password }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      
      if (res.ok) {
        if (isVerifyMode) {
          setSuccess(true)
          setTimeout(() => navigate('/?message=email-verified'), 2000)
        } else {
          onReset ? onReset() : navigate('/?message=password-reset')
        }
      } else {
        setError(data.error || (isVerifyMode ? 'Failed to verify email' : 'Failed to reset password'))
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }
  
  if (success) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 400, margin: '100px auto', textAlign: 'center' }}>
          <h2>✅ {isVerifyMode ? 'Email Verified!' : 'Password Reset!'}</h2>
          <p>{isVerifyMode ? 'Your email has been verified.' : 'Your password has been reset.'}</p>
          <button onClick={() => navigate('/')}>Go to login</button>
        </div>
      </div>
    )
  }
  
  if (isResetMode) {
    return (
      <div className="page">
        <form onSubmit={handleResetPassword} className="card" style={{ maxWidth: 400, margin: '100px auto' }}>
          <h2>Reset Password</h2>
          
          {error && <div className="error">{error}</div>}
          
          <label>
            New Password
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          
          <label>
            Confirm Password
            <input 
              type="password" 
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          
          <button type="submit" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    )
  }
  
  return (
    <div className="page">
      <form onSubmit={handleRequestReset} className="card" style={{ maxWidth: 400, margin: '100px auto' }}>
        <h2>Forgot Password</h2>
        <p style={{ color: '#666', marginBottom: 20 }}>Enter your email and we'll send reset instructions.</p>
        
        {error && <div className="error">{error}</div>}
        
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
        
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/">Back to login</a>
        </div>
      </form>
    </div>
  )
}
