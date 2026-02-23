# THREAD

AI-powered wardrobe stylist. Take a photo of your clothes, let AI analyze and categorize them, and get outfit recommendations.

## Features

- **Photo Ingestion**: Upload clothes via URL, local folder, Google Drive, or camera
- **AI Analysis**: Automatic categorization, color detection, and style tagging
- **Gender-Based Categories**: Different category options for male/female profiles
- **Outfit Generation**: AI-powered outfit recommendations
- **Multi-Profile Support**: Multiple users with separate wardrobes

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Fastify
- **Database**: SQLite
- **AI**: Ollama (local LLMs)
- **Testing**: Playwright

## Development

### Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable/legacy |
| `qa` | Development & testing |
| `thread-deploy` | Production releases |

### Setup

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Start development
npm run dev

# Run tests
npx playwright test
```

### Ports

| Environment | URL | Database |
|-------------|-----|----------|
| Production | https://localhost:3000 | thread.db |
| QA | https://localhost:8080 | thread-test.db |

## Architecture

### Categories (Gender-Based)

**Male (16 categories):**
T-Shirt, Button-Up, Knitwear, Hoodie, Jacket, Jeans, Pants, Shorts, Boots, Sneakers, Shoes, Sandals, Belt, Hat, Socks, Other

**Female (32 categories):**
All male categories + Blouse, Dress, Tank, Camisole, Skirts, Leggings, Heels, Flats, Scarf, Necklace, Earrings, Bracelet, Handbag

### Ingestion Sources

1. **URL**: Direct image URLs (e.g., glyphmatic.us)
2. **Local Folder**: Watch a local directory for new images
3. **Google Drive**: Scan a Drive folder
4. **Camera**: Take photos directly in-app

### Test Data

Test images stored in `data/test-images/`:
```
data/test-images/blueowl/
├── male/   (13 category images)
└── female/ (pending photos)
```

Hosted on glyphmatic.us: `https://glyphmatic.us/tools/thread/male/`

## CI/CD

### Workflow

1. Development happens on `qa` branch
2. Run tests: `npx playwright test`
3. Create PR from qa → thread-deploy
4. Merge PR to release
5. Tag release: `git tag v1.x.x && git push origin v1.x.x`

### Smoke Tests

Tests verify:
- Wardrobe loads
- All pages accessible
- Gender-based categories work
- URL/Local/Camera ingestion works
- Each category has expected item count after all sources

## Contributing

1. Create feature branch from `qa`
2. Make changes
3. Add tests
4. PR to `qa`

## License

MIT
