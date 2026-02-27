# THREAD Pricing Architecture

*Last Updated: 2026-02-25*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

outerfit uses a paid-entry model with no free tier. An introductory rate for the first three months filters for committed users, creates data investment, and converts naturally to the standard monthly rate. The checkout experience is handled by Stripe Checkout — Lago manages the subscription lifecycle behind it.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Pricing Stack                                   │
├─────────────────────────────────────────────────────────────────────┤
│  Pricing page     │  outerfit.net/pricing                           │
│                   │  Custom HTML — matches site aesthetic           │
├─────────────────────────────────────────────────────────────────────┤
│  Checkout         │  Stripe Checkout (hosted by Stripe)             │
│                   │  User clicks plan → redirected to Stripe        │
│                   │  Card never touches outerfit servers            │
├─────────────────────────────────────────────────────────────────────┤
│  Subscription     │  Lago                                           │
│  management       │  Plan lifecycle, invoicing, dunning             │
├─────────────────────────────────────────────────────────────────────┤
│  Payment          │  Stripe                                         │
│  processing       │  Card processing, Apple Pay, Google Pay         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pricing Tiers

### Tier Structure

| Tier | Intro (3 mo) | Monthly | Annual | Annual/mo equiv |
|------|-------------|---------|--------|-----------------|
| Pro | $6.99/mo | $7.99/mo | $76.99/yr | $6.42/mo |
| Wardrobe+ | $14.99/mo | $19.99/mo | $191.99/yr | $16.00/mo |

**No free tier.** The intro rate is the entry point.

### Pro — $6.99 intro → $7.99/mo

The core product. Everything a solo user needs to get dressed better every day.

| Feature | Included |
|---------|---------|
| Wardrobe items | Unlimited |
| Daily outfit suggestions | Unlimited |
| Weather-aware suggestions | ✅ |
| Occasion-aware suggestions | ✅ |
| Outfit history | ✅ |
| Feedback learning (TF personal model) | ✅ |
| Wardrobe X-Ray analytics | ✅ |
| Data export | ✅ |
| Priority AI | ✅ |

### Wardrobe+ — $14.99 intro → $19.99/mo

Everything in Pro plus the planning features. Couples, vacations, weekly prep.

| Feature | Included |
|---------|---------|
| Everything in Pro | ✅ |
| Couple coordination (2 wardrobes) | ✅ |
| Weekly outfit planner (7-day forecast) | ✅ |
| Vacation packing planner | ✅ |
| Occasion planning | ✅ |
| Priority AI + ML | ✅ |

### Annual Billing

Annual plans are offered at approximately 20% discount.

| Tier | Monthly equiv | Annual price | Savings |
|------|--------------|-------------|---------|
| Pro Annual | $6.42/mo | $76.99/yr | $18.89 vs monthly |
| Wardrobe+ Annual | $16.00/mo | $191.99/yr | $47.89 vs monthly |

Annual billing is billed upfront in full. No monthly option on annual plans.

---

## The Intro Rate Philosophy

The 3-month introductory rate is not a trial. It is a deliberate pricing mechanism with specific goals:

**Why paid entry (not free):**
- Free tier users don't upload their wardrobe. Paid users do.
- Uploading a wardrobe is 20-30 minutes of work. Payment creates commitment.
- The TF personal model needs feedback to train. Engaged users provide feedback.
- Free users generate support costs with no revenue offset.

**Why $6.99 specifically:**
- Low enough to be impulsive — "whatever, I'll try it"
- High enough to filter out completely uncommitted users
- Creates psychological investment — "I paid for this, I should use it"
- Comparable to a single coffee. Lower than any competitor's paid tier.

**Why 3 months:**
- Month 1: User uploads wardrobe, gets first suggestions
- Month 2: TF model has enough feedback to start personalizing
- Month 3: Suggestions are noticeably better than day one
- By month 3: User has data invested, suggestions are good, $7.99 feels justified

**The data lock-in dynamic:**
After 3 months a user has 50-150 photographed wardrobe items, a trained personal model, and outfit history. That data is genuinely valuable and not trivially recreated elsewhere. This is not predatory — it is the natural consequence of a product that actually works. Reinforce it by being explicit about data portability: "Your data is yours, export it any time." Users who know they can leave are more comfortable staying.

**Never call it a trial:**
Trial implies free or easily refundable. Intro rate implies you are giving them a deal to get started. The framing matters for both perception and churn psychology.

---

## Auto-Conversion: Intro → Monthly

When the 3-month intro period ends, the subscription automatically converts to the standard monthly rate. This must be:

1. **Disclosed clearly** at signup — "First 3 months at $6.99, then $7.99/month"
2. **Reminded** 7 days before conversion — email from noreply@outerfit.net
3. **Handled by Lago** — configure the intro plan with a 3-month duration and auto-upgrade to the standard plan

### Lago Plan Configuration

```javascript
// Intro plan — 3 months, then converts
const introPlan = {
  name: 'Pro Intro',
  code: 'pro_intro',
  interval: 'monthly',
  amount_cents: 699,
  amount_currency: 'USD',
  trial_period: 0,        // not a trial — it's a priced intro
}

// Standard plan
const proPlan = {
  name: 'Pro',
  code: 'pro_monthly',
  interval: 'monthly',
  amount_cents: 799,
  amount_currency: 'USD',
}

// Annual plan
const proAnnual = {
  name: 'Pro Annual',
  code: 'pro_annual',
  interval: 'yearly',
  amount_cents: 7699,
  amount_currency: 'USD',
}
```

### Conversion Email (Day 83 — 7 days before conversion)

```
Subject: Your outerfit rate is changing in 7 days

Hey [name],

Your introductory rate of $6.99/month ends on [DATE].

Starting [DATE], your plan will be $7.99/month — that's
the standard Pro rate, unchanged from what you signed up for.

Nothing you need to do. Your wardrobe, your outfits, and your
personal style model all continue exactly as they are.

Questions? Reply to this email.

— outerfit
```

---

## Checkout Flow

### User Journey

```
User lands on /pricing
        │
        ▼
Selects plan + billing period (monthly or annual)
        │
        ▼
Clicks "Get started"
        │
        ▼
Fastify creates Stripe Checkout session
(pre-populated with plan, price, customer email if known)
        │
        ▼
User redirected to Stripe Checkout
(Stripe-hosted page — outerfit never sees card data)
        │
        ▼
User enters card, Apple Pay, or Google Pay
        │
        ▼
Stripe processes payment
        │
        ├── Success → redirect to outerfit.net/welcome?session_id=xxx
        └── Cancel  → redirect to outerfit.net/pricing
        │
        ▼
Stripe notifies Lago (webhook)
        │
        ▼
Lago creates subscription, notifies outerfit (webhook)
        │
        ▼
outerfit updates entitlements table
        │
        ▼
Welcome email sent via Resend
```

### Stripe Checkout Session Creation

```javascript
// server/routes/billing.js

fastify.post('/api/v1/billing/checkout', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const { plan, interval } = request.body
  // plan: 'pro' | 'wardrobe_plus'
  // interval: 'monthly' | 'annual'

  const priceMap = {
    pro_monthly:           'price_pro_monthly_799',
    pro_monthly_intro:     'price_pro_intro_699',
    pro_annual:            'price_pro_annual_7699',
    wardrobe_plus_monthly: 'price_wp_monthly_1999',
    wardrobe_plus_intro:   'price_wp_intro_1499',
    wardrobe_plus_annual:  'price_wp_annual_19199',
  }

  // New users get intro rate — existing subscribers get standard
  const isNewUser = !request.user.has_ever_subscribed
  const priceKey = isNewUser
    ? `${plan}_monthly_intro`
    : `${plan}_${interval}`

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: request.user.email,
    line_items: [{
      price: priceMap[priceKey],
      quantity: 1,
    }],
    // Intro → auto-convert after 3 billing cycles
    ...(isNewUser && interval === 'monthly' ? {
      subscription_data: {
        metadata: {
          intro_plan: plan,
          convert_to: `${plan}_monthly`,
          user_id: request.user.id,
        }
      }
    } : {}),
    success_url: `${process.env.APP_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/pricing`,
    metadata: {
      user_id: request.user.id,
      plan,
      interval,
    }
  })

  return reply.send({ checkout_url: session.url })
})
```

---

## Pricing Page Architecture

### Page Structure

One page. No subpages. Plan details are visible without clicking away.

```
/pricing
│
├── Hero
│   "Simple pricing. No surprises."
│   Subhead: "Start at $6.99 for your first 3 months."
│   Monthly / Annual toggle
│
├── Plan Cards (side by side on desktop, stacked on mobile)
│   ├── Pro
│   │   Price (toggles with billing period)
│   │   Feature list
│   │   "Get started" → Stripe Checkout
│   │
│   └── Wardrobe+
│       Price (toggles with billing period)
│       Feature list
│       "Get started" → Stripe Checkout
│
├── Intro Rate Explainer
│   "What's the intro rate?"
│   Brief, honest explanation — not buried in fine print
│
├── FAQ
│   Q: What happens after 3 months?
│   Q: Can I switch plans?
│   Q: Can I cancel anytime?
│   Q: What happens to my data if I cancel?
│   Q: Is my wardrobe data private?
│
└── Footer
    Privacy Policy | Terms of Service | hello@outerfit.net
```

### FAQ Copy

**What happens after 3 months?**
Your plan automatically converts to the standard monthly rate — $7.99 for Pro, $19.99 for Wardrobe+. We'll remind you 7 days before it happens. No surprises.

**Can I switch plans?**
Yes, any time. Upgrade, downgrade, or switch to annual billing from your account settings. Changes take effect immediately and we prorate accordingly.

**Can I cancel any time?**
Yes. Cancel from Settings and your access continues until the end of the current billing period. No cancellation fees.

**What happens to my data if I cancel?**
Your wardrobe data is preserved for 90 days after cancellation. You can reactivate any time within that window and pick up exactly where you left off. You can also export everything — photos included — at any time from Settings.

**Is my wardrobe data private?**
Yes. Your wardrobe photos and style data are stored on our servers and never sold or shared. We use them only to power your outfit suggestions. You own your data and can export or delete it at any time.

---

## Plan Switching

Users can upgrade, downgrade, or switch billing period at any time.

| Transition | Behaviour |
|------------|-----------|
| Pro → Wardrobe+ | Immediate, prorated |
| Wardrobe+ → Pro | Takes effect at next billing date |
| Monthly → Annual | Immediate, prorated credit applied |
| Annual → Monthly | Takes effect at annual renewal date |
| Any → Cancel | Access until period end, data kept 90 days |

All plan changes are handled through the Lago customer portal:

```javascript
// server/routes/billing.js
fastify.get('/api/v1/billing/portal', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const portalUrl = await lagoService.getCustomerPortalUrl(request.user.id)
  return reply.send({ portal_url: portalUrl })
})
```

---

## Lago Plan Setup Checklist

Before launching pricing, configure these plans in Lago:

```
□ pro_intro          — $6.99/mo, 3-month duration, converts to pro_monthly
□ pro_monthly        — $7.99/mo, recurring
□ pro_annual         — $76.99/yr, recurring
□ wardrobe_plus_intro — $14.99/mo, 3-month duration, converts to wardrobe_plus_monthly
□ wardrobe_plus_monthly — $19.99/mo, recurring
□ wardrobe_plus_annual  — $191.99/yr, recurring
```

And in Stripe, create corresponding prices for each:

```
□ price_pro_intro_699
□ price_pro_monthly_799
□ price_pro_annual_7699
□ price_wp_intro_1499
□ price_wp_monthly_1999
□ price_wp_annual_19199
```

---

## Entitlements Mapping

Update `EntitlementService.js` PLAN_LIMITS to reflect the simplified two-tier structure:

```javascript
const PLAN_LIMITS = {
  pro_intro: {
    items_limit:       Infinity,
    outfits_per_day:   Infinity,
    ai_tier:           'priority',
    couple:            false,
    weekly_planner:    false,
    vacation_planner:  false,
  },
  pro_monthly: {
    items_limit:       Infinity,
    outfits_per_day:   Infinity,
    ai_tier:           'priority',
    couple:            false,
    weekly_planner:    false,
    vacation_planner:  false,
  },
  pro_annual: {
    // Same as pro_monthly
  },
  wardrobe_plus_intro: {
    items_limit:       Infinity,
    outfits_per_day:   Infinity,
    ai_tier:           'priority_ml',
    couple:            true,
    weekly_planner:    true,
    vacation_planner:  true,
  },
  wardrobe_plus_monthly: {
    // Same as wardrobe_plus_intro
  },
  wardrobe_plus_annual: {
    // Same as wardrobe_plus_intro
  },
}
```

---

## New Environment Variables

```bash
# Stripe price IDs
STRIPE_PRICE_PRO_INTRO=price_pro_intro_699
STRIPE_PRICE_PRO_MONTHLY=price_pro_monthly_799
STRIPE_PRICE_PRO_ANNUAL=price_pro_annual_7699
STRIPE_PRICE_WP_INTRO=price_wp_intro_1499
STRIPE_PRICE_WP_MONTHLY=price_wp_monthly_1999
STRIPE_PRICE_WP_ANNUAL=price_wp_annual_19199

# URLs
PRICING_URL=https://outerfit.net/pricing
```

---

## New Files

```
server/
└── routes/
    └── billing.js       # + checkout session creation (updated)

client/src/
└── pages/
    └── PricingPage.jsx  # Pricing page UI
```

---

## Key Design Decisions

**Stripe Checkout over custom UI.** Zero card data risk, Apple Pay and Google Pay included automatically, Stripe handles 3D Secure and SCA for international cards. Replace with embedded Stripe Elements only if there's a compelling UX reason — not before.

**Two tiers only.** The original five-tier structure (Peek, Starter, Pro, Couple, Wardrobe+) created too many decisions. Two tiers — Pro and Wardrobe+ — with clear separation makes the choice obvious. Couple coordination and vacation planning are the Wardrobe+ differentiators.

**Annual billing at 20% discount.** Standard SaaS practice. Annual users churn at roughly half the rate of monthly users — the discount pays for itself in retention within 6 months.

**Intro rate, not trial.** A trial implies the product might not be worth paying for. An intro rate implies you are being rewarded for getting started early. The psychological framing is meaningfully different and produces better conversion and retention.
