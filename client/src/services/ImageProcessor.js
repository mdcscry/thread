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

    // Step 5 — Export as WebP (or JPEG if WebP not supported)
    const format = this.detectWebPSupport() ? 'image/webp' : 'image/jpeg'
    const quality = format === 'image/webp' ? WEBP_QUALITY : 0.90  // JPEG uses 0.90 quality if fallback
    const blob = await this.canvasToBlob(canvas, format, quality)

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
      const objectUrl = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(img)
      }
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
      img.src = objectUrl
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

  detectWebPSupport() {
    const canvas = document.createElement('canvas')
    if (canvas.getContext && canvas.getContext('2d')) {
      return canvas.toDataURL('image/webp').startsWith('data:image/webp')
    }
    return false
  }
}
