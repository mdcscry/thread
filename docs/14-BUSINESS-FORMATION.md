# THREAD Business Formation & Tax Strategy

*Last Updated: 2026-02-23*
*Product: outerfit.net | Internal codename: THREAD*
*Location: Arvada, Colorado*

---

## Overview

Forming an LLC before taking any revenue accomplishes three things: it separates personal assets from business liability, creates a legal entity that can hold contracts and accounts, and — critically — allows every legitimate business expense to be deducted against your income. In the early phase where expenses exceed revenue, those deductions reduce your personal tax bill.

This is not complicated. It is a $50 filing, a business bank account, and a discipline around keeping receipts.

---

## Step 1 — Form the Colorado LLC

### Name Check

Before filing, verify the name is available in Colorado:

```
1. Go to sos.colorado.gov
2. Click "Business" → "Search Business Database"
3. Search "Outerfit" — check for conflicts
4. Also search your fallback names if Outerfit LLC is taken
```

**Recommended name:** Outerfit LLC

If you want flexibility to run multiple projects under one entity, consider a more generic name like "[Your Name] Technology LLC" or "[Your Name] Ventures LLC". Either works — the business can operate as "outerfit" under a DBA (trade name) regardless of the LLC's legal name.

### Filing

```
URL:    mybizcolorado.gov
Path:   Register a new business → Limited Liability Company → Articles of Organization
Cost:   $50 filing fee (credit card accepted)
Time:   Same day in most cases
Note:   Online only — Colorado does not accept paper filings

Required information:
- LLC name (must include "LLC" or "Limited Liability Company")
- Registered agent (can be yourself at your home address)
- Principal office address (your home address is fine)
- Organizer name and signature (you)
```

### After Filing

```
1. Download and save the stamped Articles of Organization — you'll need this for:
   - Opening a business bank account
   - Future contracts and agreements
   - USPTO trademark application

2. Get an EIN (Employer Identification Number) — free, instant, online
   URL: irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online
   Even as a solo LLC, an EIN lets you open business accounts without
   using your Social Security Number everywhere.

3. File a Beneficial Ownership Report (required since 2024)
   URL: fincen.gov/boi
   One-time filing for new LLCs. Free. Takes 10 minutes.
   Deadline: 90 days after formation for new entities.
```

### Annual Requirements

| Requirement | When | Cost |
|-------------|------|------|
| Colorado Annual Report | Anniversary month each year | $25 |
| Federal income taxes (Schedule C) | April 15 | Accountant fee |
| Quarterly estimated taxes | Apr 15, Jun 15, Sep 15, Jan 15 | Varies |
| Colorado state income taxes | April 15 | Accountant fee |

---

## Step 2 — Open a Business Bank Account

Do this immediately after receiving the Articles of Organization. Every business expense must flow through this account — not your personal account.

**What you need:**
- Articles of Organization (stamped)
- EIN confirmation letter from IRS
- Personal ID
- Initial deposit (most banks require $25-100)

**Recommended options:**

| Bank | Monthly fee | Notes |
|------|-------------|-------|
| Chase Business Complete | $15 (waivable) | Recommended — existing relationship, branch access |
| Mercury | $0 | Good for cold-start founders with no existing bank relationship |
| Relay | $0 | Good for expense tracking, virtual cards |
| Local credit union | Often $0 | Relationship banking for future credit |

**Chase Business Complete Banking is the recommended choice** given an existing Chase relationship. The $15/month fee is waived if you maintain a $2,000 average daily balance or hold a Chase Ink business credit card — both trivially achievable once Stripe payouts are flowing. Walk into your local branch with the Articles of Organization and EIN. Done in 30 minutes with a human who can answer questions.

The existing Chase relationship — including home equity lending history — gives you a credible starting point when you eventually want a business line of credit or higher credit limits. That relationship is worth more than zero fees at a fintech.

### Business Credit Card

Get the **Chase Ink Cash** immediately after opening the business account. No annual fee. 5% cash back on internet, cable, and phone services — which covers your VPS, Cloudflare, domain, and every software subscription. On a $500/month subscription stack that's $25/month back, $300/year, which more than covers the checking account fee.

Run every business subscription through the Ink Cash. Pay it in full monthly from the business checking account. This builds business credit history and creates a clean paper trail.

---

## Step 3 — Bookkeeping

### The Minimum Viable System

At this stage you do not need Quickbooks. You need a spreadsheet and a discipline.

**Free option:** Wave Accounting (wave.com) — connects to your bank account, categorizes transactions, generates a P&L automatically. Free forever for the core features.

**Better option:** Harpoon or Bonsai if you eventually have client invoicing needs. But for a SaaS product Wave is sufficient for years.

### Transaction Categories

Set these up in Wave from day one:

```
Income
  Subscription Revenue — Starter
  Subscription Revenue — Pro
  Subscription Revenue — Couple
  Subscription Revenue — Wardrobe+

Cost of Goods Sold
  Gemini API (vision + inference)
  Stripe / Lago transaction fees

Operating Expenses
  Infrastructure — VPS (DatabaseMart)
  Infrastructure — Cloudflare
  Software — Infisical
  Software — Resend
  Software — Sentry
  Software — iubenda / legal tools
  Software — Development tools
  Domain registration
  Professional services — Accounting
  Professional services — Legal
  Marketing — Content
  Marketing — Advertising (future)
  Education — Books, courses, conferences
  Home office (see below)
```

---

## Deductible Business Expenses — outerfit Specific

Everything here is deductible once the LLC is formed and expenses run through the business account. Keep receipts for everything.

### Direct Business Expenses (100% deductible)

| Expense | Annual estimate | Notes |
|---------|----------------|-------|
| VPS — DatabaseMart RTX Pro 4000 Ada | Existing cost | 100% if used exclusively for business |
| Domain — outerfit.net | ~$10/yr | 100% |
| Cloudflare (paid tier if upgraded) | ~$0-240/yr | 100% |
| Gemini API | Scales with users | 100% |
| Stripe / Lago fees | Scales with revenue | 100% |
| Infisical | $0-free tier | 100% |
| Resend | $0-free tier | 100% |
| Sentry | $0-free tier | 100% |
| iubenda / legal docs | ~$27/yr | 100% |
| USPTO trademark filing | $250 | 100% — Section 179 |
| Colorado LLC formation | $50 | 100% — startup cost |
| Accounting fees | ~$200-500/yr | 100% |
| Development hardware (if purchased) | Varies | Section 179 first year |
| Technical books and courses | Varies | 100% |
| Beta tester gifts/compensation | Varies | 100% |
| Tally Pro (if upgraded) | ~$0-29/yr | 100% |

### Home Office Deduction

If you work from home (which you do), a portion of your home expenses is deductible. Two methods:

**Simplified method:** $5 per square foot of dedicated office space, up to 300 sq ft = max $1,500/year. Easy, no receipts needed beyond the square footage measurement.

**Actual expense method:** Calculate the percentage of your home used for business (office sq ft / total sq ft) and apply that percentage to: rent/mortgage interest, utilities, internet, insurance, repairs. More complex but potentially larger deduction.

**For the internet specifically:** Even without a home office deduction, you can deduct the business-use percentage of your internet bill. Given you're running a SaaS, 50-80% business use is defensible.

### The Generative Art Project

If the generative art project operates under the same LLC, its expenses are also deductible — compute costs, tools, assets, anything directly related. The IRS hobby loss rules apply to the LLC as a whole, not per-project, so as long as the combined entity shows a profit motive and reasonable business activity, both projects' expenses flow through.

---

## Tax Structure

### How It Works

Single-member LLC → Schedule C on your personal Form 1040.

```
Your W-2 income (day job)              $XXX,XXX
+ outerfit net income (or loss)        -$X,XXX   ← reduces taxable income
= Adjusted Gross Income                 $XX,XXX
```

In the early phase when expenses exceed revenue, outerfit generates a **net operating loss** that reduces your total taxable income. You pay less tax on your day job income as a result.

### Quarterly Estimated Taxes

Once outerfit is generating meaningful revenue, you're required to pay estimated taxes quarterly. Failure to do so results in an underpayment penalty at tax time.

**Rule of thumb:** If you expect to owe more than $1,000 in federal taxes from self-employment income, pay quarterly estimates.

```
Q1 (Jan 1 - Mar 31)   → Due April 15
Q2 (Apr 1 - May 31)   → Due June 15
Q3 (Jun 1 - Aug 31)   → Due September 15
Q4 (Sep 1 - Dec 31)   → Due January 15 (following year)
```

**Safe harbor:** Pay 100% of last year's tax liability in quarterly installments and you'll owe no underpayment penalty regardless of actual income. Simple rule that avoids surprises.

### Self-Employment Tax

As an LLC owner taking business income, you pay self-employment tax (15.3%) on net self-employment income up to the Social Security wage base (~$168,600 in 2024). This covers Social Security and Medicare.

The good news: half of self-employment tax is deductible on your personal return.

**When revenue gets meaningful (>$50K/year from outerfit):**
Consider electing S-Corp tax treatment for the LLC. This allows you to pay yourself a "reasonable salary" and take the rest as distributions, which are not subject to self-employment tax. The savings can be significant. Consult an accountant at that point.

---

## The Hobby Loss Rules (Section 183)

The IRS can reclassify a business as a hobby if it consistently loses money with no reasonable expectation of profit. If reclassified, deductions are limited to income from the activity.

**Safe harbor:** Profit in 3 of 5 consecutive tax years (2 of 7 for horse activities — irrelevant here).

**What protects you:**

The following factors favor "business" classification even during loss years:

- You carry on the activity in a businesslike manner ✅ (architecture docs, business plan, proper accounting)
- You depend on income from the activity ✅ (you have paying customers)
- Your losses are due to startup circumstances ✅ (every SaaS loses money in year 1)
- You have a reasonable expectation of future profit ✅ (business case with financial projections)
- You have expertise in the field ✅ (Director of Data, technical background)
- You have been profitable in similar activities ✅ (document any prior business wins)

**Practical protection:** Keep the business plan document, the financial projections, the architecture docs — these demonstrate business intent. File them with your tax records.

---

## First Year Tax Checklist

```
Formation
□ Articles of Organization filed and saved
□ EIN obtained from IRS
□ Beneficial Ownership Report filed (fincen.gov/boi)
□ Business bank account opened
□ Business credit card obtained

Bookkeeping
□ Wave Accounting (or equivalent) set up
□ Business bank account connected
□ Transaction categories configured
□ All pre-formation startup costs captured
   (Up to $5,000 of startup costs deductible in year 1 under Section 195)

Expenses
□ All subscriptions moved to business card
□ VPS invoice in business name (update billing with DatabaseMart)
□ Domain renewal in business name
□ Home office square footage measured and documented
□ Internet bill percentage documented

Tax Prep
□ Schedule C prepared (or CPA engaged)
□ Form SE (self-employment tax) prepared
□ Quarterly estimates set up if revenue exceeds $1,000/quarter
□ Prior year tax return available for safe harbor calculation
```

---

## Recommended Accountant Engagement

**Year 1:** One consultation (~$200-300) to set up Schedule C correctly, confirm home office deduction method, and verify startup cost treatment. Worth every dollar.

**Year 2+:** If revenue is under $50K, TurboTax Self-Employed (~$120) handles it cleanly once you know the pattern. If revenue exceeds $50K, a CPA pays for themselves in S-Corp election analysis alone.

**Find a CPA who works with startups/SaaS.** A general CPA who does W-2 returns will miss deductions that a tech-startup-focused accountant catches routinely. Ask specifically: "Do you work with software businesses and SaaS companies?"

---

## Budget Summary

| Item | Cost | Timing |
|------|------|--------|
| Colorado LLC filing | $50 | Now |
| EIN | $0 | Now |
| Beneficial Ownership Report | $0 | Within 90 days |
| Chase Business Complete | $0-15/mo (waivable) | This week |
| Chase Ink Cash | $0 annual fee | This week |
| Wave Accounting | $0 | This week |
| Year 1 CPA consultation | $200-300 | Before first tax filing |
| Colorado annual report | $25/yr | Anniversary month |
| **Total Year 1** | **~$260-360** | |

---

## Personal-to-Business Migration

Everything currently on your personal card and personal accounts needs to move to the business. This is a one-time migration that takes about two hours spread across a week. The good news: you caught it before you have any users or revenue, so the migration is clean.

### Pre-Formation Startup Costs

Everything spent on outerfit before the LLC formation date is still fully deductible under IRS Section 195 — up to $5,000 in the first year. Pull your personal card statements and document every outerfit-related charge going back to when you started.

```
Action: Create a spreadsheet with:
- Date
- Amount
- Description
- Category (domain / hosting / software / subscriptions)

Hand this to your accountant labeled "Pre-formation startup costs"
with the LLC formation date noted clearly.
```

You do not need to reverse or dispute any charges. Document them and claim them.

### Migration Checklist

Complete in this order — the LLC and bank account must exist before migrating billing.

**Phase 1 — Legal & Banking (This Week)**
```
□ Search "Outerfit" at sos.colorado.gov — confirm name available
□ File Colorado LLC Articles of Organization ($50)
□ Obtain EIN from irs.gov (free, instant)
□ File Beneficial Ownership Report at fincen.gov/boi (free, within 90 days)
□ Open Chase Business Complete Checking (bring Articles of Organization + EIN)
□ Apply for Chase Ink Cash credit card
□ Set up Wave Accounting, connect Chase business account
```

**Phase 2 — Migrate Recurring Expenses to Ink Cash**

Update billing on each service. Change to business card and update account
email to hello@outerfit.net where possible.

| Service | Action | Notes |
|---------|--------|-------|
| DatabaseMart VPS | Update billing + account email | Log into DatabaseMart account → billing |
| outerfit.net domain (Cheapnames) | Update billing + account email | Log into Cheapnames → payment methods |
| Cloudflare | Update billing | Log into Cloudflare → Billing |
| Anthropic / Claude | Update billing | account.anthropic.com → billing |
| OpenAI / Codex | Update billing | platform.openai.com → billing |
| Resend | Business card from day one | Sign up after LLC formed |
| Infisical | Business card from day one | Sign up after LLC formed |
| AgentMail | Business card from day one | Sign up after LLC formed |
| iubenda (when purchased) | Business card from day one | |
| Any dev tools / subscriptions | Update billing | Audit your personal card statements |

**Phase 3 — Account Ownership Transfer**

These services should be owned by the business entity, not your personal account.

```
□ DatabaseMart — update account name to Outerfit LLC, email to hello@outerfit.net
□ Cloudflare — update account name, add hello@outerfit.net as owner
□ Cheapnames — update registrant contact to Outerfit LLC
□ GitHub — create an outerfit organization, transfer repo to org
   (your personal account remains a member — you just move ownership)
□ Anthropic API — update billing to business, note formation date
□ OpenAI — update billing to business, note formation date
```

**Phase 4 — Document Everything**

```
□ Spreadsheet of all pre-formation expenses (for accountant)
□ Screenshot of LLC formation date (stamped Articles of Organization)
□ Note formation date in Wave as the business start date
□ Forward all service confirmation emails to hello@outerfit.net going forward
```

### What Not To Worry About

**Personal use of services:** If you use Claude or Codex for personal projects too, that's fine — the business-use percentage is still deductible. Tell your accountant the approximate business vs personal split. For a developer building a SaaS, 80%+ business use is defensible.

**Historical card statements:** You don't need to get a refund or credit on anything paid personally before the LLC. Those become startup costs on your tax return. Keep the statements.

**The VPS physical location:** The server doesn't move. You're just updating the billing account that owns it from personal to business. DatabaseMart doesn't care — it's an account update, not a migration.

---

## The One Thing To Do Today

Go to **mybizcolorado.gov**, use the name availability search to confirm "Outerfit" is available. The filing itself takes 15 minutes and $50. Sign up for email reminders during the process so you don't miss the annual periodic report. Everything else follows from that.
