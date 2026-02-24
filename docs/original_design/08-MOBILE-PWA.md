# 08 — Mobile & PWA

## The Phone Experience

THREAD is designed to be used from a phone as naturally as from a desktop. Since everything runs on your local network, the phone just connects to your computer's IP over WiFi.

---

## Progressive Web App (PWA)

THREAD ships as a PWA — it can be "installed" to your phone's home screen and behaves like a native app. No App Store. No Google Play. Just:

1. Open `http://192.168.1.X:3000` on your phone's browser
2. Tap "Add to Home Screen" (Safari on iOS, Chrome on Android)
3. It appears as an app icon and opens full-screen

### PWA Features Enabled

- **Installable** on iOS and Android home screen
- **Offline shell** — the app UI loads even when server is temporarily unreachable
- **Responsive design** — single codebase, adapts from 375px to 4K
- **Touch gestures** — swipe left/right through outfits, swipe up for details
- **Native share** — share an outfit via iOS/Android share sheet
- **Push notifications** — (via local service worker) for refinement reminders

### vite.config.js PWA setup

```javascript
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'THREAD — Your AI Stylist',
    short_name: 'THREAD',
    description: 'Local AI wardrobe and outfit planner',
    theme_color: '#1a1a2e',
    background_color: '#0f0f1a',
    display: 'standalone',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }
})
```

---

## Mobile UI Design

### Navigation

Bottom tab bar on mobile (replaces sidebar on desktop):

```
┌─────────────────────────────────────────┐
│              Content Area               │
│                                         │
│                                         │
│                                         │
├────────┬────────┬────────┬──────────────┤
│  👗    │  ✨    │  ✈️    │  ⚙️          │
│Wardrobe│ Outfit │ Trips  │ Settings     │
└────────┴────────┴────────┴──────────────┘
```

### Swipe to Browse Outfits

On mobile, outfits are presented as a swipeable card stack (like a fashion Tinder):

```
         ┌──────────────────┐
         │                  │
         │   [Outfit Photo] │ ← Swipe right = 👍
         │   Full-screen    │   Swipe left = 👎
         │   layout         │   Tap = Details
         │                  │
         │  "Navy blazer,   │
         │   white tee,     │
         │   dark jeans"    │
         │                  │
         │  🌡️ 58°F ✓       │
         │  ⭐ 87% match    │
         └──────────────────┘
            ← 👎        👍 →
```

Swiping automatically records feedback to the ML model.

### Photo Grid (Catalog)

```
┌────────────────────────────────┐
│  👗 Your Wardrobe (182)        │
│  [Search...] [Filter ▾]       │
│                                │
│  ┌──────┐ ┌──────┐ ┌──────┐  │
│  │      │ │      │ │      │  │
│  │      │ │  ❤️  │ │      │  │
│  └──────┘ └──────┘ └──────┘  │
│  ┌──────┐ ┌──────┐ ┌──────┐  │
│  │      │ │      │ │  ⚑   │  │
│  │      │ │      │ │      │  │
│  └──────┘ └──────┘ └──────┘  │
│                                │
│  [Category chips scrollable]   │
│  All Tops Bottoms Dresses ...  │
└────────────────────────────────┘
```

Heart fills on tap to toggle loved. Flag icon indicates needs review.

---

## QR Code for Phone Access

The Settings page shows a QR code that, when scanned with a phone camera, opens THREAD directly. No typing the IP address.

```javascript
// Generate QR code for current machine's local IP
import QRCode from 'qrcode'

const localIp = getLocalNetworkIP()  // e.g., 192.168.1.42
const qrDataUrl = await QRCode.toDataURL(`http://${localIp}:3000`)
```

---

## Responsive Breakpoints

```
Mobile:   375px - 767px    → Single column, bottom nav, swipe UI
Tablet:   768px - 1023px   → Two column, bottom/side nav hybrid
Desktop:  1024px+          → Multi-column, sidebar nav, full filter panel
```

All using Tailwind responsive prefixes (`sm:`, `md:`, `lg:`).

---

## Mobile Performance Considerations

Since images are served from a local Node.js server, performance is excellent on local WiFi (gigabit LAN = effectively instant). Thumbnails (300px) are used in grids; full images only loaded on demand. Lazy loading with Intersection Observer for all image grids.
