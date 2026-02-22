import React, { useState, useRef, useEffect } from 'react'

const API_BASE = ''

export default function Camera({ apiKey, currentUser, onNavigate }) {
  const [stream, setStream] = useState(null)
  const [cameraError, setCameraError] = useState(null)
  const [queue, setQueue] = useState([])
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera API not available')
        return
      }
      let mediaStream
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }
      setStream(mediaStream)
      if (videoRef.current) videoRef.current.srcObject = mediaStream
    } catch (err) {
      setCameraError(err.message || 'Camera access denied')
    }
  }

  const stopCamera = () => {
    if (stream) stream.getTracks().forEach(t => t.stop())
  }

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  const capture = () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
    canvas.toBlob(blob => {
      const photo = {
        id: Date.now(),
        blob,
        preview: canvas.toDataURL('image/jpeg', 0.8),
        name: '',
        status: 'ready'
      }
      setQueue(prev => [...prev, photo])
    }, 'image/jpeg', 0.9)
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (evt) => {
        setQueue(prev => [...prev, {
          id: Date.now() + Math.random(),
          blob: file,
          preview: evt.target.result,
          name: file.name.replace(/\.[^.]+$/, ''),
          status: 'ready'
        }])
      }
      reader.readAsDataURL(file)
    })
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  const updateName = (id, name) => {
    setQueue(prev => prev.map(p => p.id === id ? { ...p, name } : p))
  }

  const removeFromQueue = (id) => {
    setQueue(prev => prev.filter(p => p.id !== id))
  }

  const uploadOne = async (photo) => {
    setQueue(prev => prev.map(p => p.id === photo.id ? { ...p, status: 'uploading' } : p))
    try {
      // Convert blob to base64
      const base64 = await blobToBase64(photo.blob)
      const filename = (photo.name?.trim() || `photo_${photo.id}`) + '.jpg'

      const res = await fetch(`${API_BASE}/api/v1/ingestion/upload-photo-json`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: base64, filename })
      })

      const data = await res.json()

      if (res.ok && data.itemId) {
        setQueue(prev => prev.map(p => p.id === photo.id
          ? { ...p, status: 'done', itemId: data.itemId }
          : p
        ))
      } else {
        setQueue(prev => prev.map(p => p.id === photo.id
          ? { ...p, status: 'error', error: data.error || 'Upload failed' }
          : p
        ))
      }
    } catch (err) {
      setQueue(prev => prev.map(p => p.id === photo.id
        ? { ...p, status: 'error', error: err.message }
        : p
      ))
    }
  }

  const uploadAll = () => {
    queue.filter(p => p.status === 'ready').forEach(uploadOne)
  }

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  const doneCount = queue.filter(p => p.status === 'done').length
  const readyCount = queue.filter(p => p.status === 'ready').length
  const uploadingCount = queue.filter(p => p.status === 'uploading').length

  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem' }}>📸 Add to Wardrobe</h1>
      {currentUser && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Adding for: <strong>{currentUser.name}</strong>
        </p>
      )}

      {/* File picker — always shown, primary for desktop */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>📁 Choose Photos</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Select one or more clothing photos from your device
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          data-testid="file-input"
        />
        <button
          className="btn btn-primary"
          onClick={() => fileInputRef.current?.click()}
          style={{ width: '100%' }}
          data-testid="choose-photos-btn"
        >
          Choose Photos
        </button>
      </div>

      {/* Camera error message */}
      {cameraError && (
        <div className="card" style={{ background: 'var(--color-error)', color: 'white', padding: '1rem', marginBottom: '1rem' }}>
          <p style={{ margin: 0 }}>📷 Camera not available: {cameraError}</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', opacity: 0.8 }}>
            Use "Choose Photos" button above to upload from your device instead.
          </p>
        </div>
      )}

      {/* Camera — desktop/HTTPS only */}
      {!cameraError && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem', position: 'relative' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', display: 'block', background: '#000', maxHeight: 300 }}
          />
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>
            <button
              onClick={capture}
              data-testid="capture-btn"
              style={{
                width: 64, height: 64, borderRadius: '50%',
                border: '4px solid white', background: 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'white' }} />
            </button>
          </div>
        </div>
      )}

      {/* Queue */}
      {queue.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>
              {doneCount > 0 && `✅ ${doneCount} added · `}
              {uploadingCount > 0 && `⏳ ${uploadingCount} uploading · `}
              {readyCount > 0 && `${readyCount} ready`}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {readyCount > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={uploadAll}
                  data-testid="upload-all-btn"
                  disabled={uploadingCount > 0}
                >
                  Upload {readyCount > 1 ? `All (${readyCount})` : ''}
                </button>
              )}
              {doneCount > 0 && onNavigate && (
                <button
                  className="btn btn-secondary"
                  onClick={() => onNavigate('wardrobe')}
                  data-testid="view-wardrobe-btn"
                >
                  View Wardrobe →
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {queue.map(photo => (
              <div
                key={photo.id}
                style={{
                  display: 'flex', gap: '0.75rem', alignItems: 'center',
                  padding: '0.75rem',
                  background: 'var(--color-surface-2)',
                  borderRadius: 8,
                  border: photo.status === 'done' ? '1px solid var(--color-success)' :
                          photo.status === 'error' ? '1px solid var(--color-error)' : '1px solid transparent'
                }}
                data-testid={`queue-item-${photo.id}`}
              >
                {/* Thumbnail */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img
                    src={photo.preview}
                    alt="Preview"
                    style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }}
                  />
                  {photo.status === 'uploading' && (
                    <div style={{
                      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                      borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.2rem'
                    }}>⏳</div>
                  )}
                  {photo.status === 'done' && (
                    <div style={{
                      position: 'absolute', inset: 0, background: 'rgba(0,180,0,0.4)',
                      borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.4rem'
                    }}>✓</div>
                  )}
                </div>

                {/* Name input + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {photo.status === 'ready' ? (
                    <input
                      type="text"
                      value={photo.name}
                      onChange={e => updateName(photo.id, e.target.value)}
                      placeholder="Name this item (optional)"
                      style={{ width: '100%', marginBottom: '0.25rem' }}
                      data-testid={`name-input-${photo.id}`}
                    />
                  ) : (
                    <div style={{ fontWeight: 500, marginBottom: '0.25rem', fontSize: '0.95rem' }}>
                      {photo.name || 'Unnamed item'}
                    </div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {photo.status === 'ready' && 'Ready to upload'}
                    {photo.status === 'uploading' && 'Uploading & analyzing…'}
                    {photo.status === 'done' && '✅ Added to wardrobe'}
                    {photo.status === 'error' && `❌ ${photo.error}`}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ flexShrink: 0, display: 'flex', gap: '0.5rem' }}>
                  {photo.status === 'ready' && (
                    <button
                      className="btn btn-primary"
                      onClick={() => uploadOne(photo)}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                    >
                      Upload
                    </button>
                  )}
                  {photo.status === 'error' && (
                    <button
                      className="btn"
                      onClick={() => uploadOne(photo)}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                    >
                      Retry
                    </button>
                  )}
                  {(photo.status === 'ready' || photo.status === 'error') && (
                    <button
                      onClick={() => removeFromQueue(photo.id)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'var(--color-surface-3)', border: 'none',
                        cursor: 'pointer', fontSize: '0.9rem'
                      }}
                    >×</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
