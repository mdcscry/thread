import sharp from 'sharp'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'

const IMAGES_DIR    = process.env.IMAGES_DIR || './data/images'
const MIN_WIDTH     = 400
const MIN_HEIGHT    = 533
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
