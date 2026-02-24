# THREAD Legal Architecture

*Last Updated: 2026-02-23*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

Legal requirements for outerfit.net, prioritized by urgency. Nothing here requires a lawyer at launch — but several items require action before taking money from real users. This document tracks what needs to happen, when, and why.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Legal Priority Stack                          │
├─────────────────────────────────────────────────────────────────────┤
│  Before First User   │  Privacy Policy + Terms of Service           │
├─────────────────────────────────────────────────────────────────────┤
│  Before First Dollar │  LLC Formation                               │
├─────────────────────────────────────────────────────────────────────┤
│  Month 1-3           │  GDPR compliance, CCPA notice, cookie policy │
├─────────────────────────────────────────────────────────────────────┤
│  Month 3-6           │  USPTO Trademark filing (outerfit, Class 42) │
├─────────────────────────────────────────────────────────────────────┤
│  Year 1+             │  EUIPO / WIPO if international traction      │
├─────────────────────────────────────────────────────────────────────┤
│  Year 2+             │  Proper legal counsel, contracts, IP audit   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Priority 1 — Before First User

### 🔴 Privacy Policy

You are collecting photos of people's clothing, processing them through Google Gemini (a third-party AI service), storing them on your VPS, and associating them with user accounts. This requires a Privacy Policy before any user creates an account — not as a formality, but as a genuine legal requirement in most jurisdictions.

**What must be covered:**

The policy must disclose what data you collect (email, photos, wardrobe metadata, usage data), how you process it (Gemini API for vision analysis), where you store it (VPS in a specific geography), how long you keep it, and what rights the user has (access, correction, deletion).

The Gemini clause is particularly important. Google's API terms require you to disclose to your users that their data is processed by Google. Your Privacy Policy must include language acknowledging third-party AI processing of uploaded images.

**Recommended tool:** iubenda (~$27/year). Configure for GDPR, CCPA, and standard US privacy law. It generates compliant policy text and updates automatically when laws change.

**Key clauses specific to outerfit:**

```
Data we collect:
- Account information (name, email, password hash)
- Wardrobe photos and associated metadata
- Style preferences and profile information
- Usage data and outfit feedback

Third-party processing:
- Uploaded wardrobe photos are processed by Google Gemini API
  for clothing recognition and attribute extraction. Photos are
  transmitted to Google's servers for this analysis. See Google's
  Privacy Policy at policies.google.com/privacy.

Data retention:
- Wardrobe photos and analysis results are retained for the
  duration of your account plus 30 days after deletion request.
- Backup copies may persist for up to 90 days after deletion.

Your rights:
- Access, correction, and deletion of your data at any time
- Data portability (export your wardrobe data as JSON)
- Withdraw consent (close account) at any time
```

**Where to display:**
- Footer on all pages
- Registration form checkbox (required to create account)
- Checkout flow (Lago/Stripe)

**Status:** ⬜ Not started

---

### 🔴 Terms of Service

Governs the relationship between outerfit and its users. Protects you from liability, sets expectations on acceptable use, and defines subscription terms.

**Minimum required sections:**

**Acceptance of Terms** — users must actively agree (checkbox at registration, not passive browsing).

**Subscription and Billing** — describes the tier system, billing cycle, what happens on failed payment (7-day grace period per architecture), and upgrade/downgrade behavior. Must match your actual Lago/Stripe implementation exactly.

**Refund Policy** — define your position clearly. Recommended: no refunds on monthly subscriptions, pro-rated refunds on annual (if you add annual billing). State this explicitly.

**Acceptable Use** — prohibits uploading images of other people without consent, scraping, reverse engineering, using the service for commercial styling businesses without a commercial license.

**Limitation of Liability** — caps your liability to the amount the user paid in the last 12 months. Standard SaaS clause. Essential.

**AI Disclaimer** — acknowledge that outfit suggestions are AI-generated, not professional styling advice, and that results may vary. This is your defense against "the AI told me to wear this to my job interview and I got fired."

**Termination** — your right to terminate accounts for ToS violations, and the user's right to cancel at any time.

**Governing Law** — specify your state. Colorado for you.

**Recommended tool:** Termly (free tier) or iubenda (same subscription as Privacy Policy). For $500, a startup lawyer will write bespoke ToS that is worth it before you hit 1,000 users.

**Status:** ⬜ Not started

---

### 🔴 Cookie Policy

Required for EU users under GDPR. Required for California users under CCPA if you use analytics cookies. Since you're running PostHog and potentially Crisp, you have cookies.

iubenda generates this alongside the Privacy Policy. Add a cookie consent banner to the React app:

```jsx
// client/src/components/CookieConsent.jsx
// Use: react-cookie-consent package
import CookieConsent from "react-cookie-consent"

export function CookieBanner() {
  return (
    <CookieConsent
      location="bottom"
      buttonText="Accept"
      declineButtonText="Decline"
      enableDeclineButton
      onAccept={() => {
        // Initialize PostHog / analytics only after consent
        initAnalytics()
      }}
      style={{ background: "#1A1A2E" }}
    >
      outerfit uses cookies to improve your experience and analyze usage.
      See our <a href="/privacy">Privacy Policy</a>.
    </CookieConsent>
  )
}
```

**Status:** ⬜ Not started

---

## Priority 2 — Before First Dollar

### 🔴 LLC Formation

Before taking real money from real users, separate your personal assets from the business. An LLC means that if outerfit is ever sued, your personal bank account, house, and possessions are not on the table — only business assets are.

**Recommended state:** Your home state (Colorado) is fine at this scale. Delaware is popular for venture-backed companies planning to raise — not relevant yet. Wyoming has lower fees if you want to minimize annual costs.

**Colorado LLC:**
- File Articles of Organization at sos.colorado.gov
- Cost: $50 filing fee
- Time: Same day online
- Annual report: $10/year

**What you get:**
- Personal liability protection
- Business bank account eligibility
- Business credit card eligibility
- Cleaner tax situation (pass-through taxation by default)
- Professional appearance to payment processors and partners

**After forming the LLC:**
- Open a dedicated business checking account
- Route all Stripe/Lago revenue to the business account
- Pay yourself from the business account
- Keep business and personal finances completely separate

**Name options:**
- Outerfit LLC
- Outerfit Inc (requires incorporation, not LLC — more complex, do later)
- [Your Name] Ventures LLC (if you want flexibility for multiple projects)

**Status:** ⬜ Not started

---

## Priority 3 — Month 1-3

### 🟡 GDPR Compliance

If any of your users are in the European Union — and they will be, because the internet — you are subject to GDPR regardless of where you are based. The key requirements:

**Lawful basis for processing:** For a subscription service, "contractual necessity" covers most data processing. You process their photos because that is the service they paid for. Document this basis in your Privacy Policy.

**Right to erasure:** A user must be able to delete their account and all associated data. Add this endpoint:

```javascript
// server/routes/users.js
fastify.delete('/api/v1/users/:id', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const userId = request.user.id

  // Delete in order of foreign key dependencies
  db.run('DELETE FROM billing_events WHERE user_id = ?', [userId])
  db.run('DELETE FROM ai_usage WHERE user_id = ?', [userId])
  db.run('DELETE FROM item_feedback WHERE user_id = ?', [userId])
  db.run('DELETE FROM outfit_items WHERE outfit_id IN (SELECT id FROM outfits WHERE user_id = ?)', [userId])
  db.run('DELETE FROM outfits WHERE user_id = ?', [userId])
  db.run('DELETE FROM weekly_plans WHERE user_id = ?', [userId])
  db.run('DELETE FROM entitlements WHERE user_id = ?', [userId])
  db.run('DELETE FROM feature_requests WHERE user_id = ?', [userId])
  db.run('DELETE FROM items WHERE user_id = ?', [userId])
  db.run('DELETE FROM users WHERE id = ?', [userId])

  // Delete image files from filesystem
  await deleteUserImages(userId)

  // Cancel subscription in Lago
  await lagoService.cancelSubscription(userId)

  return reply.send({ deleted: true })
})
```

**Data portability:** Users have the right to export their data. Add a JSON export endpoint:

```javascript
fastify.get('/api/v1/users/:id/export', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const userId = request.user.id
  const items = db.exec('SELECT * FROM items WHERE user_id = ?', [userId])
  const outfits = db.exec('SELECT * FROM outfits WHERE user_id = ?', [userId])
  const feedback = db.exec('SELECT * FROM item_feedback WHERE user_id = ?', [userId])

  return reply.send({
    exported_at: new Date().toISOString(),
    items, outfits, feedback
  })
})
```

**Data Processing Agreement (DPA) with Google:** If you have EU users and process their data through Gemini, you technically need a DPA with Google. Google's standard API terms include a DPA for EU users — verify this is in place and document it.

**Status:** ⬜ Not started

---

### 🟡 CCPA Notice (California)

If you have California users, the California Consumer Privacy Act requires you to disclose what personal information you collect and give users the right to opt out of "sale" of their data (you don't sell data, but you must say so). This is covered by the iubenda Privacy Policy if configured correctly.

Add to your Privacy Policy: "We do not sell your personal information to third parties."

**Status:** ⬜ Not started — covered by iubenda if configured correctly

---

## Priority 4 — Month 3-6

### 🟡 USPTO Trademark — "outerfit" (Class 42)

Once you have validated the product works and you are committed to the name, file a trademark application. This is not urgent at launch but becomes important as you scale — it is significantly harder and more expensive to defend a name you didn't trademark than to register one early.

**Why "outerfit" is trademarkable:**
It is a coined compound word — not a common English word, not purely descriptive of the service. "Outerfit" suggests outer clothing and outfit simultaneously. This distinctiveness makes it more likely to be approved than a generic term like "wardrobe" or "stylist."

**Preliminary search — do this now:**
Go to tmsearch.uspto.gov and search for "outerfit" in International Class 42 (Software as a Service, computer services). If nothing comes up, you're clear to file. This takes 5 minutes and costs nothing.

**Filing:**
- File via USPTO TEAS Plus system at USPTO.gov
- Class 42: Computer services, namely providing temporary use of non-downloadable software for wardrobe management and AI-powered outfit recommendations
- Filing fee: $250 per class (TEAS Plus)
- Processing time: 8-12 months
- Protection backdated to filing date

**DIY vs. Lawyer:**
At this stage, DIY is reasonable for a straightforward application. If the examiner issues an Office Action (a challenge or question), that is when a trademark attorney (~$300/hour) becomes valuable. Budget $500-800 for the filing + one round of Office Action response if needed.

**Note on "THREAD":**
Your internal codename THREAD almost certainly conflicts with Meta's Threads. Do not attempt to trademark THREAD in any class related to social media, fashion, or software. Outerfit is your brand. THREAD is your dev codename. Keep them separate.

**Status:** ⬜ Not started — do trademark search immediately

---

## Priority 5 — Year 1+

### 🟢 International Trademark

If outerfit gains meaningful traction in the EU, UK, Canada, or Australia, consider filing in those jurisdictions. The Madrid Protocol allows a single international application to cover 130 countries, administered through WIPO.

- EUIPO (European Union): ~€850 for one class
- WIPO Madrid Protocol: Varies by countries designated
- UK IPO (post-Brexit, separate from EU): ~£170

**Do not file internationally until you have evidence of international users willing to pay.** Trademark maintenance is an ongoing cost and early international filing is premature optimization.

**Status:** 🔵 Future consideration

---

### 🟢 Proper Legal Counsel

At meaningful revenue ($100K ARR or before raising money), engage a startup lawyer for a full legal audit. This covers IP ownership, employment agreements if you hire, contractor agreements, and a properly drafted ToS and Privacy Policy.

Recommended: Find a startup-focused firm that works on a flat-fee basis for early-stage companies. Expect $2,000-5,000 for a comprehensive startup legal package.

**Status:** 🔵 Future consideration — trigger at $100K ARR

---

## Trademark Search Checklist

Do this before spending another dollar on marketing or branding:

```
□ Search "outerfit" on USPTO TEAS: tmsearch.uspto.gov
  → Class 42 (Software/SaaS)
  → Class 25 (Clothing — in case anyone registered it for fashion)
  → Class 35 (Retail/advertising services)

□ Search "outerfit" on Google — any existing businesses?

□ Search App Store and Google Play for "outerfit"

□ Check outerfit.com, outerfit.io, outerfit.app availability
  (even if you don't buy them — know if someone else has them)

□ Search social handles: @outerfit on Instagram, TikTok, X
  (register these even if you don't use them yet)
```

---

## Legal Document Checklist

| Document | Required By | Tool | Status |
|----------|-------------|------|--------|
| Privacy Policy | Before first user | iubenda | ⬜ |
| Terms of Service | Before first user | iubenda / Termly | ⬜ |
| Cookie Policy | Before first user (EU) | iubenda | ⬜ |
| Cookie Consent Banner | Before first user (EU) | react-cookie-consent | ⬜ |
| LLC Formation | Before first dollar | sos.colorado.gov | ⬜ |
| Business Bank Account | Same day as LLC | Any bank | ⬜ |
| GDPR Delete Endpoint | Before EU users | Custom code | ⬜ |
| GDPR Export Endpoint | Before EU users | Custom code | ⬜ |
| USPTO Trademark | Month 3-6 | USPTO TEAS | ⬜ |
| Social Handle Reservation | Now | Manual | ⬜ |

---

## Ongoing Compliance

Once live, these are recurring obligations:

| Task | Frequency | Notes |
|------|-----------|-------|
| Colorado LLC Annual Report | Annual ($10) | Due by end of registration anniversary month |
| Review Privacy Policy | Annual minimum | Update when adding new data processing or third-party services |
| USPTO Trademark Maintenance | Years 5-6, then 9-10 | Declaration of use + renewal fees |
| Review ToS | Annual minimum | Update when adding new tiers or features |
| GDPR audit | Annual | Verify deletion and export endpoints still work |

---

## Key Contacts / Resources

| Resource | URL | Purpose |
|----------|-----|---------|
| USPTO TEAS (trademark filing) | tmsearch.uspto.gov | Trademark search and filing |
| Colorado SOS (LLC) | sos.colorado.gov | LLC formation |
| iubenda | iubenda.com | Privacy Policy + ToS generator |
| Termly | termly.io | Alternative ToS/PP generator |
| EUIPO | euipo.europa.eu | EU trademark (future) |
| WIPO Madrid | wipo.int/madrid | International trademark (future) |
| Google API Terms | cloud.google.com/terms | Verify DPA coverage for Gemini |

---

## Trademark Search Results — outerfit (February 2026)

Search was conducted on tmsearch.uspto.gov on 2026-02-23.

**Result:** 1 existing application found.

| Field | Detail |
|-------|--------|
| Wordmark | OUTERFIT |
| Status | LIVE — PENDING |
| Class | 025 (Clothing — tee shirts, henley shirts, hooded sweatshirts) |
| Serial | 98570109 |
| Owner | Outerwear Basics LLC (Delaware) |

**Analysis:**

The existing application is Class 025 — physical clothing. outerfit.net operates in Class 042 — software and SaaS. These are different classes and the USPTO routinely allows the same name to coexist across industries when the goods and services are sufficiently distinct.

The risk is a "likelihood of confusion" argument: a USPTO examiner could potentially cite the Class 025 pending application as a concern given that both touch the fashion space. This is a gray area. The counterargument — that nobody would confuse a t-shirt brand with a wardrobe styling app — is reasonable and defensible.

Critically, the competitor application is **PENDING, not registered**. Pending applications fail regularly. It may never register.

**Decision: Proceed with outerfit as the brand.**

Nothing prevents operating as outerfit.net regardless of this pending application. Trademark registration affects the ability to register — not the ability to use the name. File Class 042 when the budget and user count justify it.

---

## The Realistic Budget

The entire outerfit.net infrastructure, architecture, and legal foundation was designed and documented on a budget of effectively zero. For context:

| Item | Cost | Status |
|------|------|--------|
| Domain (outerfit.net, Cheapnames) | ~$10/yr | ✅ Done |
| Cloudflare free tier | $0 | ✅ Done |
| Cloudflare Turnstile | $0 | ✅ Done |
| Lago Cloud free tier | $0 | ✅ |
| Stripe (pay per transaction) | $0 until revenue | ✅ |
| VPS (DatabaseMart, RTX Pro 4000 Ada) | Already owned | ✅ |
| Gemini API (free tier) | $0 until scale | ✅ |
| iubenda Privacy Policy + ToS | ~$27/yr | ⬜ Before first user |
| Colorado LLC | ~$50 one-time | ⬜ Before first dollar |
| USPTO Trademark Class 042 | $250 one-time | ⬜ At 50 paying users |
| **Total to first paying user** | **~$87** | |
| **Total to trademark protection** | **~$337** | |

By the time the $250 trademark filing matters, 50 paying users at blended $8/month ARPU will have generated $400 in the first month alone. The filing pays for itself immediately.

---

## The One Thing To Do Today

The trademark search is done. The result is acceptable. The name stands.

The one thing to do today is make dinner and ask the GF to try the app. Her verdict is worth more than any legal document in this folder.
