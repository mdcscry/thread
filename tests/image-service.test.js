/**
 * Unit tests for ImageService.js
 * Mocks Sharp and fs — no real image processing or file I/O
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock Sharp — must support .clone() since ImageService uses pipeline.clone()
vi.mock('sharp', () => {
  const makePipeline = () => {
    const p = {
      metadata: vi.fn().mockResolvedValue({ width: 1200, height: 1600 }),
      rotate: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      webp: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-webp-data')),
      clone: vi.fn(() => makePipeline()),
    }
    return p
  }
  const mockSharp = vi.fn(() => makePipeline())
  return { default: mockSharp }
})

// Mock fs
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-image-data')),
  },
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-image-data')),
}))

import { ImageService } from '../server/services/ImageService.js'
import sharp from 'sharp'
import fsDefault from 'fs/promises'
const fs = fsDefault

describe('ImageService', () => {
  let service

  beforeEach(() => {
    service = new ImageService()
    vi.clearAllMocks()
  })

  // ── processAndStore ──────────────────────────────────────────────────────

  describe('processAndStore', () => {
    test('processes valid image and returns all three sizes', async () => {
      const buffer = Buffer.from('fake-image')
      const result = await service.processAndStore(buffer, 42)

      expect(result).toMatchObject({ width: 1200, height: 1600 })
      // Returns paths for all three sizes
      expect(result.pathFull).toMatch(/^42\/item-[a-f0-9]+-full\.webp$/)
      expect(result.pathMedium).toMatch(/^42\/item-[a-f0-9]+-medium\.webp$/)
      expect(result.pathThumb).toMatch(/^42\/item-[a-f0-9]+-thumb\.webp$/)
      // Legacy compat field
      expect(result.filename).toMatch(/^42\/item-[a-f0-9]+-full\.webp$/)
      expect(result.size).toBeGreaterThan(0)
    })

    test('calls sharp rotate and generates three clones for full/medium/thumb', async () => {
      await service.processAndStore(Buffer.from('fake-image'), 1)
      // Sharp called at least once; find the pipeline instance that has rotate called
      const rotatedInstance = sharp.mock.results
        .map(r => r.value)
        .find(inst => inst.rotate.mock.calls.length > 0)
      expect(rotatedInstance).toBeDefined()
      expect(rotatedInstance.rotate).toHaveBeenCalled()
      expect(rotatedInstance.clone).toHaveBeenCalledTimes(3)
    })

    test('creates user directory before writing', async () => {
      await service.processAndStore(Buffer.from('img'), 99)
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('99'),
        { recursive: true }
      )
      // Three files written (full, medium, thumb)
      expect(fs.writeFile).toHaveBeenCalledTimes(3)
    })

    test('throws for image below minimum width', async () => {
      sharp.mockReturnValueOnce({
        metadata: vi.fn().mockResolvedValue({ width: 300, height: 600 }),
        rotate: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('')),
      })

      await expect(service.processAndStore(Buffer.from('small'), 1))
        .rejects.toThrow('Image too small')
    })

    test('throws for image below minimum height', async () => {
      sharp.mockReturnValueOnce({
        metadata: vi.fn().mockResolvedValue({ width: 1200, height: 400 }),
        rotate: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('')),
      })

      await expect(service.processAndStore(Buffer.from('small'), 1))
        .rejects.toThrow('Image too small')
    })
  })

  // ── generateFilename ─────────────────────────────────────────────────────

  describe('generateFilename', () => {
    test('returns webp filename with item- prefix and -full suffix', () => {
      const name = service.generateFilename(1)
      expect(name).toMatch(/^item-[a-f0-9]+-full\.webp$/)
    })

    test('generates unique filenames each call', () => {
      const a = service.generateFilename(1)
      const b = service.generateFilename(1)
      expect(a).not.toBe(b)
    })
  })

  // ── deleteImage ──────────────────────────────────────────────────────────

  describe('deleteImage', () => {
    test('deletes image file at correct path', async () => {
      await service.deleteImage('1/item-abc123.webp')
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('item-abc123.webp')
      )
    })

    test('does not throw if file already deleted (ENOENT)', async () => {
      fs.unlink.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'ENOENT' }))
      await expect(service.deleteImage('1/item-abc123.webp')).resolves.not.toThrow()
    })

    test('throws on path traversal attempt', async () => {
      await expect(service.deleteImage('../../../etc/passwd'))
        .rejects.toThrow('path traversal')
    })

    test('throws on path with double-dot traversal', async () => {
      await expect(service.deleteImage('../../server/index.js'))
        .rejects.toThrow('path traversal')
      expect(fs.unlink).not.toHaveBeenCalled()
    })

    test('throws on path traversal and does not call unlink', async () => {
      await expect(service.deleteImage('../../../etc/passwd'))
        .rejects.toThrow('path traversal')
      expect(fs.unlink).not.toHaveBeenCalled()
    })
  })

  // ── serveImage ───────────────────────────────────────────────────────────

  describe('serveImage', () => {
    const mockReply = () => {
      const r = {
        header: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis(),
      }
      return r
    }

    test('serves webp with correct headers', async () => {
      const reply = mockReply()
      await service.serveImage('1/item-abc.webp', reply)

      expect(reply.header).toHaveBeenCalledWith(
        'Cache-Control', 'public, max-age=31536000, immutable'
      )
      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'image/webp')
      expect(reply.send).toHaveBeenCalled()
    })

    test('serves jpeg with correct content-type', async () => {
      const reply = mockReply()
      await service.serveImage('1/item-abc.jpg', reply)

      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg')
    })

    test('returns 404 for missing file', async () => {
      fs.readFile.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'ENOENT' }))
      const reply = mockReply()
      await service.serveImage('1/missing.webp', reply)

      expect(reply.code).toHaveBeenCalledWith(404)
    })

    test('throws on path traversal attempt', async () => {
      const reply = mockReply()
      await expect(service.serveImage('../../../etc/passwd', reply))
        .rejects.toThrow('path traversal')
    })

    test('re-throws non-ENOENT errors', async () => {
      fs.readFile.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }))
      const reply = mockReply()
      await expect(service.serveImage('1/valid.webp', reply))
        .rejects.toThrow('permission denied')
    })
  })
})
