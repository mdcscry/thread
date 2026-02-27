# THREAD PostHog Analytics Architecture

*Last Updated: 2026-02-25*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

PostHog serves as outerfit's single analytics platform — covering both web/marketing analytics (who visits outerfit.net and converts) and product analytics (what users do inside the app). One tool, one SDK, one dashboard, one privacy policy disclosure.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Analytics Coverage                              │
├─────────────────────────────────────────────────────────────────────┤
│  Web analytics    │  outerfit.net traffic, sources, conversion      │
│                   │  Landing page → signup funnel                   │
├─────────────────────────────────────────────────────────────────────┤
│  Product analytics│  In-app behaviour, feature usage, retention     │
│                   │  Outfit acceptance, wardrobe uploads, feedback   │
├─────────────────────────────────────────────────────────────────────┤
│  Session replay   │  Watch real user sessions during beta           │
│                   │  See exactly where users get confused           │
├─────────────────────────────────────────────────────────────────────┤
│  Funnels          │  Full conversion funnel from visit to paying     │
│                   │  user — every drop-off point visible            │
└─────────────────────────────────────────────────────────────────────┘
```

**Why PostHog over Google Analytics:**
- Already in the planned stack — one less vendor
- Privacy-first — cookieless mode available, no cookie banner required for basic usage
- Session replay included — invaluable during beta
- Funnels are first-class — not bolted on
- 1 million events/month free — sufficient for a long time
- Consistent with "you own your data" positioning — PostHog can be self-hosted later
- No Google data sharing — relevant for a product handling personal wardrobe photos

---

## Setup

### 1. Create PostHog Account

```
1. Go to posthog.com
2. Sign up — free, no credit card
3. Create project: outerfit-production
4. Select region: US (or EU if GDPR priority)
5. Copy Project API Key and Host URL
6. Add to Infisical:
   VITE_POSTHOG_KEY=phc_...
   VITE_POSTHOG_HOST=https://us.i.posthog.com
```

### 2. Install SDK

```bash
# In client/ directory
npm install posthog-js

# In server/ directory (for server-side events)
npm install posthog-node
```

### 3. Client Initialisation

```javascript
// client/src/analytics.js
import posthog from 'posthog-js'

export function initAnalytics() {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,

    // Privacy settings
    autocapture: true,           // Captures clicks, inputs, pageviews automatically
    capture_pageview: true,      // Web analytics — page views
    capture_pageleave: true,     // Bounce tracking
    disable_session_recording: false,  // Enable session replay

    // Cookieless mode — no cookie banner needed
    persistence: 'memory',       // Don't persist to localStorage/cookies
    // Note: users won't be tracked across sessions in cookieless mode
    // Switch to 'localStorage' when users are logged in

    // Don't track until consent (for EU users)
    // loaded: (posthog) => { posthog.opt_out_capturing() }
    // Then call posthog.opt_in_capturing() after cookie consent

    // Mask sensitive inputs
    session_recording: {
      maskAllInputs: true,         // Mask all form inputs in recordings
      maskInputFn: (text, element) => {
        // Always mask password and card fields
        if (element?.type === 'password') return '***'
        if (element?.dataset?.sensitive) return '***'
        return text
      }
    }
  })
}

// Identify user after login
export function identifyUser(user) {
  posthog.identify(user.id.toString(), {
    email: user.email,
    name: user.name,
    plan: user.plan,
    created_at: user.created_at,
  })
}

// Reset on logout
export function resetAnalytics() {
  posthog.reset()
}

// Convenience wrapper
export function track(event, properties = {}) {
  posthog.capture(event, properties)
}
```

```jsx
// client/src/main.jsx — initialise on app load
import { initAnalytics } from './analytics'

// Only init after cookie consent (or immediately in cookieless mode)
initAnalytics()
```

### 4. Server-Side Client

```javascript
// server/services/AnalyticsService.js
import { PostHog } from 'posthog-node'

const client = new PostHog(
  process.env.POSTHOG_KEY,
  { host: process.env.POSTHOG_HOST }
)

export class AnalyticsService {
  track(userId, event, properties = {}) {
    client.capture({
      distinctId: userId.toString(),
      event,
      properties,
    })
  }

  // Flush on server shutdown
  async shutdown() {
    await client.shutdown()
  }
}
```

---

## Event Taxonomy

### Naming Convention

```
[noun]_[verb]        e.g. outfit_generated, item_uploaded
[noun]_[adjective]   e.g. suggestion_accepted, suggestion_rejected
[page]_viewed        e.g. pricing_viewed, wardrobe_viewed
```

All events are lowercase with underscores. No spaces, no camelCase.

---

### Web / Marketing Events

Fired on the public-facing pages — landing page, pricing, signup.

```javascript
// Landing page
track('landing_page_viewed', {
  referrer: document.referrer,
  utm_source: params.get('utm_source'),
  utm_medium: params.get('utm_medium'),
  utm_campaign: params.get('utm_campaign'),
})

// Pricing page
track('pricing_viewed')
track('pricing_plan_selected', { plan: 'pro', interval: 'monthly' })
track('pricing_toggle_changed', { interval: 'annual' })

// Signup
track('signup_started', { invite_code_present: !!inviteCode })
track('signup_completed', { plan: 'pro_intro' })
track('signup_failed', { reason: 'invalid_invite_code' })

// Checkout
track('checkout_started', { plan: 'pro_intro', interval: 'monthly' })
track('checkout_completed', { plan: 'pro_intro', value: 6.99 })
track('checkout_abandoned')
```

---

### Auth Events

```javascript
track('user_logged_in')
track('user_logged_out')
track('email_verified')
track('password_reset_requested')
track('password_reset_completed')
track('2fa_enabled')
track('2fa_disabled')
```

---

### Onboarding Events

These are the most important events to get right. They define the activation funnel.

```javascript
track('onboarding_started')
track('onboarding_step_completed', { step: 1, step_name: 'profile' })
track('onboarding_step_completed', { step: 2, step_name: 'wardrobe_upload' })
track('onboarding_step_completed', { step: 3, step_name: 'first_outfit' })
track('onboarding_completed', {
  items_uploaded: 23,
  time_to_complete_minutes: 34,
})
track('onboarding_abandoned', { at_step: 2, items_uploaded: 3 })
```

---

### Wardrobe Events

```javascript
track('item_upload_started')
track('item_upload_completed', {
  category: 'tops',
  primary_color: 'navy',
  ai_confidence: 0.94,
  processing_time_ms: 4200,
})
track('item_upload_failed', { reason: 'image_too_small' })
track('item_deleted', { category: 'tops' })
track('item_marked_loved', { category: 'outerwear' })
track('item_sent_to_laundry')
track('item_sent_to_storage')

// Wardrobe milestones — trigger upgrade nudges
track('wardrobe_milestone_reached', { milestone: 10 })   // 10 items
track('wardrobe_milestone_reached', { milestone: 25 })   // 25 items
track('wardrobe_milestone_reached', { milestone: 50 })   // 50 items
```

---

### Outfit Events

The acceptance rate is the single most important product health metric.

```javascript
track('outfit_requested', {
  occasion: 'everyday',
  weather_condition: 'rainy',
  temperature_f: 48,
  wardrobe_size: 34,
})

track('outfit_generated', {
  occasion: 'everyday',
  item_count: 4,
  generation_time_ms: 2800,
  model_used: 'gemini_flash',
})

track('suggestion_accepted', {
  outfit_id: outfitId,
  occasion: 'everyday',
  items: outfit.items.map(i => i.category),
})

track('suggestion_rejected', {
  outfit_id: outfitId,
  occasion: 'everyday',
})

track('outfit_saved', { outfit_id: outfitId })
track('outfit_deleted', { outfit_id: outfitId })

// Feedback — drives TF model training
track('feedback_submitted', {
  item_id: itemId,
  feedback_value: 0.8,   // 0-1 scale
  context: 'outfit_suggestion',
})
```

---

### Planning Events (Wardrobe+ only)

```javascript
track('weekly_plan_generated', {
  days_planned: 7,
  generation_time_ms: 12400,
})

track('weekly_plan_day_overridden', { day_of_week: 'monday' })

track('vacation_plan_started', {
  destination: 'cancun',    // city only, not full address
  duration_days: 10,
})

track('vacation_plan_generated', {
  destination: 'cancun',
  duration_days: 10,
  items_in_packing_list: 18,
})
```

---

### Billing Events

```javascript
track('subscription_started', {
  plan: 'pro_intro',
  interval: 'monthly',
  value: 6.99,
})

track('subscription_converted', {
  from_plan: 'pro_intro',
  to_plan: 'pro_monthly',
  value: 7.99,
})

track('subscription_upgraded', {
  from_plan: 'pro_monthly',
  to_plan: 'wardrobe_plus_monthly',
  value: 19.99,
})

track('subscription_downgraded', {
  from_plan: 'wardrobe_plus_monthly',
  to_plan: 'pro_monthly',
})

track('subscription_cancelled', {
  plan: 'pro_monthly',
  reason: user_provided_reason,
  months_active: 4,
})

track('subscription_reactivated', {
  plan: 'pro_monthly',
  months_dormant: 2,
})
```

---

### Insights / Analytics Events

```javascript
track('wardrobe_xray_viewed')
track('insights_tab_viewed')
track('benchmark_comparison_viewed')
track('cost_per_wear_viewed')
```

---

### Export / Data Events

```javascript
track('export_requested')
track('export_downloaded')
track('import_started', { estimated_items: 45 })
track('import_completed', { items_restored: 43 })
track('gdpr_erasure_requested')
track('account_deleted')
```

---

### Feature Request Events

```javascript
track('feature_request_submitted', {
  wish: request.body.wish,   // capture the actual text
  plan: user.plan,
  wardrobe_size: itemCount,
})
```

---

## The Conversion Funnel

Define this funnel in PostHog immediately. It is the single most important view for understanding whether the product is working.

```
Funnel: outerfit Activation

Step 1:  landing_page_viewed
Step 2:  signup_started
Step 3:  signup_completed
Step 4:  email_verified
Step 5:  onboarding_step_completed { step: 2 }   — first item uploaded
Step 6:  outfit_generated
Step 7:  suggestion_accepted                      — first positive signal
Step 8:  subscription_started                     — paying user
```

**What to watch:**

| Drop-off point | What it means | What to do |
|----------------|--------------|------------|
| Step 1→2 | Landing page not converting | Test headline, CTA copy |
| Step 2→3 | Signup friction | Check invite code flow, form errors |
| Step 3→4 | Verification email not arriving | Check Resend, spam folders |
| Step 4→5 | Users not uploading wardrobe | Improve onboarding UX, upload nudge |
| Step 5→6 | Users not requesting outfits | Check outfit generation UX |
| Step 6→7 | Suggestions not good enough | AI quality issue — top priority |
| Step 7→8 | Good suggestions but not paying | Pricing or trust issue |

---

## Session Replay Configuration

Session replay is enabled during beta specifically to watch what users do when they get confused. It is the highest-value tool during the first 90 days.

**What to watch for:**
- Rage clicks (clicking something repeatedly that doesn't respond)
- Dead clicks (clicking non-interactive elements)
- U-turn behaviour (navigating to a page then immediately leaving)
- Where users stop during wardrobe upload
- What happens after a rejected outfit suggestion

**Privacy rules for session replay:**
- All form inputs are masked by default (configured above)
- Password fields always masked
- Card fields never visible (Stripe Checkout is external anyway)
- Consider masking wardrobe photo uploads — configure in PostHog session recording settings

```javascript
// PostHog session replay — mask image uploads
session_recording: {
  maskAllInputs: true,
  blockSelector: '.wardrobe-photo, .preview-image',  // Block wardrobe photos from recording
}
```

---

## Web Analytics Configuration

PostHog's web analytics mode gives you the marketing overview — traffic sources, top pages, conversion rates — without Google.

```javascript
// Enable in PostHog dashboard:
// Project Settings → Web Analytics → Enable

// Automatic with autocapture: true — no additional code needed
// PostHog captures:
// - Page views
// - UTM parameters (utm_source, utm_medium, utm_campaign)
// - Referrer
// - Device type, browser, OS
// - Geographic region (country level only by default)
// - Session duration
// - Bounce rate
```

**Key web analytics dashboards to create:**

```
1. Traffic Overview
   - Unique visitors (daily/weekly/monthly)
   - Top referrers
   - UTM campaign performance
   - Device breakdown (critical — expect heavy mobile)

2. Conversion Overview
   - Landing page → signup rate
   - Pricing page → checkout rate
   - Checkout → paid conversion rate

3. Content Performance
   - Top pages by session duration
   - Pricing page engagement (scroll depth, plan hover)
```

---

## PostHog Dashboard Setup

Create these dashboards on day one:

### Dashboard 1 — Beta Health

```
Widgets:
- DAU / WAU / MAU (last 30 days)
- Onboarding funnel completion rate
- Outfit acceptance rate (7-day rolling)
- Items uploaded (cumulative)
- Feature requests submitted (table)
```

### Dashboard 2 — Conversion

```
Widgets:
- Full activation funnel (8 steps above)
- Signup → first outfit time (median hours)
- Intro → paid conversion rate
- Churn signals this week
```

### Dashboard 3 — Web Analytics

```
Widgets:
- Unique visitors (daily)
- Top traffic sources
- Landing page bounce rate
- Pricing page → checkout rate
```

---

## User Identification Strategy

PostHog works best when anonymous pre-signup activity is linked to identified post-signup activity. This requires careful handling of the `distinctId`.

```javascript
// Before signup — PostHog auto-assigns anonymous ID
// After signup — identify with user ID and link anonymous activity

// In signup completion handler:
posthog.identify(
  user.id.toString(),           // Use numeric ID as distinct ID
  {
    email: user.email,
    name: user.name,
    plan: 'pro_intro',
    created_at: user.created_at,
    invite_wave: user.invite_wave,
  }
)

// This merges the anonymous pre-signup session with the identified user
// You can now see what landing page they came from, how long they browsed, etc.
```

---

## Privacy & GDPR Compliance

PostHog in cookieless mode (`persistence: 'memory'`) does not set cookies and does not require a cookie banner under GDPR for basic analytics.

**What this means in practice:**
- No cookie consent banner needed for PostHog web analytics
- Users are not tracked across sessions (each page load is a new anonymous user)
- Once logged in, server-side events are tied to user ID (not browser cookies)
- Session replay is covered in the Privacy Policy

**Add to Privacy Policy:**

```
Analytics:
We use PostHog to understand how people use outerfit. PostHog
operates in cookieless mode — it does not set tracking cookies
or track you across sessions before you create an account.
After login, we use your account ID to associate usage data
with your account for product improvement purposes.

Session recordings:
We may record anonymised session replays to understand usability
issues. Form inputs, passwords, and wardrobe photos are masked
and never visible in recordings. You can opt out of session
recording in Account Settings.
```

---

## Environment Variables

```bash
# Client (Vite)
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com

# Server
POSTHOG_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com
```

Add both to Infisical under the `production` environment.

---

## New Files

```
client/src/
├── analytics.js              # PostHog init, identify, track wrappers
└── components/
    └── Analytics.jsx         # Provider component — wraps app

server/
└── services/
    └── AnalyticsService.js   # Server-side PostHog client
```

---

## Implementation Priority

Not all events need to be implemented on day one. Ship in this order:

**Week 1 — Before beta launch:**
```
□ PostHog initialised in React app
□ Page views working (autocapture)
□ identifyUser() called after login
□ Activation funnel events (steps 1-8)
□ outfit_generated, suggestion_accepted, suggestion_rejected
□ Session replay enabled
```

**Week 2-3 — During beta:**
```
□ Wardrobe upload events
□ Onboarding step events
□ Billing events (wired to Lago webhooks)
□ Feature request events
□ Conversion funnel dashboard live
```

**Month 2+ — Ongoing:**
```
□ Planning events (weekly planner, vacation)
□ Insights page events
□ Export/import events
□ Web analytics dashboards
□ UTM tracking for any marketing
```

---

## The One Metric

If you could only watch one number during beta it is the **outfit suggestion acceptance rate** — the percentage of generated outfits where the user accepts rather than rejects.

```
acceptance_rate = suggestion_accepted / (suggestion_accepted + suggestion_rejected)
```

Target: > 40% before public launch.

Below 30% means the AI quality needs work before marketing spend makes any sense. Above 50% means you have a product that genuinely works and word of mouth will do the job.

Everything else is context. This number is the truth.
