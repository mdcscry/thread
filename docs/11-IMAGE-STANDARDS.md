# THREAD Image Standards & Compression

*Last Updated: 2026-02-25*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

Every wardrobe item in outerfit is represented by a photo. Photo quality directly affects Gemini vision AI accuracy — a well-framed, properly sized image produces better attribute extraction than a cropped, oversized, or oddly-proportioned one. This document defines the image standard, the compression pipeline, and how non-conforming images are handled.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Image Pipeline                                  │
├─────────────────────────────────────────────────────────────────────┤
│  User captures photo      │  Phone camera, 3:4 portrait             │
│  Client preview           │  Canvas API auto-crops to 3:4           │
│  Client compress          │  Resize to 1200×1600px, WebP 85%        │
│  Upload (3 routes)        │  upload-photo / upload-from-url / batch  │
│  ImageService             │  Single pipeline: validate, rotate, 3x  │
│  Server store (3 sizes)   │  full / medium / thumb — all WebP       │
│  Gemini analysis          │  medium (800×800) sent to Flash         │
└─────────────────────────────────────────────────────────────────────┘
```

## Upload Routes

All three routes funnel through `ImageService.processAndStore()` — single source of truth.

| Route | Usage |
|-------|-------|
| `POST /api/v1/ingestion/upload-photo` | GUI multipart upload |
| `POST /api/v1/ingestion/upload-from-url` | Fetch image by URL (glyphmatic.us, CDN, etc.) |
| `POST /api/v1/ingestion/start` | Batch job (Google Drive folder) |

> **URL source rule:** Always use `https://glyphmatic.us/tools/thread/` for test image URLs.
> Never use Shopify CDN URLs directly — they expire when products are updated.

---

## The Standard

| Property | Value | Rationale |
|----------|-------|-----------|
| Aspect ratio | 3:4 (portrait) | Default for iPhone and Samsung in portrait mode |
| Format | WebP | 25-35% smaller than JPEG at same quality, wide support |
| Max upload size | 2MB | Hard server-side limit before processing |
| Min resolution | 400 × 533px | Below this Gemini struggles to identify attributes |

### Three Output Sizes (all WebP)

| Size | Dimensions | Quality | Use |
|------|-----------|---------|-----|
| **full** | 1200 × 1600 | 85% | Storage, display |
| **medium** | 800 × 800 | 82% | Gemini vision analysis |
| **thumb** | 300 × 300 | 78% | UI thumbnails |

### Why 3:4 Portrait

Modern smartphones default to 3:4 in portrait mode — the natural way a person holds their phone to photograph clothing. A garment photographed in this orientation fills the frame from collar to hem with minimal wasted space. Landscape shots (4:3) cut off either the top or bottom of most garments. Square crops (1:1) waste vertical space. 3:4 is correct for this use case.

### Why WebP

WebP produces images 25-35% smaller than JPEG at equivalent visual quality. For a wardrobe of 100 items, the difference is roughly 15MB vs 25MB of storage. At scale across thousands of users this compounds significantly. Browser and iOS/Android support for WebP is universal as of 2024.

---

## Client-Side Processing

Processing on the client before upload accomplishes two things: it saves bandwidth (sending a 200KB WebP instead of a 4MB JPEG), and it gives the user immediate visual feedback on the crop before anything is uploaded.

```bash
# No new packages needed — browser Canvas API handles everything
# For the React PWA this is pure browser JS
```

```javascript
// client/src/services/ImageProcessor.js

const TARGET_WIDTH  = 1200
const TARGET_HEIGHT = 1600  // 3:4 ratio
const TARGET_RATIO  = 3 / 4
const WEBP_QUALITY  = 0.85
const MAX_FILE_SIZE = 2 * 1024 * 1024  // 2MB

export class ImageProcessor {

  /**
   * Full pipeline: validate → auto-crop to 3:4 → resize → compress to WebP
   * Returns a Blob ready for upload and a preview URL for display
   */
  async process(file) {
    // Step 1 — Basic validation
    if (!file.type.startsWith('image/')) {
      throw new Error('Please upload an image file.')
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('Image is too large. Please use a photo under 2MB.')
    }

    // Step 2 — Load into browser
    const img = await this.loadImage(file)

    // Step 3 — Calculate auto-crop to 3:4
    const crop = this.calculateCrop(img.width, img.height)

    // Step 4 — Draw cropped + resized onto canvas
    const canvas = document.createElement('canvas')
    canvas.width  = TARGET_WIDTH
    canvas.height = TARGET_HEIGHT

    const ctx = canvas.getContext('2d')
    ctx.drawImage(
      img,
      crop.sx, crop.sy, crop.sw, crop.sh,   // source crop
      0, 0, TARGET_WIDTH, TARGET_HEIGHT       // destination fill
    )

    // Step 5 — Export as WebP
    const blob = await this.canvasToBlob(canvas, 'image/webp', WEBP_QUALITY)

    // Step 6 — Generate preview URL
    const previewUrl = URL.createObjectURL(blob)

    return {
      blob,
      previewUrl,
      originalSize: file.size,
      compressedSize: blob.size,
      compressionRatio: Math.round((1 - blob.size / file.size) * 100),
      wasCropped: crop.wasCropped,
    }
  }

  /**
   * Calculate the largest centered 3:4 crop from any input dimensions.
   * If the image is already 3:4, no crop occurs.
   */
  calculateCrop(w, h) {
    const inputRatio = w / h

    if (Math.abs(inputRatio - TARGET_RATIO) < 0.01) {
      // Already 3:4 — no crop needed
      return { sx: 0, sy: 0, sw: w, sh: h, wasCropped: false }
    }

    let sw, sh, sx, sy

    if (inputRatio > TARGET_RATIO) {
      // Image is wider than 3:4 — crop the sides
      sh = h
      sw = Math.round(h * TARGET_RATIO)
      sx = Math.round((w - sw) / 2)
      sy = 0
    } else {
      // Image is taller than 3:4 — crop top and bottom
      sw = w
      sh = Math.round(w / TARGET_RATIO)
      sx = 0
      sy = Math.round((h - sh) / 2)
    }

    return { sx, sy, sw, sh, wasCropped: true }
  }

  loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas export failed')),
        type,
        quality
      )
    })
  }
}
```

---

## Upload Component with Preview

```jsx
// client/src/components/ItemPhotoUpload.jsx
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
```

---

## Server-Side Validation & Storage

The server validates and re-processes anything that arrives. Client-side processing is a courtesy — server-side is the law.

```bash
npm install sharp
```

```javascript
// server/services/ImageService.js
import sharp from 'sharp'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'

const IMAGES_DIR    = process.env.IMAGES_DIR || './data/images'
const MIN_WIDTH     = 400
const MIN_HEIGHT    = 533
const MAX_WIDTH     = 2400
const MAX_HEIGHT    = 3200
const TARGET_WIDTH  = 1200
const TARGET_HEIGHT = 1600

export class ImageService {

  async processAndStore(buffer, userId) {
    // Step 1 — Read metadata
    const meta = await sharp(buffer).metadata()

    // Step 2 — Validate minimum size
    if (meta.width < MIN_WIDTH || meta.height < MIN_HEIGHT) {
      throw new Error(
        `Image too small (${meta.width}×${meta.height}). ` +
        `Minimum is ${MIN_WIDTH}×${MIN_HEIGHT}px. ` +
        `Try taking the photo in better lighting and closer to the item.`
      )
    }

    // Step 3 — Auto-crop to 3:4, resize, convert to WebP
    const processed = await sharp(buffer)
      .rotate()                    // Auto-rotate based on EXIF orientation
      .resize({
        width:  TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: 'cover',              // Sharp's cover = centered crop to fill
        position: 'centre',
      })
      .webp({ quality: 85 })
      .toBuffer()

    // Step 4 — Generate filename and store
    const filename = this.generateFilename(userId)
    const userDir  = path.join(IMAGES_DIR, String(userId))
    await fs.mkdir(userDir, { recursive: true })

    const filepath = path.join(userDir, filename)
    await fs.writeFile(filepath, processed)

    return {
      filename: `${userId}/${filename}`,
      size: processed.length,
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
    }
  }

  generateFilename(userId) {
    const hash = crypto.randomBytes(8).toString('hex')
    return `item-${hash}.webp`
  }

  // Delete image file when item is deleted
  async deleteImage(filename) {
    const filepath = path.join(IMAGES_DIR, filename)
    try {
      await fs.unlink(filepath)
    } catch (err) {
      // File already gone — not an error
    }
  }

  // Serve image with cache headers
  async serveImage(filename, reply) {
    const filepath = path.join(IMAGES_DIR, filename)
    return reply
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Content-Type', 'image/webp')
      .sendFile(filepath)
  }
}
```

### Upload Route

```javascript
// server/routes/ingestion.js
fastify.post('/api/v1/ingestion/upload-photo', {
  preHandler: [authenticate],
  config: {
    // Fastify multipart config
    limits: { fileSize: 2 * 1024 * 1024 }  // 2MB hard limit
  }
}, async (request, reply) => {
  const data = await request.file()

  if (!data) {
    return reply.status(400).send({ error: 'No file provided' })
  }

  if (!data.mimetype.startsWith('image/')) {
    return reply.status(400).send({ error: 'File must be an image' })
  }

  const buffer = await data.toBuffer()

  try {
    const result = await imageService.processAndStore(buffer, request.user.id)
    return reply.send({
      filename: result.filename,
      size: result.size,
      width: result.width,
      height: result.height,
    })
  } catch (err) {
    if (err.message.includes('too small')) {
      return reply.status(422).send({ error: err.message, code: 'IMAGE_TOO_SMALL' })
    }
    throw err
  }
})
```

---

## Photography Tips (In-App)

Show these on the upload screen and in the quickstart guide. Good photos = better AI = happier users.

```
For the best results:

✓  Hold your phone upright (portrait)
✓  Lay the item flat on a light-colored surface, or hang it up
✓  Fill most of the frame with the item
✓  Natural light is best — avoid flash if possible
✓  Avoid heavy shadows across the item

✗  Don't photograph items while wearing them (body shape confuses the AI)
✗  Don't photograph from a steep angle
✗  Don't include other items in the same photo
```

---

## Storage Estimates

At the standard 1200×1600px WebP 85% output:

| Wardrobe size | Est. per item | Total storage |
|---------------|---------------|---------------|
| 20 items | ~180KB | ~3.6MB |
| 50 items | ~180KB | ~9MB |
| 100 items | ~180KB | ~18MB |
| 200 items | ~180KB | ~36MB |

**Per 1,000 users (average 60 items each):** ~10.8GB

At Cloudflare R2 pricing (~$0.015/GB/month), 1,000 users' images cost approximately **$0.16/month** in storage. Negligible.

The RTX Pro 4000 Ada VPS local storage handles this comfortably until several thousand users. R2 offload is an option at scale but not required early.

---

## Environment Variables

```bash
# Images
IMAGES_DIR=./data/images
MAX_UPLOAD_SIZE_MB=2
IMAGE_CACHE_MAX_AGE=31536000    # 1 year — immutable filenames
```

---

## New Files

```
server/
├── services/
│   └── ImageService.js         # Sharp processing + storage

client/src/
├── services/
│   └── ImageProcessor.js       # Client-side crop + compress
└── components/
    └── ItemPhotoUpload.jsx      # Upload UI with preview + stats
```

---

## Key Design Decisions

**Auto-crop silently, show the result.** Telling a user their photo is "wrong" creates friction and feels judgmental. Silently cropping to 3:4 and showing them the result with a "looks good? / retake" option is friendlier and produces the same outcome.

**Client compresses, server enforces.** Client-side processing reduces upload time and bandwidth — a 4MB iPhone JPEG becomes a 180KB WebP before it ever leaves the device. Server-side Sharp re-processes everything regardless, so the client cannot send malformed images.

**WebP everywhere.** The `capture="environment"` attribute on the file input opens the rear camera directly on mobile. Whatever the phone captures — HEIC, JPEG, PNG — Sharp normalizes it to WebP on the server. The client Canvas export also targets WebP. The stored format is always WebP.

**Immutable filenames + long cache headers.** Images are content-addressed (random hash in filename) and never updated in place — if an item photo changes, a new file is written. This means `Cache-Control: immutable` with a 1-year max-age is safe, and CDN/browser caching is maximally effective.

**EXIF rotation.** Sharp's `.rotate()` with no argument reads the EXIF orientation tag and auto-rotates before processing. This prevents the common "photo is sideways" problem that occurs when a phone saves rotation metadata rather than physically rotating the pixels.
