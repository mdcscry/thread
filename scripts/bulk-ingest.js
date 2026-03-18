#!/usr/bin/env node
/**
 * bulk-ingest.js
 * 
 * Scans /data/images/user_<N>/ for existing *_full.jpg files,
 * runs MiniMax MCP vision analysis on the corresponding *_medium.jpg,
 * and inserts each into the DB as a clothing_item.
 * 
 * Usage: node scripts/bulk-ingest.js [--user 1] [--dry-run]
 */

import { execSync } from 'child_process'
import { readdirSync, existsSync } from 'fs'
import path from 'path'
import { Pool } from 'pg'
import sharp from 'sharp'

const IMAGE_ROOT = process.env.IMAGE_STORAGE_PATH || '/data/images'
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || ''
const MINIMAX_API_HOST = process.env.MINIMAX_API_HOST || 'https://api.minimax.io'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const USER_ARG = args.includes('--user') ? parseInt(args[args.indexOf('--user') + 1]) : null

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://plotlines:plines2026@localhost:5432/thread',
})

// ─── Vision helpers ──────────────────────────────────────────────────────────

function analyzeWithMiniMax(imagePath, prompt) {
  const escapedPath = imagePath.replace(/"/g, '\\"')
  const escapedPrompt = prompt.replace(/"/g, '\\"')
  const cmd = `export MINIMAX_API_KEY="${MINIMAX_API_KEY}" && export MINIMAX_API_HOST="${MINIMAX_API_HOST}" && mcporter call minimax.understand_image prompt="${escapedPrompt}" image_source="${escapedPath}"`
  return execSync(cmd, {
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
    shell: '/bin/bash'
  })
}

function extractCategory(desc) {
  const d = desc.toLowerCase()
  if (d.includes('jeans') || d.includes('denim') || d.includes('pants') || d.includes('trousers') || d.includes('shorts')) return 'bottom'
  if (d.includes('shirt') || d.includes('blouse') || d.includes('sweater') || d.includes('t-shirt') || d.includes('tee') || d.includes('top')) return 'top'
  if (d.includes('jacket') || d.includes('coat') || d.includes('hoodie') || d.includes('blazer')) return 'outerwear'
  if (d.includes('shoes') || d.includes('sneakers') || d.includes('boots') || d.includes('loafers') || d.includes('heels')) return 'shoes'
  if (d.includes('dress') || d.includes('skirt')) return 'dress'
  if (d.includes('hat') || d.includes('cap') || d.includes('bag') || d.includes('belt') || d.includes('scarf')) return 'accessory'
  return 'unknown'
}

function extractColor(desc) {
  const d = desc.toLowerCase()
  const colors = ['black', 'white', 'blue', 'navy', 'indigo', 'gray', 'grey', 'brown', 'tan', 'beige', 'red', 'green', 'olive', 'khaki', 'pink', 'purple', 'yellow', 'orange', 'cream', 'ivory']
  for (const c of colors) if (d.includes(c)) return c
  return 'unknown'
}

function extractMaterial(desc) {
  const d = desc.toLowerCase()
  const materials = ['cotton', 'wool', 'silk', 'linen', 'polyester', 'denim', 'leather', 'knit', 'synthetic', 'nylon', 'fleece', 'cashmere', 'tweed', 'velvet', 'satin']
  for (const m of materials) if (d.includes(m)) return m
  return 'unknown'
}

function extractFit(desc) {
  const d = desc.toLowerCase()
  if (d.includes('tight') || d.includes('slim') || d.includes('fitted')) return 'slim'
  if (d.includes('relaxed') || d.includes('loose') || d.includes('oversized') || d.includes('baggy')) return 'loose'
  if (d.includes('regular') || d.includes('straight')) return 'regular'
  return 'regular'
}

function extractPattern(desc) {
  const d = desc.toLowerCase()
  if (d.includes('stripe') || d.includes('striped')) return 'striped'
  if (d.includes('plaid') || d.includes('check') || d.includes('tartan')) return 'plaid'
  if (d.includes('floral') || d.includes('flower')) return 'floral'
  if (d.includes('graphic') || d.includes('print')) return 'graphic'
  if (d.includes('pattern') || d.includes('texture')) return 'textured'
  return 'solid'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const client = await pool.connect()

  try {
    // Find user dirs to scan
    const userDirs = readdirSync(IMAGE_ROOT)
      .filter(d => d.startsWith('user_'))
      .filter(d => USER_ARG ? d === `user_${USER_ARG}` : true)

    if (userDirs.length === 0) {
      console.log('No user image directories found in', IMAGE_ROOT)
      return
    }

    let totalInserted = 0
    let totalSkipped = 0
    let totalFailed = 0

    for (const userDir of userDirs) {
      const userId = parseInt(userDir.replace('user_', ''))
      const dirPath = path.join(IMAGE_ROOT, userDir)
      const files = readdirSync(dirPath)

      // Get unique hashes from *_full.jpg files
      const hashes = files
        .filter(f => f.endsWith('_full.jpg'))
        .map(f => f.replace('_full.jpg', ''))

      console.log(`\n[${userDir}] Found ${hashes.length} full images`)

      for (const hash of hashes) {
        const fullPath   = path.join(dirPath, `${hash}_full.jpg`)
        const mediumPath = path.join(dirPath, `${hash}_medium.jpg`)
        const thumbPath  = path.join(dirPath, `${hash}_thumb.jpg`)

        // DB paths (relative to IMAGE_ROOT)
        const fullDb   = `${userDir}/${hash}_full.jpg`
        const mediumDb = `${userDir}/${hash}_medium.jpg`
        const thumbDb  = `${userDir}/${hash}_thumb.jpg`

        // Check if already in DB (by image path)
        const existing = await client.query(
          'SELECT item_id FROM item_images WHERE path_full = $1 LIMIT 1',
          [fullDb]
        )
        if (existing.rows.length > 0) {
          console.log(`  [SKIP] ${hash} — already in DB (item ${existing.rows[0].item_id})`)
          totalSkipped++
          continue
        }

        // Generate medium/thumb if missing (orphan full-only images)
        if (!existsSync(mediumPath)) {
          console.log(`    → Generating missing medium for ${hash}`)
          try {
            await sharp(fullPath).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 85 }).toFile(mediumPath)
          } catch (sharpErr) {
            console.warn(`  [SKIP] ${hash} — corrupt/unreadable image: ${sharpErr.message}`)
            totalSkipped++
            continue
          }
        }
        if (!existsSync(thumbPath)) {
          console.log(`    → Generating missing thumb for ${hash}`)
          try {
            await sharp(fullPath).resize(300, 300, { fit: 'cover', position: 'top' }).jpeg({ quality: 80 }).toFile(thumbPath)
          } catch (sharpErr) {
            console.warn(`  [SKIP] ${hash} — corrupt/unreadable image (thumb): ${sharpErr.message}`)
            totalSkipped++
            continue
          }
        }

        // Use medium for analysis
        const analysisPath = mediumPath

        let rawDescription = null
        let structured = {}
        let modelUsed = null

        console.log(`  [ANALYZE] ${hash} (${path.basename(analysisPath)})`)

        if (!DRY_RUN) {
          // Try MiniMax MCP first
          if (MINIMAX_API_KEY) {
            try {
              const prompt = 'Analyze this clothing item in detail. Describe: type/category, primary color, secondary colors, material/fabric, pattern, fit (slim/regular/loose/oversized), silhouette, style tags, occasion, season.'
              rawDescription = analyzeWithMiniMax(analysisPath, prompt).trim()
              modelUsed = 'minimax-mcp'
              console.log(`    → MiniMax: ${rawDescription.slice(0, 80)}...`)
            } catch (err) {
              console.warn(`    → MiniMax failed: ${err.message.slice(0, 80)}`)
            }
          }

          if (!rawDescription) {
            console.log('    → No analysis available (no MiniMax key, Ollama skipped for bulk)')
            rawDescription = null
          }

          if (rawDescription) {
            const d = rawDescription.toLowerCase()
            structured = {
              category: extractCategory(rawDescription),
              primary_color: extractColor(rawDescription),
              material: extractMaterial(rawDescription),
              fit: extractFit(rawDescription),
              pattern: extractPattern(rawDescription),
            }
          }
        }

        if (DRY_RUN) {
          console.log(`  [DRY-RUN] Would insert ${hash} for user ${userId}`)
          continue
        }

        try {
          // Insert clothing item
          const itemRes = await client.query(`
            INSERT INTO clothing_items (
              user_id, source_url,
              category, subcategory, primary_color, secondary_color, weft_color, colors,
              pattern, material, texture, silhouette, fit, length,
              style_tags, occasion, formality, season, weight,
              temp_min_f, temp_max_f, ai_confidence, ai_flagged,
              ai_raw_description, ai_model_used, ai_status
            ) VALUES (
              $1, $2,
              $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18, $19,
              $20, $21, $22, $23,
              $24, $25, $26
            ) RETURNING id
          `, [
            userId, fullDb,
            structured.category || null, null, structured.primary_color || null, null, null, '[]',
            structured.pattern || null, structured.material || null, null, null, structured.fit || null, null,
            '[]', '[]', 5, '[]', null,
            45, 85, rawDescription ? 0.6 : 0, 0,
            rawDescription || null, modelUsed, rawDescription ? 'complete' : 'pending'
          ])

          const itemId = itemRes.rows[0].id

          // Insert image paths
          await client.query(`
            INSERT INTO item_images (item_id, path_full, path_medium, path_thumb, photo_type, is_primary)
            VALUES ($1, $2, $3, $4, 'unknown', 1)
          `, [itemId, fullDb, mediumDb, thumbDb])

          console.log(`  [OK] ${hash} → item ${itemId} (${structured.category || 'unknown'}, ${structured.primary_color || 'unknown'})`)
          totalInserted++
        } catch (err) {
          console.error(`  [FAIL] ${hash}:`, err.message)
          totalFailed++
        }
      }
    }

    console.log(`\n═══════════════════════════════`)
    console.log(`Inserted: ${totalInserted}`)
    console.log(`Skipped:  ${totalSkipped}`)
    console.log(`Failed:   ${totalFailed}`)
    console.log(`═══════════════════════════════`)

  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
