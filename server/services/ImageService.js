import sharp from 'sharp'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'

const IMAGES_DIR    = process.env.IMAGES_DIR || './data/images'
const MIN_WIDTH     = 400
const MIN_HEIGHT    = 533

// Normalized output sizes — all WebP
const FULL_W   = 1200; const FULL_H   = 1600  // 3:4 portrait, cover crop
const MEDIUM_W =  800; const MEDIUM_H =  800  // square, fit inside
const THUMB_W  =  300; const THUMB_H  =  300  // square, cover crop

export class ImageService {

  /**
   * Compress, normalize, and store a single image in three sizes (full/medium/thumb).
   * All sizes output as WebP. Returns paths for DB storage.
   *
   * Used by ALL upload routes — single source of truth for image processing.
   */
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

    // Step 3 — Generate hash-based filename (dedup by content)
    const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 12)
    const userDir = path.join(IMAGES_DIR, String(userId))
    await fs.mkdir(userDir, { recursive: true })

    const base = `item-${hash}`
    const fullPath   = path.join(userDir, `${base}-full.webp`)
    const mediumPath = path.join(userDir, `${base}-medium.webp`)
    const thumbPath  = path.join(userDir, `${base}-thumb.webp`)

    // Step 4 — Process all three sizes (EXIF rotate on all)
    const pipeline = sharp(buffer).rotate()  // Auto-rotate from EXIF

    const [fullBuf, mediumBuf, thumbBuf] = await Promise.all([
      pipeline.clone()
        .resize({ width: FULL_W, height: FULL_H, fit: 'cover', position: 'centre' })
        .webp({ quality: 85 })
        .toBuffer(),
      pipeline.clone()
        .resize({ width: MEDIUM_W, height: MEDIUM_H, fit: 'inside' })
        .webp({ quality: 82 })
        .toBuffer(),
      pipeline.clone()
        .resize({ width: THUMB_W, height: THUMB_H, fit: 'cover', position: 'centre' })
        .webp({ quality: 78 })
        .toBuffer(),
    ])

    await Promise.all([
      fs.writeFile(fullPath,   fullBuf),
      fs.writeFile(mediumPath, mediumBuf),
      fs.writeFile(thumbPath,  thumbBuf),
    ])

    const dbBase = `${userId}/${base}`
    return {
      // DB paths (relative to IMAGES_DIR)
      pathFull:   `${dbBase}-full.webp`,
      pathMedium: `${dbBase}-medium.webp`,
      pathThumb:  `${dbBase}-thumb.webp`,
      // Disk paths (for AI analysis — pass medium to Gemini)
      diskFull:   fullPath,
      diskMedium: mediumPath,
      diskThumb:  thumbPath,
      // Metadata
      size: fullBuf.length,
      width: FULL_W,
      height: FULL_H,
      // Legacy compat (upload-photo route returns this)
      filename: `${dbBase}-full.webp`,
    }
  }

  generateFilename(userId) {
    const hash = crypto.randomBytes(8).toString('hex')
    return `item-${hash}-full.webp`
  }

  // Delete image file when item is deleted
  async deleteImage(filename) {
    const baseDirResolved = path.resolve(IMAGES_DIR)
    const filepath = path.resolve(path.join(baseDirResolved, filename))
    const relative = path.relative(baseDirResolved, filepath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid filename: path traversal attempt')
    }
    try {
      await fs.unlink(filepath)
    } catch (err) {
      // File already gone — not an error
    }
  }

  // Serve image with cache headers
  async serveImage(filename, reply) {
    const baseDirResolved = path.resolve(IMAGES_DIR)
    const filepath = path.resolve(path.join(baseDirResolved, filename))
    const relative = path.relative(baseDirResolved, filepath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid filename: path traversal attempt')
    }
    try {
      const fileBuffer = await fs.readFile(filepath)
      const lowerFilename = filename.toLowerCase()
      const contentType = lowerFilename.endsWith('.jpg') || lowerFilename.endsWith('.jpeg') 
        ? 'image/jpeg' 
        : 'image/webp'
      return reply
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .header('Content-Type', contentType)
        .send(fileBuffer)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return reply.code(404).send({ error: 'Image not found' })
      }
      throw err
    }
  }
}
