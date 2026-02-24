# 04 — Ingestion Pipeline

## Overview

The ingestion pipeline takes a shared cloud storage link, downloads all clothing images, runs vision AI analysis on each one, and populates the database. It runs as a background job with real-time progress streaming to the UI.

---

## Supported Sources

| Source | Method | Notes |
|---|---|---|
| Google Drive (shared album/folder) | Scrape share page + gdrive download API | Public shares only — no OAuth needed |
| Local folder | File system watch | Drag & drop or path input |
| iCloud Shared Album | Web scrape (icl.tw URLs) | Public shares only |
| Direct image URLs | HTTP download | One or many |
| ZIP upload | Unzip + process | Max 2GB |

---

## Pipeline Stages

```
Stage 1: DISCOVERY
  - Parse share URL to determine source type
  - Crawl source to build image URL list
  - Filter: images only (jpg, jpeg, png, heic, webp)
  - Deduplicate by URL hash
  - Create ingestion_job record

Stage 2: DOWNLOAD
  - Download each image concurrently (max 5 parallel)
  - Convert HEIC → JPG (sharp library)
  - Resize: store original + create 800px and 300px thumbnails
  - Save to: data/images/user_{id}/{job_id}/{hash}.jpg
  - Update job progress (processed / total)

Stage 3: ANALYSIS
  - For each downloaded image:
    - Send to Ollama vision model
    - Stage 1 prompt: raw description
    - Stage 2 prompt: structured JSON extraction
    - Parse and validate response
    - Handle failures (retry x2, then flag)
  - Batch size: 1 at a time (Ollama is sequential by default)
  - Progress: ~30-90 seconds per image depending on model + hardware

Stage 4: STORAGE
  - Insert into clothing_items table
  - Create refinement_prompts for flagged items
  - Emit WebSocket events for real-time UI updates
  - Mark job as completed
```

---

## Google Drive Crawling

Google Drive shared folder links have the format:
`https://drive.google.com/drive/folders/{FOLDER_ID}?usp=sharing`

The crawler:
1. Hits `https://drive.google.com/drive/folders/{FOLDER_ID}` 
2. Extracts file IDs from the page (these are stable)
3. Downloads via `https://drive.google.com/uc?export=download&id={FILE_ID}`
4. Handles the "large file" confirmation redirect automatically

```javascript
// server/services/IngestionService.js (excerpt)
async function crawlGoogleDrive(folderUrl) {
  const folderId = extractFolderId(folderUrl)
  
  // Use Google Drive API v3 (no auth needed for public folders)
  // Actually: scrape the page HTML to extract file metadata
  const response = await fetch(
    `https://drive.google.com/drive/folders/${folderId}`
  )
  const html = await response.text()
  
  // Extract file IDs using regex on the page's JSON data
  const filePattern = /\["([a-zA-Z0-9_-]{28,})","([^"]+\.(jpg|jpeg|png|heic|webp))"/gi
  const files = []
  let match
  while ((match = filePattern.exec(html)) !== null) {
    files.push({ id: match[1], name: match[2] })
  }
  
  return files
}
```

> **Note to Claude Code:** This approach works for public shares but Google changes their page structure occasionally. Implement with fallback to `googleapis` npm package with API key if scraping fails. Add a settings field for an optional Google API key.

---

## Real-Time Progress

The frontend connects via WebSocket to get live updates:

```javascript
// Events emitted during ingestion
{
  type: 'ingestion_start',
  jobId: 123,
  totalImages: 87
}

{
  type: 'image_downloaded',
  jobId: 123,
  imageName: 'dress_blue.jpg',
  processed: 12,
  total: 87
}

{
  type: 'image_analyzed',
  jobId: 123,
  itemId: 456,
  category: 'dress',
  color: 'cobalt blue',
  confidence: 0.89,
  processed: 13,
  total: 87
}

{
  type: 'image_flagged',
  jobId: 123,
  itemId: 457,
  reason: 'low_confidence',
  processed: 14,
  total: 87
}

{
  type: 'ingestion_complete',
  jobId: 123,
  totalAdded: 82,
  flagged: 8,
  failed: 3
}
```

The Ingestion page shows:
- Live progress bar
- Thumbnail grid that populates in real-time as items are analyzed
- Running count of flagged items (pulse animation)
- ETA estimate

---

## Image Processing Details

```javascript
// Using 'sharp' for image processing
const sharp = require('sharp')

async function processImage(inputPath, outputDir, hash) {
  const baseName = `${hash}`
  
  // Original (max 2000px, preserve ratio)
  await sharp(inputPath)
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toFile(`${outputDir}/${baseName}_full.jpg`)
  
  // Medium (800px for detail view)
  await sharp(inputPath)
    .resize(800, 800, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toFile(`${outputDir}/${baseName}_medium.jpg`)
  
  // Thumbnail (300px for grid)
  await sharp(inputPath)
    .resize(300, 300, { fit: 'cover', position: 'top' })
    .jpeg({ quality: 80 })
    .toFile(`${outputDir}/${baseName}_thumb.jpg`)
  
  return {
    full: `${outputDir}/${baseName}_full.jpg`,
    medium: `${outputDir}/${baseName}_medium.jpg`,
    thumb: `${outputDir}/${baseName}_thumb.jpg`
  }
}
```

---

## Ingestion UI — Page Design

```
┌──────────────────────────────────────────────────────────┐
│  📥  Import Your Wardrobe                                │
│                                                          │
│  Paste your Google Drive shared folder link:             │
│  ┌──────────────────────────────────────────────────┐    │
│  │ https://drive.google.com/drive/folders/...       │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  For:  [ Emma ▾ ]    Model: [ qwen2.5-vl:7b ▾ ]        │
│                                                          │
│  [ Or drop a folder / ZIP here ]                        │
│                                                          │
│  ──────────────────────────────────────────────────────  │
│  Analyzing 87 images...  ████████████░░░░░░  62%         │
│                          54 analyzed  8 flagged          │
│                                                          │
│  [thumbnail] [thumbnail] [thumbnail] [thumbnail] ...     │
│   Blue dress  White tee  Blazer...   ⚑ Needs review     │
└──────────────────────────────────────────────────────────┘
```

---

## Deduplication

Before inserting, the system checks:
1. Perceptual image hash (pHash) — catches resized/recompressed duplicates
2. Source URL match — exact same URL previously ingested

If a duplicate is found, user is asked: "This looks like an item already in your wardrobe. Skip or replace?"

---

## Batch Size & Performance

| Machine | Model | Approx. Speed |
|---|---|---|
| M1/M2 Mac (no GPU) | moondream2 | ~15s per image |
| M1/M2 Mac (no GPU) | qwen2.5-vl:7b | ~45s per image |
| PC with RTX 3060 | qwen2.5-vl:7b | ~8s per image |
| PC with RTX 4090 | qwen2.5-vl:7b | ~3s per image |
| CPU-only PC | moondream2 | ~60-90s per image |

For a 100-item wardrobe on a typical machine, expect 30-90 minutes for full analysis. The app runs this in the background — the user can do other things.
