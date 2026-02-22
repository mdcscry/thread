import React, { useState, useEffect } from 'react'
import Wardrobe from './pages/Wardrobe'
import OutfitStudio from './pages/OutfitStudio'
import Ingestion from './pages/Ingestion'
import Settings from './pages/Settings'
import Profiles from './pages/Profiles'
import Camera from './pages/Camera'
import Vacation from './pages/Vacation'

const API_BASE = ''

export default function App() {
  const [page, setPage] = useState('wardrobe')
  const [apiKey, setApiKey] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [users, setUsers] = useState([])

  // Load API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('thread_api_key')
    const savedUser = localStorage.getItem('thread_current_user')
    if (saved) {
      setApiKey(saved)
      if (savedUser) {
        setCurrentUser(JSON.parse(savedUser))
      }
    }
  }, [])

  const handleApiKeyChange = (key) => {
    setApiKey(key)
    localStorage.setItem('thread_api_key', key)
  }

  const handleSwitchUser = (user, key) => {
    setCurrentUser(user)
    if (key) {
      setApiKey(key)
      localStorage.setItem('thread_api_key', key)
    }
    localStorage.setItem('thread_current_user', JSON.stringify(user))
  }

  // Simple routing
  const renderPage = () => {
    if (!apiKey) {
      return <Setup onSave={handleApiKeyChange} />
    }

    switch (page) {
      case 'wardrobe':
        return <Wardrobe apiKey={apiKey} userId={currentUser?.id} />
      case 'outfits':
        return <OutfitStudio apiKey={apiKey} userId={currentUser?.id} />
      case 'ingestion':
        return <Ingestion apiKey={apiKey} />
      case 'camera':
        return <Camera apiKey={apiKey} currentUser={currentUser} onNavigate={setPage} />
      case 'vacation':
        return <Vacation apiKey={apiKey} userId={currentUser?.id} />
      case 'profiles':
        return <Profiles apiKey={apiKey} currentUser={currentUser} onSwitchUser={handleSwitchUser} />
      case 'settings':
        return <Settings apiKey={apiKey} onApiKeyChange={handleApiKeyChange} />
      default:
        return <Wardrobe apiKey={apiKey} userId={currentUser?.id} />
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="logo">THREAD</div>
          {currentUser && (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              · {currentUser.name}
            </span>
          )}
        </div>
        {apiKey && (
          <nav className="nav">
            <a href="#" className={page === 'wardrobe' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setPage('wardrobe') }}>👗</a>
            <a href="#" className={page === 'outfits' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setPage('outfits') }}>✨</a>
            <a href="#" className={page === 'camera' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setPage('camera') }}>📷</a>
            <a href="#" className={page === 'vacation' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setPage('vacation') }}>✈️</a>
            <a href="#" className={page === 'profiles' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setPage('profiles') }}>👥</a>
            <a href="#" className={page === 'ingestion' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setPage('ingestion') }}>📥</a>
            <a href="#" className={page === 'settings' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setPage('settings') }}>⚙️</a>
          </nav>
        )}
      </header>
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  )
}

function Setup({ onSave }) {
  const [email, setEmail] = useState('you@localhost')
  const [password, setPassword] = useState('thread123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login') // 'login' or 'apikey'

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      
      const data = await res.json()
      
      if (res.ok && data.apiKey) {
        onSave(data.apiKey)
      } else {
        setError(data.error || 'Login failed')
      }
    } catch (err) {
      setError('Could not connect to server')
    }
    
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 400, margin: '4rem auto', textAlign: 'center' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>THREAD</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
        Your AI Wardrobe Stylist
      </p>
      
      <div className="card">
        {/* Toggle between login and API key */}
        <div style={{ display: 'flex', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
          <button 
            onClick={() => setMode('login')}
            style={{ 
              flex: 1, 
              padding: '0.5rem', 
              background: 'none', 
              border: 'none',
              borderBottom: mode === 'login' ? '2px solid var(--color-accent)' : 'none',
              color: mode === 'login' ? 'var(--color-text)' : 'var(--color-text-muted)',
              cursor: 'pointer'
            }}
          >
            Email
          </button>
          <button 
            onClick={() => setMode('apikey')}
            style={{ 
              flex: 1, 
              padding: '0.5rem', 
              background: 'none', 
              border: 'none',
              borderBottom: mode === 'apikey' ? '2px solid var(--color-accent)' : 'none',
              color: mode === 'apikey' ? 'var(--color-text)' : 'var(--color-text-muted)',
              cursor: 'pointer'
            }}
          >
            API Key
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@localhost"
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="thread123"
              />
            </div>
            
            {error && (
              <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>
            )}
            
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : (
          <ApiKeySetup onSave={onSave} error={error} setError={setError} loading={loading} setLoading={setLoading} />
        )}
      </div>
    </div>
  )
}

function ApiKeySetup({ onSave, error, setError, loading, setLoading }) {
  const [key, setKey] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!key.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/v1/items`, {
        headers: { Authorization: `Bearer ${key}` }
      })
      
      if (res.ok) {
        onSave(key)
      } else {
        setError('Invalid API key')
      }
    } catch (err) {
      setError('Could not connect to server')
    }
    
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>API Key</label>
        <input 
          type="password" 
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="thread_sk_..."
        />
      </div>
      
      {error && (
        <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>
      )}
      
      <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
        {loading ? 'Connecting...' : 'Connect'}
      </button>
    </form>
  )
}
