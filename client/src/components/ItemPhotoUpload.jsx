import { useState, useCallback } from 'react'
import { ImageProcessor } from '../services/ImageProcessor'

const processor = new ImageProcessor()

export function ItemPhotoUpload({ onProcessed }) {
  const [preview, setPreview]     = useState(null)
  const [processing, setProcessing] = useState(false)
  const [stats, setStats]         = useState(null)
  const [error, setError]         = useState(null)

  const handleFile = useCallback(async (file) => {
    setError(null)
    setProcessing(true)

    try {
      const result = await processor.process(file)
      setPreview(result.previewUrl)
      setStats(result)
      onProcessed(result.blob)
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }, [onProcessed])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="photo-upload">
      {/* Drop zone */}
      {!preview && (
        <label
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"   /* Opens rear camera on mobile */
            onChange={e => handleFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          <div className="drop-zone-content">
            <span className="drop-icon">📷</span>
            <p>Take a photo or upload from your gallery</p>
            <p className="drop-hint">
              Best results: portrait orientation, good lighting,
              item filling most of the frame
            </p>
          </div>
        </label>
      )}

      {/* Processing state */}
      {processing && (
        <div className="processing-overlay">
          <span>Preparing image...</span>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="preview-container">
          <img
            src={preview}
            alt="Item preview"
            className="preview-image"
            style={{ aspectRatio: '3/4', objectFit: 'cover' }}
          />
          {stats?.wasCropped && (
            <p className="crop-notice">
              Auto-cropped to portrait — looks good?
            </p>
          )}
          {stats && (
            <p className="compression-stats">
              {Math.round(stats.compressedSize / 1024)}KB
              {stats.compressionRatio > 0 &&
                ` (${stats.compressionRatio}% smaller than original)`}
            </p>
          )}
          <button
            className="retake-btn"
            onClick={() => { setPreview(null); setStats(null) }}
          >
            Retake photo
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="upload-error">{error}</p>
      )}
    </div>
  )
}
