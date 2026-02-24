/**
 * Unit tests for ImageService.js
 * Mocks Sharp and fs — no real image processing or file I/O
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock Sharp
vi.mock('sharp', () => {
  const mockSharp = vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 1200, height: 1600 }),
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-webp-data')),
  }))
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
    test('processes valid image and returns metadata', async () => {
      const buffer = Buffer.from('fake-image')
      const result = await service.processAndStore(buffer, 42)

      expect(result).toMatchObject({
        width: 1200,
        height: 1600,
      })
      expect(result.filename).toMatch(/^42\/item-[a-f0-9]+\.webp$/)
      expect(result.size).toBeGreaterThan(0)
    })

    test('calls sharp with correct resize options', async () => {
      // Track the chain calls via a fresh mock instance
      const mockInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1200, height: 1600 }),
        rotate: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp-data')),
      }
      sharp.mockImplementationOnce(() => mockInstance)
        .mockImplementationOnce(() => mockInstance)

      await service.processAndStore(Buffer.from('fake-image'), 1)

      expect(mockInstance.rotate).toHaveBeenCalled()
      expect(mockInstance.resize).toHaveBeenCalledWith({
        width: 1200,
        height: 1600,
        fit: 'cover',
        position: 'centre',
      })
      expect(mockInstance.webp).toHaveBeenCalledWith({ quality: 85 })
    })

    test('creates user directory before writing', async () => {
      await service.processAndStore(Buffer.from('img'), 99)

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('99'),
        { recursive: true }
      )
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
    test('returns webp filename with item- prefix', () => {
      const name = service.generateFilename(1)
      expect(name).toMatch(/^item-[a-f0-9]{16}\.webp$/)
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
  })
})
