import React, { useState, useEffect } from 'react'

const API_BASE = ''

export default function Ingestion({ apiKey }) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [model, setModel] = useState('llava:7b')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [jobs, setJobs] = useState([])
  const [ollamaStatus, setOllamaStatus] = useState(null)
  const [models, setModels] = useState([])

  useEffect(() => {
    checkOllama()
    loadJobs()
  }, [])

  const checkOllama = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/ingestion/check-ollama`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json()
      setOllamaStatus(data)
      if (data.models) setModels(data.models.map(m => m.name))
    } catch (err) {
      setOllamaStatus({ healthy: false })
    }
  }

  const loadJobs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/ingestion`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json()
      setJobs(data)
    } catch (err) {
      console.error('Failed to load jobs:', err)
    }
  }

  const startIngestion = async () => {
    if (!sourceUrl.trim()) return

    setLoading(true)
    setStatus({ message: 'Starting ingestion...', progress: 0 })

    try {
      const res = await fetch(`${API_BASE}/api/v1/ingestion/start`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceUrl,
          sourceType: 'google_drive',
          model
        })
      })

      if (res.ok) {
        setStatus({ message: 'Job started! Processing images...', progress: 10 })
        
        // Poll for status
        const pollInterval = setInterval(async () => {
          const jobRes = await fetch(`${API_BASE}/api/v1/ingestion`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          })
          const jobData = await jobRes.json()
          
          if (jobData[0]) {
            const latestJob = jobData[0]
            setStatus({
              message: `Processed ${latestJob.processed} of ${latestJob.total_images} images`,
              progress: latestJob.total_images > 0 
                ? Math.round((latestJob.processed / latestJob.total_images) * 100)
                : 0
            })

            if (latestJob.status === 'completed') {
              clearInterval(pollInterval)
              setStatus({ 
                message: `Done! Added ${latestJob.processed} items.`, 
                progress: 100 
              })
              loadJobs()
              setLoading(false)
            } else if (latestJob.status === 'failed') {
              clearInterval(pollInterval)
              setStatus({ 
                message: 'Job failed. Check the error log.', 
                progress: 0,
                error: true
              })
              setLoading(false)
            }
          }
        }, 3000)
      }
    } catch (err) {
      setStatus({ message: 'Failed to start ingestion', error: true })
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>📥 Import Your Wardrobe</h1>

      {/* Ollama Status */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ 
            width: 8, 
            height: 8, 
            borderRadius: '50%', 
            background: ollamaStatus?.healthy ? 'var(--color-success)' : 'var(--color-error)' 
          }} />
          <span>
            {ollamaStatus?.healthy 
              ? `Ollama ready (${ollamaStatus.defaultModel})` 
              : 'Ollama not running - install it to use AI features'}
          </span>
        </div>
      </div>

      {/* Ingestion Form */}
      <div className="card">
        <div className="form-group">
          <label>Google Drive Shared Folder Link</label>
          <input 
            type="text"
            placeholder="https://drive.google.com/drive/folders/..."
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>AI Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.length > 0 ? (
              models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))
            ) : (
              <>
                <option value="llava:7b">llava:7b (recommended)</option>
                <option value="moondream2">moondream2 (faster)</option>
                <option value="qwen2.5-vl:7b">qwen2.5-vl:7b (better quality)</option>
              </>
            )}
          </select>
        </div>

        <button 
          className="btn btn-primary"
          onClick={startIngestion}
          disabled={loading || !sourceUrl.trim() || !ollamaStatus?.healthy}
          style={{ width: '100%' }}
        >
          {loading ? 'Processing...' : '📥 Start Import'}
        </button>

        {/* Progress */}
        {status && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: status.error ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                {status.message}
              </span>
              <span>{status.progress}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${status.progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Past Jobs */}
      <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Recent Imports</h2>
      
      {jobs.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No imports yet.</p>
      ) : (
        <div className="grid" style={{ gap: '0.5rem' }}>
          {jobs.map(job => (
            <div key={job.id} className="card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.9rem' }}>
                    {new Date(job.created_at).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {job.total_images} images · {job.processed} processed · {job.failed} failed
                  </div>
                </div>
                <span className={`badge ${job.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                  {job.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
