# P0: Upload Crashes + Image Resize Timeouts — Execution Plan

**Date:** 2026-03-17  
**Author:** Eng Manager (via CEO delegation)  
**Status:** LOCKED

---

## Root Cause Analysis

### Bug 1: Server Crash on Upload (CRITICAL)
**Location:** `/opt/thread/server/services/IngestionService.js`, line ~145

**Issue:** Undefined variable `mediumPath` in `processImage()` method

```javascript
// CURRENT (BROKEN):
analysis = await this.ollama.analyzeImageStructured(mediumPath)

// SHOULD BE:
analysis = await this.ollama.analyzeImageStructured(medium.diskPath)
```

**Why it crashes:** The variable `mediumPath` is never defined. When `/ingestion/start` (Google Drive batch) is called, this throws a ReferenceError that crashes the server because there's no try/catch around this specific call.

### Bug 2: Async Error Not Handled
**Location:** Same file, `processImage()` method

**Issue:** The AI analysis call is inside a try/catch, but the error handling for the entire job doesn't prevent server crash in all paths.

---

## Fix Plan

### Step 1: Fix undefined variable (5 min)
- Change `mediumPath` → `medium.diskPath` in `processImage()`

### Step 2: Add error boundary (10 min)
- Wrap the entire `startJob()` in try/catch with proper error response
- Don't let async errors crash the server

### Step 3: Verify (10 min)
- Run: `cd /opt/thread && npx playwright test`
- Test upload endpoint manually

---

## Files to Change

| File | Change |
|------|--------|
| `/opt/thread/server/services/IngestionService.js` | Fix `mediumPath` → `medium.diskPath`, add error boundary |

---

## Test Approach

1. Run existing test suite: `cd /opt/thread && npx playwright test`
2. Test upload manually with curl:
   ```bash
   curl -X POST http://localhost:3000/api/v1/ingestion/upload-photo-json \
     -H "Authorization: Bearer thread_sk_..." \
     -H "Content-Type: application/json" \
     -d '{"image":"BASE64_IMAGE_DATA","filename":"test.jpg"}'
   ```
3. Test batch upload (if possible): POST to `/ingestion/start`

---

## Image Resize Status

The code **already resizes images** before AI processing:
- `full` - original quality (for display)
- `medium` - 800x800 max (for AI analysis) ← THIS IS USED
- `thumb` - 300x300 (for thumbnails)

So the "resize to fix timeout" is already implemented. The issue was the crash prevented it from ever reaching the resize step.

---

**LOCKED. Ready for coder.**
