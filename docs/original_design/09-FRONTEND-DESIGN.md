# 09 — Frontend Design System

## Visual Identity

THREAD should feel like a premium fashion editorial app — not a database browser. Clothing images are the hero. Everything else serves them.

---

## Color System

```css
/* Base palette */
--color-bg:          #0f0f1a;   /* Deep midnight — main background */
--color-surface:     #1a1a2e;   /* Card surfaces */
--color-surface-2:   #252540;   /* Elevated cards, hover states */
--color-border:      #2e2e50;   /* Subtle borders */

/* Text */
--color-text:        #f0f0f5;   /* Primary text */
--color-text-muted:  #8888aa;   /* Secondary, metadata */
--color-text-dim:    #555577;   /* Placeholder, disabled */

/* Accent — warm gold */
--color-accent:      #c9a84c;   /* Hearts, CTAs, highlights */
--color-accent-soft: #c9a84c22; /* Accent background tint */

/* Semantic */
--color-success:     #4caf7d;   /* Thumbs up, loved */
--color-warning:     #e8a838;   /* Flagged items */
--color-error:       #e05252;   /* Errors */
--color-info:        #5299e0;   /* Info, ML score */
```

---

## Seasonal Themes

Applied as a body class (`data-season`, `data-time`) that cascades through gradient overlays:

```javascript
const SEASONAL_THEMES = {
  'summer-morning':  { gradient: 'from-amber-100/10 to-orange-50/5',  mood: 'bright, airy' },
  'summer-evening':  { gradient: 'from-rose-900/20 to-orange-800/10', mood: 'golden hour' },
  'fall-day':        { gradient: 'from-orange-900/15 to-amber-900/10',mood: 'warm, rich' },
  'fall-evening':    { gradient: 'from-stone-900/20 to-zinc-800/10',  mood: 'moody' },
  'winter-day':      { gradient: 'from-slate-800/15 to-blue-900/10',  mood: 'crisp, cool' },
  'winter-evening':  { gradient: 'from-indigo-950/20 to-slate-900/15',mood: 'dramatic' },
  'spring-morning':  { gradient: 'from-emerald-900/10 to-teal-800/5', mood: 'fresh' },
  'spring-day':      { gradient: 'from-sky-900/10 to-emerald-900/5',  mood: 'light, optimistic' },
  'rainy-any':       { gradient: 'from-zinc-800/20 to-slate-900/15',  mood: 'moody, soft' },
}
```

The outfit card background subtly shifts to match. A rainy afternoon feels different from a sunny summer morning.

---

## Typography

```css
/* Headlines */
font-family: 'Playfair Display', Georgia, serif;  /* Elegant editorial */
font-weight: 400, 700;

/* Body / UI */
font-family: 'Inter', system-ui, sans-serif;  /* Clean, readable */
font-weight: 300, 400, 500, 600;

/* Load via Google Fonts (local CDN fallback included) */
```

---

## Component Specifications

### OutfitCard

The primary display component. Shows all items in an outfit in a beautiful layout.

**2 items (dress + shoes):**
```
┌──────────────────────────────────────┐
│  ┌───────────────┐  ┌─────────────┐  │
│  │               │  │             │  │
│  │  DRESS        │  │  SHOES      │  │
│  │  (60% width)  │  │  (35% width)│  │
│  │               │  │             │  │
│  └───────────────┘  └─────────────┘  │
└──────────────────────────────────────┘
```

**3 items (top + bottom + shoes):**
```
┌──────────────────────────────────────┐
│  ┌──────────┐ ┌──────────┐ ┌───────┐ │
│  │          │ │          │ │       │ │
│  │  TOP     │ │  BOTTOM  │ │ SHOES │ │
│  │          │ │          │ │       │ │
│  └──────────┘ └──────────┘ └───────┘ │
└──────────────────────────────────────┘
```

**4-5 items (full outfit with accessories):**
```
┌──────────────────────────────────────────┐
│  ┌──────────────────┐  ┌───────┐ ┌─────┐ │
│  │                  │  │       │ │     │ │
│  │  TOP (featured)  │  │ SHOES │ │ BAG │ │
│  │                  │  │       │ └─────┘ │
│  └──────────────────┘  └───────┘         │
│  ┌──────────────────────────────────┐    │
│  │  BOTTOM (full width strip)       │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

Images use `object-fit: cover` with smart cropping (top-center for tops, center for bottoms).

### ItemThumbnail

Used in grids throughout the app:

```
┌─────────────┐
│             │
│   [IMAGE]   │  Aspect ratio: 3:4 (portrait, like clothing photography)
│             │
│  ❤️  (fav) │  Bottom-right overlay, tap to toggle
│  ⚑ (flag)  │  Top-right overlay if ai_flagged
│  ────────── │
│  Blue dress │  Name, truncated to 1 line
│  Silk · S   │  Material + size (muted)
└─────────────┘
```

### SwipeStack (Mobile Outfit Browser)

```javascript
// Framer Motion swipe gesture
const swipeThreshold = 80  // px

<motion.div
  drag="x"
  dragConstraints={{ left: 0, right: 0 }}
  onDragEnd={(event, { offset, velocity }) => {
    const swipe = Math.abs(offset.x) * velocity.x
    if (swipe < -swipeThreshold * 500) {
      handleDislike()  // Swipe left = thumbs down
    } else if (swipe > swipeThreshold * 500) {
      handleLike()     // Swipe right = thumbs up
    }
  }}
  animate={{ x: 0, opacity: 1 }}
  exit={{ x: exitX, opacity: 0 }}
>
  <OutfitCard outfit={currentOutfit} />
</motion.div>
```

Color overlay appears during drag: green tint for right, red for left.

### ChatInput

Conversational input with outfit context:

```
┌──────────────────────────────────────────────┐
│  Something cute for brunch with my girls...  │
│                                    [Send ✦]  │
│                                              │
│  💡 Try: "Dinner date, 60s vibe"             │
│  💡 Try: "Work meeting but make it fashion"  │
└──────────────────────────────────────────────┘
```

Suggestion chips rotate randomly. Input auto-resizes. On submit → loading skeleton while AI parses → outfit results animate in.

---

## Animations

| Interaction | Animation |
|---|---|
| Page transition | Fade + 4px vertical slide, 200ms |
| Outfit card appear | Scale 0.95→1 + fade, 300ms, ease-out |
| Swipe dismiss | Spring physics, rotates slightly |
| Heart toggle | Scale bounce 1→1.3→1, 300ms |
| Thumbnail hover | Scale 1.02, shadow deepens |
| Analysis progress | Thumbnails fade in as they're processed |
| ML score | Animated progress bar fill |
| Chat response | Typing indicator → content reveal |

All via Framer Motion. No CSS animations for interactive elements.

---

## Loading States

Every async action has a skeleton state. No spinners alone.

**Outfit loading skeleton:**
```
┌──────────────┐ ┌──────────────┐ ┌──────────┐
│ ░░░░░░░░░░░  │ │ ░░░░░░░░░░░  │ │ ░░░░░░░  │
│ ░░░░░░░░░░░  │ │ ░░░░░░░░░░░  │ │ ░░░░░░░  │
│ ░░░░░░░░░░░  │ │ ░░░░░░░░░░░  │ │ ░░░░░░░  │
└──────────────┘ └──────────────┘ └──────────┘
```

Skeletons use a shimmer animation (linear-gradient sweep).

---

## Notifications

Toast notifications (bottom of screen, mobile-friendly):

```
╔════════════════════════════════╗
║ ✅ Outfit saved to your history  ║
╚════════════════════════════════╝

╔════════════════════════════════╗
║ 🧠 Style intelligence improving  ║
║    23 ratings → 50% maturity    ║
╚════════════════════════════════╝
```

Auto-dismiss after 3 seconds. Stack if multiple. Slide in from bottom on mobile, top-right on desktop.

---

## Iconography

Use Lucide React icons throughout. Key icons:

```
Wardrobe:   Shirt, Package, Grid3x3
Outfit:     Sparkles, Wand2
Loved:      Heart, HeartFilled
Flagged:    Flag, AlertCircle
Weather:    Sun, Cloud, CloudRain, Snowflake, Wind
Season:     Leaf (fall), Flower (spring), Thermometer
Trip:       Plane, MapPin, Calendar, Luggage
ML:         Brain, TrendingUp, BarChart
Settings:   Settings, Key, Webhook, QrCode
User:       User, Users
```
