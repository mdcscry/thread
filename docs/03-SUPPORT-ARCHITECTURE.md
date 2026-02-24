# THREAD Support Architecture

*Last Updated: 2026-02-23*

---

## Overview

THREAD's support stack is intentionally lightweight at launch. The goal is to deflect common questions via self-service docs and handle the rest via email. As user volume grows, the stack upgrades in defined phases.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Has a Problem                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │     Docusaurus Docs      │
                    │   docs.outerfit.net      │
                    │   Self-service first     │
                    └─────────────────────────┘
                                  │
                          Not answered?
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   support@outerfit.net   │
                    │   → Gmail inbox          │
                    │   Target: 24hr response  │
                    └─────────────────────────┘
```

---

## Phase 1 — Launch (0–50 users)

### Self-Service Docs: Docusaurus

Docusaurus is a free, open source static site generator built for documentation. Markdown-based, so your LLM can write and maintain it alongside the codebase.

**Install:**
```bash
cd ~/Documents/outerfit
npx create-docusaurus@latest docs classic
cd docs
npm run build
```

**Deploy via Caddy** alongside the main app:

```
# Caddyfile addition
docs.outerfit.net {
    root * /home/deploy/outerfit/docs/build
    file_server
}
```

**Recommended doc structure:**
```
docs/
├── getting-started/
│   ├── creating-an-account.md
│   ├── uploading-your-wardrobe.md
│   └── your-first-outfit.md
├── features/
│   ├── wardrobe-management.md
│   ├── outfit-suggestions.md
│   ├── weather-integration.md
│   └── feedback-and-learning.md
├── account/
│   ├── billing-and-plans.md
│   ├── cancellation.md
│   └── data-and-privacy.md
└── troubleshooting/
    ├── photo-upload-issues.md
    ├── outfit-not-generating.md
    └── payment-issues.md
```

### Email Support: support@outerfit.net

Set up a dedicated support email address routed through Cloudflare Email Routing to a Gmail inbox.

**Cloudflare Email Routing setup:**
1. Cloudflare Dashboard → outerfit.net → Email → Email Routing
2. Add custom address: `support@outerfit.net`
3. Route to your Gmail address
4. Cloudflare adds the required MX records automatically

**Gmail setup:**
1. Create a filter: `to:support@outerfit.net` → label "THREAD Support"
2. Set up a canned response for common issues (Gmail Settings → Advanced → Templates)
3. Set vacation responder: "Thanks for reaching out — we aim to respond within 24 hours."

**Common canned responses to prepare:**
- Password reset instructions
- How to cancel subscription
- Wardrobe photo upload tips
- Refund policy

### Environment Variables

```bash
# Support
SUPPORT_EMAIL=support@outerfit.net
DOCS_URL=https://docs.outerfit.net
```

### In-App Support Link

Add to your React app's nav/footer:

```jsx
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL
const DOCS_URL = import.meta.env.VITE_DOCS_URL

// Footer or help menu
<a href={DOCS_URL} target="_blank">Help Center</a>
<a href={`mailto:${SUPPORT_EMAIL}`}>Contact Support</a>
```

---

## Phase 2 — Growth (50–500 users)

When email volume makes Gmail unmanageable, migrate to **Crisp**.

### Crisp (Free tier — 2 seats)

Crisp provides a shared inbox, conversation history, basic tagging, and an optional live chat widget. The free tier is sufficient for early growth.

**What you get on free:**
- Shared inbox for `support@outerfit.net`
- Conversation history and search
- 2 agent seats
- Basic canned responses
- Optional live chat widget (can be disabled)
- Crisp MagicBrowse — see what page the user is on when they write in

**Migration steps:**
1. Sign up at crisp.chat
2. Add THREAD as a workspace
3. Forward `support@outerfit.net` to your Crisp inbox
4. Optionally embed the Crisp chat widget in your React app:

```jsx
// client/src/components/SupportWidget.jsx
import { useEffect } from 'react'

export function SupportWidget() {
  useEffect(() => {
    window.$crisp = []
    window.CRISP_WEBSITE_ID = import.meta.env.VITE_CRISP_WEBSITE_ID
    const script = document.createElement('script')
    script.src = 'https://client.crisp.chat/l.js'
    script.async = true
    document.head.appendChild(script)
  }, [])

  return null
}
```

```bash
# Add to .env
VITE_CRISP_WEBSITE_ID=your-crisp-website-id
```

### Docusaurus — Add Search

At this stage add Algolia DocSearch (free for open source / small docs sites):

```bash
# docs/docusaurus.config.js
themeConfig: {
  algolia: {
    appId: '...',
    apiKey: '...',
    indexName: 'thread_docs',
  }
}
```

---

## Phase 3 — Scale (500+ users)

Reassess at this point. Likely candidates:

| Option    | Cost          | Why                                          |
|-----------|---------------|----------------------------------------------|
| Intercom  | ~$74/mo       | Best-in-class, product tours, AI replies     |
| Crisp Pro | ~$25/mo       | Upgrade from free, unlimited seats           |
| Plain     | ~$16/mo       | Developer-focused, API-first, clean UI       |
| Zendesk   | ~$55/mo/agent | Enterprise standard, probably overkill       |

**Plain** is worth watching — it's built for SaaS, has a clean API, and integrates directly with your user data so agents see subscription status and plan alongside every ticket. Relevant for THREAD given the entitlements complexity.

---

## Support Email Templates

### Welcome / Onboarding (send on registration)

```
Subject: Welcome to THREAD 👕

Hi [name],

You're in! Here's how to get started:

1. Upload your first wardrobe items → [link]
2. Let THREAD analyze your style
3. Request your first outfit suggestion

If you get stuck, our help center is at docs.outerfit.net

Questions? Just reply to this email.

— The THREAD Team
```

### Payment Failed (triggered by entitlements webhook)

```
Subject: Action needed — payment issue with your THREAD account

Hi [name],

We had trouble processing your last payment. Your account remains
active for the next 7 days while we retry.

To update your payment method: [billing portal link]

Questions? Reply here and we'll sort it out.

— The THREAD Team
```

---

## Directory Structure

```
docs/                          # Docusaurus root
├── docusaurus.config.js
├── docs/
│   ├── getting-started/
│   ├── features/
│   ├── account/
│   └── troubleshooting/
└── static/

server/
└── services/
    └── EmailService.js        # Transactional emails (welcome, payment failed)
```

---

## Metrics to Watch

Once you have users, track these to know when to upgrade your support stack:

| Metric                  | Upgrade trigger          |
|-------------------------|--------------------------|
| Support emails/week     | > 20 → move to Crisp     |
| Avg response time       | > 48hrs → add tooling    |
| Repeat questions        | > 30% → improve docs     |
| Docs traffic            | Low → add search (Algolia)|
