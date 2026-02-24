# THREAD Release

## Version 1.0.0

### Features
- Gender-based category filtering (male/female profiles)
- Multi-source ingestion testing (URL, Local, Camera)
- Smoke tests for CI/CD

### Test Data
- 13 male category images hosted on glyphmatic.us
- Female images pending

### Ingestion Sources
- URL (glyphmatic.us) ✅
- Local folder ✅
- Google Drive ⏳
- Camera ⏳

### Smoke Test Verification
- Each category should have 3 items after all sources tested
