# 07 — API & Webhooks

## Overview

THREAD exposes a full REST API so you can automate and control it from:
- **iPhone Shortcuts** (ask Siri "What should I wear today?")
- **Android automations** (Tasker, HTTP Request tiles)
- **Home Assistant** (morning routine triggers)
- **Any HTTP client** (curl, scripts, etc.)

Every endpoint requires an API key. Keys are generated in Settings and scoped to specific permissions.

---

## Base URL

When running locally:
```
http://localhost:3000/api/v1
```

From your phone on the same WiFi:
```
http://192.168.1.X:3000/api/v1
```

From outside your home (if you set up port forwarding or Tailscale):
```
https://your-tailscale-hostname:3000/api/v1
```

---

## Authentication

All API requests require:
```
Authorization: Bearer thread_sk_your_api_key_here
```

Keys are created in Settings → API Keys → New Key.
Each key has configurable permissions: `read`, `generate_outfit`, `feedback`, `admin`.

---

## Core Endpoints

### Wardrobe

```
GET    /api/v1/items                  List all items (filterable)
GET    /api/v1/items/:id              Get single item + image
POST   /api/v1/items/:id/love         Toggle loved status
PATCH  /api/v1/items/:id              Update item attributes
DELETE /api/v1/items/:id              Soft delete (retire) item
GET    /api/v1/items/flagged          Get items needing review
POST   /api/v1/items/:id/refine       Submit answer to refinement prompt
```

### Outfit Generation

```
POST   /api/v1/outfits/generate       Generate outfits (main endpoint)
GET    /api/v1/outfits                List saved/historical outfits
GET    /api/v1/outfits/:id            Get specific outfit
POST   /api/v1/outfits/:id/feedback   Submit thumbs up/down
POST   /api/v1/outfits/:id/worn       Mark as worn today
```

### Quick Generation (for Shortcuts)

```
GET    /api/v1/quick/outfit-today     Auto-generates outfit for today
                                      (uses weather, time, day of week)
                                      Returns: outfit JSON + image URLs
```

### Ingestion

```
POST   /api/v1/ingestion/start        Start ingestion job
GET    /api/v1/ingestion/:jobId       Get job status
GET    /api/v1/ingestion              List all jobs
```

### Weather

```
GET    /api/v1/weather?location=NYC   Get current weather for location
```

### Users

```
GET    /api/v1/users                  List users
POST   /api/v1/users                  Create user
GET    /api/v1/users/:id              Get user profile
```

---

## Detailed: Generate Outfits

```
POST /api/v1/outfits/generate
```

**Request:**
```json
{
  "userId": 1,
  "occasion": "dinner",
  "timeOfDay": "evening",
  "formalityTarget": 7,
  "location": "New York, NY",
  "chatPrompt": "Something elegant but not stuffy for an Italian restaurant",
  "numToGenerate": 15,
  "excludeItemIds": [42, 103]
}
```

**Response:**
```json
{
  "outfits": [
    {
      "id": null,
      "items": [
        {
          "id": 17,
          "category": "top",
          "name": "Black silk blouse",
          "imageUrl": "http://localhost:3000/images/user_1/abc_medium.jpg",
          "thumbnailUrl": "http://localhost:3000/images/user_1/abc_thumb.jpg",
          "color": "black",
          "subcategory": "blouse"
        },
        {
          "id": 34,
          "category": "bottom",
          "name": "Ivory wide-leg trousers",
          "imageUrl": "..."
        },
        {
          "id": 56,
          "category": "shoes",
          "name": "Black strappy heels"
        }
      ],
      "scores": {
        "final": 0.87,
        "rule": 0.82,
        "ml": 0.91
      },
      "weatherMatch": "Perfect for 58°F partly cloudy",
      "styleNotes": "The ivory trousers balance the black silk top elegantly"
    },
    ...
  ],
  "context": {
    "weather": { "temp_f": 58, "condition": "partly_cloudy" },
    "occasion": "dinner",
    "formalityTarget": 7
  },
  "modelMaturity": 0.73
}
```

---

## Quick Outfit Endpoint (iPhone Shortcut Friendly)

```
GET /api/v1/quick/outfit-today?userId=1&format=simple
```

Returns the single best outfit for right now based on:
- Current time (morning/evening)
- Auto-fetched local weather (uses last known location)
- Day of week pattern (workday vs. weekend)
- Highest ML score

**Simple format response:**
```json
{
  "outfit": {
    "description": "Cream linen blouse with wide-leg jeans and tan mules",
    "items": ["Cream linen blouse", "Wide-leg jeans", "Tan leather mules", "Straw tote"],
    "imageUrls": [
      "http://192.168.1.100:3000/images/...",
      "http://192.168.1.100:3000/images/...",
      "http://192.168.1.100:3000/images/..."
    ],
    "outfitId": 234,
    "weather": "72°F sunny",
    "score": 0.89
  }
}
```

---

## iPhone Shortcut Setup

### "What should I wear today?"

Create a Shortcut with these steps:

```
1. Action: "Get Contents of URL"
   URL: http://192.168.1.X:3000/api/v1/quick/outfit-today?userId=1
   Method: GET
   Headers: Authorization: Bearer thread_sk_XXXX

2. Action: "Get Dictionary Value"
   Key: outfit.description

3. Action: "Show Notification"
   Body: [result from step 2]
   
4. Optional: Open URL in Safari to see the full outfit visually
   URL: http://192.168.1.X:3000/outfit/[outfit.outfitId]
```

Add to Siri: "What should I wear today?" triggers the shortcut.

---

## Webhooks (Outgoing)

THREAD can also *call* external services when events happen.

Configure webhook endpoints in Settings → Webhooks:

```json
{
  "url": "https://hooks.slack.com/...",
  "events": ["outfit_generated", "ingestion_complete", "refinement_needed"],
  "secret": "your-signing-secret"
}
```

### Events

**`outfit_generated`** — when a new outfit is saved/worn
```json
{
  "event": "outfit_generated",
  "userId": 1,
  "outfitDescription": "Navy blazer, white tee, dark jeans, white sneakers",
  "score": 0.84,
  "timestamp": "2024-06-15T08:30:00Z"
}
```

**`ingestion_complete`** — when a batch analysis finishes
```json
{
  "event": "ingestion_complete",
  "jobId": 45,
  "itemsAdded": 82,
  "flagged": 8,
  "userId": 1
}
```

**`refinement_needed`** — reminds user to review flagged items
```json
{
  "event": "refinement_needed",
  "userId": 1,
  "pendingCount": 12,
  "oldestFlaggedDays": 3
}
```

Webhook payloads are HMAC-SHA256 signed so receiving servers can verify origin.

---

## Home Assistant Integration

Add to your Home Assistant `configuration.yaml`:

```yaml
rest_command:
  thread_get_outfit:
    url: "http://192.168.1.X:3000/api/v1/quick/outfit-today?userId=1"
    method: GET
    headers:
      Authorization: "Bearer thread_sk_XXXX"
    content_type: "application/json"
```

Then create an automation:
```yaml
automation:
  - alias: "Morning Outfit Suggestion"
    trigger:
      - platform: time
        at: "07:30:00"
    action:
      - service: rest_command.thread_get_outfit
      - service: notify.mobile_app_your_phone
        data:
          title: "Today's Outfit"
          message: "{{ states('sensor.thread_outfit_description') }}"
```

---

## Tailscale (Remote Access)

For accessing THREAD when not on home WiFi:

1. Install Tailscale on the server machine and your phone
2. Both join the same Tailnet (free for personal use)
3. Use your machine's Tailscale IP (`100.x.x.x`) as the base URL
4. No port forwarding, no VPN configuration needed
5. Works on cellular data

This keeps everything private — no traffic goes through any external server.
