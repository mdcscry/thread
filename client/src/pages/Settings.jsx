import React, { useState, useEffect } from 'react'

const API_BASE = ''

export default function Settings({ apiKey, onApiKeyChange }) {
  const [localKey, setLocalKey] = useState(apiKey)
  const [qrData, setQrData] = useState(null)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    loadQRCode()
    loadStats()
  }, [apiKey])

  const loadQRCode = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/settings/qr`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json()
      setQrData(data)
    } catch (err) {
      console.error('QR error:', err)
    }
  }

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/settings/stats`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Stats error:', err)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(localKey)
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>⚙️ Settings</h1>

      {/* Stats */}
      {stats && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>📊 Wardrobe Stats</h3>
          <div className="stats">
            <div className="stat">
              <div className="stat-value">{stats.totalItems}</div>
              <div className="stat-label">Items</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.totalOutfits}</div>
              <div className="stat-label">Outfits</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.lovedItems}</div>
              <div className="stat-label">Loved</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.flaggedItems}</div>
              <div className="stat-label">Need Review</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.inLaundry}</div>
              <div className="stat-label">In Laundry</div>
            </div>
          </div>
        </div>
      )}

      {/* API Key */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>🔑 API Key</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Use this key to access THREAD from other apps
        </p>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" 
            value={localKey} 
            readOnly 
            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
          <button className="btn btn-secondary" onClick={handleCopy}>
            📋 Copy
          </button>
        </div>
      </div>

      {/* Phone Connection */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>📱 Connect Your Phone</h3>
        
        {qrData ? (
          <div style={{ textAlign: 'center' }}>
            <img 
              src={qrData.qrCode} 
              alt="Scan to connect" 
              style={{ maxWidth: 250, borderRadius: 8 }}
            />
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
              Scan with your phone camera<br/>
              or visit: <code>{qrData.url}</code>
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', marginTop: '0.5rem' }}>
              Make sure your phone is on the same WiFi as this computer
            </p>
          </div>
        ) : (
          <p>Loading QR code...</p>
        )}
      </div>

      {/* PWA Install */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>📲 Install on Phone</h3>
        <ol style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', paddingLeft: '1.5rem' }}>
          <li>Open {qrData?.url || 'the app'} in your phone's browser</li>
          <li>Tap Share (iOS) or Menu (Android)</li>
          <li>Select "Add to Home Screen"</li>
          <li>THREAD will appear as a native app!</li>
        </ol>
      </div>

      {/* About */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>ℹ️ About THREAD</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          THREAD runs entirely on your machine. No data ever leaves your home network.
        </p>
      </div>
    </div>
  )
}
