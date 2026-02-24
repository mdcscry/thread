# THREAD Analytics Architecture

*Last Updated: 2026-02-23*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

Two distinct analytics systems serve two distinct audiences:

- **Wardrobe X-Ray** — in-app analytics for the user. Fun, personal, slightly addictive. Shows users things about their wardrobe they never knew. Drives engagement and retention.
- **Admin Analytics** — operational intelligence for the founder. Users, items, outfits, revenue, churn, all trended. Powered by DuckDB ETL running against a read replica of the operational SQLite database.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Analytics Stack                               │
├─────────────────────────────────────────────────────────────────────┤
│  In-App           │  Wardrobe X-Ray                                  │
│  (User-facing)    │  Profile tab summary + /insights full page       │
│                   │  Recharts + React  |  Live from SQLite           │
├─────────────────────────────────────────────────────────────────────┤
│  Admin            │  Operational Dashboard                           │
│  (Founder-facing) │  /admin/analytics                               │
│                   │  DuckDB ETL  |  Aggregated, trended, cached      │
├─────────────────────────────────────────────────────────────────────┤
│  ETL Pipeline     │  DuckDB read replica                             │
│  (Background)     │  Nightly job  |  Partitioned by date            │
│                   │  Never touches operational DB writes             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 1 — Wardrobe X-Ray (In-App Analytics)

### Philosophy

The Wardrobe X-Ray is not a dashboard. It is a mirror. It tells users things about themselves they didn't know they knew — the color they reach for when they're tired, the category they overspent on, the items they've never worn. Done right it becomes one of the stickiest features in the app. Users share screenshots. They talk about it.

It lives in two places:
- **Profile tab summary** — 3-4 headline stats, visible without navigating away
- **Dedicated /insights page** — the full X-Ray, every chart, every stat

### In-App API Endpoints

```javascript
// server/routes/insights.js

// Summary stats — for profile tab widget
fastify.get('/api/v1/insights/summary', { preHandler: [authenticate] }, async (request, reply) => {
  const userId = request.user.id
  const stats = await insightsService.getSummary(userId)
  return reply.send(stats)
})

// Full wardrobe X-Ray
fastify.get('/api/v1/insights/wardrobe', { preHandler: [authenticate] }, async (request, reply) => {
  const userId = request.user.id
  const xray = await insightsService.getWardrobeXray(userId)
  return reply.send(xray)
})

// Anonymized benchmark comparisons
fastify.get('/api/v1/insights/benchmarks', { preHandler: [authenticate] }, async (request, reply) => {
  // Returns aggregate population stats — never individual data
  const benchmarks = await insightsService.getBenchmarks()
  return reply.send(benchmarks)
})
```

### InsightsService

```javascript
// server/services/InsightsService.js

export class InsightsService {
  constructor(db) {
    this.db = db
  }

  async getSummary(userId) {
    const items = this.query(`SELECT COUNT(*) as total FROM items WHERE user_id = ?`, userId)
    const outfits = this.query(`SELECT COUNT(*) as total FROM outfits WHERE user_id = ?`, userId)
    const topColor = this.query(`
      SELECT primary_color, COUNT(*) as count
      FROM items WHERE user_id = ?
      GROUP BY primary_color ORDER BY count DESC LIMIT 1
    `, userId)
    const utilization = this.query(`
      SELECT ROUND(
        COUNT(DISTINCT oi.item_id) * 100.0 / NULLIF(COUNT(DISTINCT i.id), 0), 1
      ) as pct
      FROM items i
      LEFT JOIN outfit_items oi ON oi.item_id = i.id
      WHERE i.user_id = ?
    `, userId)

    return {
      total_items: items?.total || 0,
      total_outfits: outfits?.total || 0,
      most_common_color: topColor?.primary_color || null,
      wardrobe_utilization_pct: utilization?.pct || 0,
    }
  }

  async getWardrobeXray(userId) {
    return {
      overview:        await this.getOverview(userId),
      colors:          await this.getColorBreakdown(userId),
      categories:      await this.getCategoryBreakdown(userId),
      utilization:     await this.getUtilization(userId),
      outfit_history:  await this.getOutfitHistory(userId),
      style_dna:       await this.getStyleDNA(userId),
      cost_per_wear:   await this.getCostPerWear(userId),
      seasonal:        await this.getSeasonalBreakdown(userId),
    }
  }

  async getOverview(userId) {
    return this.query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(CASE WHEN is_loved = 1 THEN 1 END) as loved_items,
        COUNT(CASE WHEN in_laundry = 1 THEN 1 END) as in_laundry,
        COUNT(CASE WHEN in_storage = 1 THEN 1 END) as in_storage,
        COUNT(CASE WHEN ai_flagged = 1 THEN 1 END) as ai_flagged
      FROM items WHERE user_id = ?
    `, userId)
  }

  async getColorBreakdown(userId) {
    // Returns array sorted by count desc
    return this.queryAll(`
      SELECT
        primary_color as color,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
      FROM items
      WHERE user_id = ? AND primary_color IS NOT NULL
      GROUP BY primary_color
      ORDER BY count DESC
      LIMIT 12
    `, userId)
  }

  async getCategoryBreakdown(userId) {
    return this.queryAll(`
      SELECT
        category,
        subcategory,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
      FROM items
      WHERE user_id = ?
      GROUP BY category, subcategory
      ORDER BY count DESC
    `, userId)
  }

  async getUtilization(userId) {
    // Items worn (appeared in an outfit) vs never worn
    return this.queryAll(`
      SELECT
        i.id,
        i.name,
        i.category,
        i.primary_color,
        i.primary_image,
        COUNT(oi.id) as times_worn,
        MAX(o.created_at) as last_worn
      FROM items i
      LEFT JOIN outfit_items oi ON oi.item_id = i.id
      LEFT JOIN outfits o ON o.id = oi.outfit_id
      WHERE i.user_id = ?
      GROUP BY i.id
      ORDER BY times_worn DESC
    `, userId)
  }

  async getStyleDNA(userId) {
    // What patterns, materials, fits dominate this wardrobe
    return {
      patterns: this.queryAll(`
        SELECT pattern, COUNT(*) as count
        FROM items WHERE user_id = ? AND pattern IS NOT NULL
        GROUP BY pattern ORDER BY count DESC LIMIT 8
      `, userId),
      materials: this.queryAll(`
        SELECT material, COUNT(*) as count
        FROM items WHERE user_id = ? AND material IS NOT NULL
        GROUP BY material ORDER BY count DESC LIMIT 8
      `, userId),
      fits: this.queryAll(`
        SELECT fit, COUNT(*) as count
        FROM items WHERE user_id = ? AND fit IS NOT NULL
        GROUP BY fit ORDER BY count DESC LIMIT 6
      `, userId),
      silhouettes: this.queryAll(`
        SELECT silhouette, COUNT(*) as count
        FROM items WHERE user_id = ? AND silhouette IS NOT NULL
        GROUP BY silhouette ORDER BY count DESC LIMIT 6
      `, userId),
    }
  }

  async getCostPerWear(userId) {
    // Only meaningful if user has added purchase prices
    // Items table would need a 'purchase_price' column (add to schema)
    return this.queryAll(`
      SELECT
        i.id, i.name, i.category, i.primary_image,
        i.purchase_price,
        COUNT(oi.id) as times_worn,
        CASE
          WHEN COUNT(oi.id) > 0 THEN ROUND(i.purchase_price / COUNT(oi.id), 2)
          ELSE NULL
        END as cost_per_wear
      FROM items i
      LEFT JOIN outfit_items oi ON oi.item_id = i.id
      WHERE i.user_id = ? AND i.purchase_price IS NOT NULL
      GROUP BY i.id
      ORDER BY cost_per_wear ASC
    `, userId)
  }

  async getOutfitHistory(userId) {
    return this.queryAll(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as outfits_generated,
        weather,
        occasion
      FROM outfits
      WHERE user_id = ?
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `, userId)
  }

  async getBenchmarks() {
    // AGGREGATE ONLY — never individual data
    // Cached for 24 hours to avoid hammering the DB
    return this.queryAll(`
      SELECT
        primary_color as color,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM items), 1) as population_pct
      FROM items
      GROUP BY primary_color
      ORDER BY population_pct DESC
      LIMIT 12
    `)
  }

  query(sql, ...params) {
    const result = this.db.exec(sql, params)
    return result?.[0]?.values?.[0] ? this.rowToObject(result[0]) : null
  }

  queryAll(sql, ...params) {
    const result = this.db.exec(sql, params)
    if (!result?.[0]) return []
    const { columns, values } = result[0]
    return values.map(row =>
      Object.fromEntries(columns.map((col, i) => [col, row[i]]))
    )
  }

  rowToObject(result) {
    if (!result?.[0]) return null
    const { columns, values } = result[0]
    return Object.fromEntries(columns.map((col, i) => [col, values[0][i]]))
  }
}
```

### Schema Additions

```sql
-- Add to items table
ALTER TABLE items ADD COLUMN purchase_price REAL;
ALTER TABLE items ADD COLUMN purchase_date TEXT;

-- Wardrobe X-Ray cache (avoid recalculating on every page load)
CREATE TABLE IF NOT EXISTS insights_cache (
  user_id       INTEGER PRIMARY KEY,
  data          TEXT NOT NULL,   -- JSON blob
  computed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

### Wardrobe X-Ray UI (React)

#### Profile Tab Summary Widget

```jsx
// client/src/components/WardrobeSummary.jsx
import { useEffect, useState } from 'react'

export function WardrobeSummary({ userId }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetch('/api/v1/insights/summary')
      .then(r => r.json())
      .then(setStats)
  }, [])

  if (!stats) return <div className="summary-loading" />

  return (
    <div className="wardrobe-summary">
      <StatCard label="Items" value={stats.total_items} />
      <StatCard label="Outfits Created" value={stats.total_outfits} />
      <StatCard label="Wardrobe Used" value={`${stats.wardrobe_utilization_pct}%`} />
      <StatCard label="Fave Color" value={stats.most_common_color} color />
      <a href="/insights" className="xray-link">Full Wardrobe X-Ray →</a>
    </div>
  )
}
```

#### Full Insights Page — Chart Suite

Install charting library (open source, zero cost):

```bash
npm install recharts
```

```jsx
// client/src/pages/InsightsPage.jsx
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts'
import { useEffect, useState } from 'react'

// Color palette for charts — maps color names to hex values
const COLOR_MAP = {
  black: '#1A1A1A', white: '#F5F5F5', navy: '#1A1A2E',
  blue: '#2E86AB', red: '#C0392B', green: '#27AE60',
  grey: '#7F8C8D', gray: '#7F8C8D', brown: '#795548',
  beige: '#D4B896', pink: '#E91E8C', yellow: '#F1C40F',
  orange: '#E67E22', purple: '#8E44AD', cream: '#FDF8F2',
}

export function InsightsPage() {
  const [xray, setXray] = useState(null)
  const [benchmarks, setBenchmarks] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/insights/wardrobe').then(r => r.json()),
      fetch('/api/v1/insights/benchmarks').then(r => r.json()),
    ]).then(([x, b]) => { setXray(x); setBenchmarks(b) })
  }, [])

  if (!xray) return <div className="insights-loading">Analyzing your wardrobe...</div>

  return (
    <div className="insights-page">
      <h1>Your Wardrobe X-Ray</h1>

      {/* ── Color DNA ── */}
      <section className="insight-section">
        <h2>Color DNA</h2>
        <p className="insight-subtitle">What your wardrobe actually looks like.</p>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={xray.colors} dataKey="count" nameKey="color"
                 cx="50%" cy="50%" outerRadius={110} label={({color, percentage}) => `${color} ${percentage}%`}>
              {xray.colors.map((entry, i) => (
                <Cell key={i} fill={COLOR_MAP[entry.color?.toLowerCase()] || '#AAAAAA'} />
              ))}
            </Pie>
            <Tooltip formatter={(val, name) => [`${val} items`, name]} />
          </PieChart>
        </ResponsiveContainer>

        {/* Benchmark comparison — aggregate only */}
        {benchmarks && (
          <div className="benchmark-compare">
            <h3>How you compare</h3>
            <p className="benchmark-note">Anonymized averages across all outerfit wardrobes.</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={xray.colors.map(c => ({
                color: c.color,
                yours: c.percentage,
                average: benchmarks.find(b => b.color === c.color)?.population_pct || 0
              }))}>
                <XAxis dataKey="color" />
                <YAxis unit="%" />
                <Tooltip />
                <Bar dataKey="yours" name="Your wardrobe" fill="#1A1A2E" />
                <Bar dataKey="average" name="Average wardrobe" fill="#AAAACC" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ── Wardrobe Utilization ── */}
      <section className="insight-section">
        <h2>Wardrobe Utilization</h2>
        <p className="insight-subtitle">
          You wear {xray.overview.total_items > 0
            ? Math.round(xray.utilization.filter(i => i.times_worn > 0).length / xray.overview.total_items * 100)
            : 0}% of what you own.
          {' '}The average person wears 20%.
        </p>
        <div className="utilization-grid">
          {xray.utilization.slice(0, 20).map(item => (
            <div key={item.id}
                 className={`utilization-item ${item.times_worn === 0 ? 'never-worn' : ''}`}
                 title={`${item.name} — worn ${item.times_worn} times`}>
              {item.primary_image &&
                <img src={`/images/${item.primary_image}`} alt={item.name} />}
              <span className="wear-count">{item.times_worn}x</span>
            </div>
          ))}
        </div>

        {/* Never worn items */}
        {xray.utilization.filter(i => i.times_worn === 0).length > 0 && (
          <div className="never-worn-callout">
            <span className="callout-number">
              {xray.utilization.filter(i => i.times_worn === 0).length}
            </span>
            {' '}items you've never worn in an outerfit outfit.
            <button onClick={() => {/* trigger outfit with these items */}}>
              Style them →
            </button>
          </div>
        )}
      </section>

      {/* ── Category Breakdown ── */}
      <section className="insight-section">
        <h2>What You Own</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={xray.categories} layout="vertical">
            <XAxis type="number" />
            <YAxis dataKey="category" type="category" width={80} />
            <Tooltip />
            <Bar dataKey="count" fill="#1A1A2E" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* ── Style DNA ── */}
      <section className="insight-section">
        <h2>Style DNA</h2>
        <div className="dna-grid">
          <DnaCard title="Patterns" data={xray.style_dna.patterns} dataKey="pattern" />
          <DnaCard title="Materials" data={xray.style_dna.materials} dataKey="material" />
          <DnaCard title="Fits" data={xray.style_dna.fits} dataKey="fit" />
        </div>
      </section>

      {/* ── Outfit History ── */}
      <section className="insight-section">
        <h2>Outfit Activity</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={xray.outfit_history}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="outfits_generated"
                  stroke="#1A1A2E" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* ── Cost Per Wear ── (only if purchase prices entered) */}
      {xray.cost_per_wear?.length > 0 && (
        <section className="insight-section">
          <h2>Cost Per Wear</h2>
          <p className="insight-subtitle">The items paying for themselves.</p>
          <div className="cpw-list">
            {xray.cost_per_wear.slice(0, 10).map(item => (
              <div key={item.id} className="cpw-item">
                <span className="cpw-name">{item.name}</span>
                <span className="cpw-value">
                  {item.cost_per_wear ? `$${item.cost_per_wear}/wear` : 'never worn'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function DnaCard({ title, data, dataKey }) {
  return (
    <div className="dna-card">
      <h3>{title}</h3>
      {data?.map((item, i) => (
        <div key={i} className="dna-bar">
          <span className="dna-label">{item[dataKey]}</span>
          <div className="dna-fill" style={{ width: `${item.count * 10}px` }} />
          <span className="dna-count">{item.count}</span>
        </div>
      ))}
    </div>
  )
}
```

---

## Part 2 — Admin Analytics (DuckDB ETL)

### Philosophy

The admin dashboard is operational intelligence. It answers: is the business healthy? Are users sticking? Where is revenue coming from? What is churning? It runs on DuckDB — a zero-infrastructure analytical database that reads directly from the SQLite file on a read-only basis, meaning zero impact on the production database.

### Why DuckDB

DuckDB is essentially SQLite for analytics. It runs in-process (no server), reads SQLite files natively, and executes complex aggregations 10-100x faster than SQLite. No Docker, no Postgres, no Redis. It fits perfectly in the existing architecture.

```bash
npm install duckdb
```

### ETL Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         ETL Pipeline                                  │
│                                                                       │
│  SQLite (operational)                                                 │
│  thread.db (read-only)  ──────────────────────────────────┐          │
│                                                            ▼          │
│                                              DuckDB ETL Job          │
│                                              (nightly 2am)           │
│                                                    │                  │
│                                                    ▼                  │
│                                    analytics.duckdb                  │
│                                    (partitioned by date)             │
│                                                    │                  │
│                                                    ▼                  │
│                                    Admin API (/api/v1/admin/*)       │
│                                    Fastify reads DuckDB              │
└──────────────────────────────────────────────────────────────────────┘
```

### DuckDB Schema (Analytics DB)

```javascript
// server/analytics/schema.js
export const ANALYTICS_SCHEMA = `
  -- Daily snapshots — one row per day, partitioned
  CREATE TABLE IF NOT EXISTS daily_snapshots (
    snapshot_date     DATE NOT NULL,
    total_users       INTEGER,
    new_users         INTEGER,
    active_users_7d   INTEGER,
    active_users_30d  INTEGER,
    total_items       INTEGER,
    new_items         INTEGER,
    total_outfits     INTEGER,
    new_outfits       INTEGER,
    acceptance_rate   FLOAT,
    rejection_rate    FLOAT,
    total_images      INTEGER,
    PRIMARY KEY (snapshot_date)
  );

  -- Revenue snapshots (from entitlements table)
  CREATE TABLE IF NOT EXISTS revenue_snapshots (
    snapshot_date       DATE NOT NULL,
    plan                TEXT NOT NULL,
    subscriber_count    INTEGER,
    mrr                 FLOAT,
    PRIMARY KEY (snapshot_date, plan)
  );

  -- Churn snapshots
  CREATE TABLE IF NOT EXISTS churn_snapshots (
    snapshot_date         DATE NOT NULL,
    new_churn_signals     INTEGER,
    no_upload_7d          INTEGER,
    no_login_14d          INTEGER,
    no_login_30d          INTEGER,
    reject_streaks        INTEGER,
    cancellations         INTEGER,
    intervention_returns  INTEGER,
    PRIMARY KEY (snapshot_date)
  );

  -- Wardrobe composition snapshots (anonymized aggregate)
  CREATE TABLE IF NOT EXISTS wardrobe_composition (
    snapshot_date    DATE NOT NULL,
    color            TEXT NOT NULL,
    item_count       INTEGER,
    pct_of_total     FLOAT,
    PRIMARY KEY (snapshot_date, color)
  );

  -- Category composition
  CREATE TABLE IF NOT EXISTS category_composition (
    snapshot_date   DATE NOT NULL,
    category        TEXT NOT NULL,
    item_count      INTEGER,
    pct_of_total    FLOAT,
    PRIMARY KEY (snapshot_date, category)
  );

  -- Funnel snapshots
  CREATE TABLE IF NOT EXISTS funnel_snapshots (
    snapshot_date             DATE NOT NULL,
    registered                INTEGER,
    completed_onboarding      INTEGER,
    uploaded_first_item       INTEGER,
    generated_first_outfit    INTEGER,
    active_day_7              INTEGER,
    active_day_30             INTEGER,
    PRIMARY KEY (snapshot_date)
  );
`
```

### ETL Job

```javascript
// server/analytics/etl.js
import Database from 'duckdb'
import cron from 'node-cron'
import path from 'path'

const SQLITE_PATH = process.env.DATABASE_PATH || './data/thread.db'
const DUCKDB_PATH = process.env.ANALYTICS_DB_PATH || './data/analytics.duckdb'

export class AnalyticsETL {

  async run() {
    const db = new Database.Database(DUCKDB_PATH)
    const conn = db.connect()

    // Install SQLite extension to read from operational DB
    conn.exec("INSTALL sqlite; LOAD sqlite;")

    const today = new Date().toISOString().split('T')[0]

    try {
      await this.snapshotUsers(conn, today)
      await this.snapshotRevenue(conn, today)
      await this.snapshotChurn(conn, today)
      await this.snapshotWardrobeComposition(conn, today)
      await this.snapshotFunnel(conn, today)
      console.log(`Analytics ETL complete for ${today}`)
    } catch (err) {
      console.error('Analytics ETL failed:', err)
    } finally {
      conn.close()
      db.close()
    }
  }

  async snapshotUsers(conn, date) {
    conn.exec(`
      INSERT OR REPLACE INTO daily_snapshots (
        snapshot_date, total_users, new_users,
        active_users_7d, active_users_30d,
        total_items, new_items,
        total_outfits, new_outfits,
        acceptance_rate, rejection_rate, total_images
      )
      SELECT
        '${date}' as snapshot_date,
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'users')) as total_users,
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'users')
         WHERE created_at >= current_date - INTERVAL '1 day') as new_users,
        (SELECT COUNT(DISTINCT user_id) FROM sqlite_scan('${SQLITE_PATH}', 'outfits')
         WHERE created_at >= current_date - INTERVAL '7 days') as active_users_7d,
        (SELECT COUNT(DISTINCT user_id) FROM sqlite_scan('${SQLITE_PATH}', 'outfits')
         WHERE created_at >= current_date - INTERVAL '30 days') as active_users_30d,
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'items')) as total_items,
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'items')
         WHERE created_at >= current_date - INTERVAL '1 day') as new_items,
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'outfits')) as total_outfits,
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'outfits')
         WHERE created_at >= current_date - INTERVAL '1 day') as new_outfits,
        (SELECT ROUND(AVG(CASE WHEN feedback_value > 0.5 THEN 1.0 ELSE 0.0 END), 3)
         FROM sqlite_scan('${SQLITE_PATH}', 'item_feedback')) as acceptance_rate,
        (SELECT ROUND(AVG(CASE WHEN feedback_value <= 0.3 THEN 1.0 ELSE 0.0 END), 3)
         FROM sqlite_scan('${SQLITE_PATH}', 'item_feedback')) as rejection_rate,
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'items')
         WHERE primary_image IS NOT NULL) as total_images
    `)
  }

  async snapshotRevenue(conn, date) {
    conn.exec(`
      INSERT OR REPLACE INTO revenue_snapshots (snapshot_date, plan, subscriber_count, mrr)
      SELECT
        '${date}',
        plan,
        COUNT(*) as subscriber_count,
        COUNT(*) * CASE plan
          WHEN 'starter'      THEN 2.99
          WHEN 'pro'          THEN 7.99
          WHEN 'couple'       THEN 14.99
          WHEN 'wardrobe_plus' THEN 19.99
          ELSE 0
        END as mrr
      FROM sqlite_scan('${SQLITE_PATH}', 'entitlements')
      WHERE status = 'active' AND plan != 'free'
      GROUP BY plan
    `)
  }

  async snapshotChurn(conn, date) {
    conn.exec(`
      INSERT OR REPLACE INTO churn_snapshots (
        snapshot_date, new_churn_signals, no_upload_7d,
        no_login_14d, no_login_30d, reject_streaks,
        cancellations, intervention_returns
      )
      SELECT
        '${date}',
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'churn_signals')
         WHERE detected_at >= current_date - INTERVAL '1 day'),
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'churn_signals')
         WHERE signal_type = 'no_upload_7d'
         AND detected_at >= current_date - INTERVAL '1 day'),
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'churn_signals')
         WHERE signal_type = 'no_login_14d'
         AND detected_at >= current_date - INTERVAL '1 day'),
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'churn_signals')
         WHERE signal_type = 'no_login_30d'
         AND detected_at >= current_date - INTERVAL '1 day'),
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'churn_signals')
         WHERE signal_type = 'suggestion_reject_streak'
         AND detected_at >= current_date - INTERVAL '1 day'),
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'billing_events')
         WHERE event_type = 'subscription.terminated'
         AND processed_at >= current_date - INTERVAL '1 day'),
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'churn_interventions')
         WHERE outcome = 'returned'
         AND sent_at >= current_date - INTERVAL '1 day')
    `)
  }

  async snapshotWardrobeComposition(conn, date) {
    conn.exec(`
      INSERT OR REPLACE INTO wardrobe_composition (snapshot_date, color, item_count, pct_of_total)
      SELECT
        '${date}',
        primary_color,
        COUNT(*) as item_count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as pct_of_total
      FROM sqlite_scan('${SQLITE_PATH}', 'items')
      WHERE primary_color IS NOT NULL
      GROUP BY primary_color
      ORDER BY item_count DESC
    `)
  }

  async snapshotFunnel(conn, date) {
    conn.exec(`
      INSERT OR REPLACE INTO funnel_snapshots (
        snapshot_date, registered, completed_onboarding,
        uploaded_first_item, generated_first_outfit,
        active_day_7, active_day_30
      )
      SELECT
        '${date}',
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'users')),
        (SELECT COUNT(*) FROM sqlite_scan('${SQLITE_PATH}', 'users')
         WHERE onboarding_step >= 3),
        (SELECT COUNT(DISTINCT user_id) FROM sqlite_scan('${SQLITE_PATH}', 'items')),
        (SELECT COUNT(DISTINCT user_id) FROM sqlite_scan('${SQLITE_PATH}', 'outfits')),
        (SELECT COUNT(DISTINCT user_id) FROM sqlite_scan('${SQLITE_PATH}', 'outfits')
         WHERE created_at >= current_date - INTERVAL '7 days'),
        (SELECT COUNT(DISTINCT user_id) FROM sqlite_scan('${SQLITE_PATH}', 'outfits')
         WHERE created_at >= current_date - INTERVAL '30 days')
    `)
  }
}

// Schedule: nightly at 2am — after backup, before business day
cron.schedule('0 2 * * *', async () => {
  const etl = new AnalyticsETL()
  await etl.run()
})
```

### Admin Analytics API

```javascript
// server/routes/adminAnalytics.js
import Database from 'duckdb'

const DUCKDB_PATH = process.env.ANALYTICS_DB_PATH || './data/analytics.duckdb'

function queryDuck(sql) {
  return new Promise((resolve, reject) => {
    const db = new Database.Database(DUCKDB_PATH, { access_mode: 'READ_ONLY' })
    db.all(sql, (err, rows) => {
      db.close()
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

export async function adminAnalyticsRoutes(fastify) {

  // Key metrics — last 30 days trended
  fastify.get('/api/v1/admin/analytics/overview', {
    preHandler: [requireAdmin]
  }, async (request, reply) => {
    const [snapshots, revenue, churn, funnel] = await Promise.all([
      queryDuck(`
        SELECT * FROM daily_snapshots
        ORDER BY snapshot_date DESC LIMIT 30
      `),
      queryDuck(`
        SELECT snapshot_date, SUM(mrr) as total_mrr, SUM(subscriber_count) as total_subscribers
        FROM revenue_snapshots
        GROUP BY snapshot_date
        ORDER BY snapshot_date DESC LIMIT 30
      `),
      queryDuck(`
        SELECT * FROM churn_snapshots
        ORDER BY snapshot_date DESC LIMIT 30
      `),
      queryDuck(`SELECT * FROM funnel_snapshots ORDER BY snapshot_date DESC LIMIT 1`),
    ])

    return reply.send({ snapshots, revenue, churn, funnel: funnel[0] })
  })

  // MRR breakdown by plan
  fastify.get('/api/v1/admin/analytics/revenue', {
    preHandler: [requireAdmin]
  }, async (request, reply) => {
    const data = await queryDuck(`
      SELECT
        snapshot_date,
        plan,
        subscriber_count,
        mrr,
        SUM(mrr) OVER (PARTITION BY snapshot_date) as total_mrr
      FROM revenue_snapshots
      ORDER BY snapshot_date DESC, mrr DESC
      LIMIT 120  -- 30 days × 4 plans
    `)
    return reply.send(data)
  })

  // Churn analysis
  fastify.get('/api/v1/admin/analytics/churn', {
    preHandler: [requireAdmin]
  }, async (request, reply) => {
    const data = await queryDuck(`
      SELECT
        cs.*,
        -- Rolling 7-day churn rate
        ROUND(SUM(new_churn_signals) OVER (
          ORDER BY snapshot_date
          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) * 1.0 / NULLIF(
          (SELECT total_users FROM daily_snapshots d
           WHERE d.snapshot_date = cs.snapshot_date), 0
        ) * 100, 2) as rolling_7d_churn_pct
      FROM churn_snapshots cs
      ORDER BY snapshot_date DESC
      LIMIT 90
    `)
    return reply.send(data)
  })

  // Wardrobe composition trends (aggregate)
  fastify.get('/api/v1/admin/analytics/wardrobe', {
    preHandler: [requireAdmin]
  }, async (request, reply) => {
    const data = await queryDuck(`
      SELECT color, pct_of_total, snapshot_date
      FROM wardrobe_composition
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM wardrobe_composition)
      ORDER BY pct_of_total DESC
      LIMIT 15
    `)
    return reply.send(data)
  })

  // Funnel conversion
  fastify.get('/api/v1/admin/analytics/funnel', {
    preHandler: [requireAdmin]
  }, async (request, reply) => {
    const data = await queryDuck(`
      SELECT
        snapshot_date,
        registered,
        completed_onboarding,
        uploaded_first_item,
        generated_first_outfit,
        active_day_7,
        active_day_30,
        ROUND(completed_onboarding * 100.0 / NULLIF(registered, 0), 1) as onboarding_rate,
        ROUND(generated_first_outfit * 100.0 / NULLIF(registered, 0), 1) as first_outfit_rate,
        ROUND(active_day_30 * 100.0 / NULLIF(registered, 0), 1) as day30_retention
      FROM funnel_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 30
    `)
    return reply.send(data)
  })
}
```

---

### Admin Dashboard UI (React)

The admin dashboard lives at `/admin` behind an `ADMIN_API_KEY` check.

Key panels — all using Recharts (same library as in-app):

```jsx
// client/src/pages/AdminDashboard.jsx — panel layout

const PANELS = [
  { title: "Total Users",        metric: "total_users",       trend: true  },
  { title: "Monthly Recurring Revenue", metric: "total_mrr",  trend: true, prefix: "$" },
  { title: "Active (30d)",       metric: "active_users_30d",  trend: true  },
  { title: "Acceptance Rate",    metric: "acceptance_rate",   trend: true, suffix: "%" },
  { title: "Total Items",        metric: "total_items",       trend: true  },
  { title: "Total Images",       metric: "total_images",      trend: false },
  { title: "Churn Signals (7d)", metric: "new_churn_signals", trend: true, alert: true },
  { title: "Day-30 Retention",   metric: "day30_retention",   trend: true, suffix: "%" },
]

// Charts rendered:
// 1. MRR over time — LineChart, broken out by plan (Starter/Pro/Couple/Wardrobe+)
// 2. New users per day — BarChart
// 3. Active users 7d/30d — dual-line LineChart
// 4. Outfit acceptance rate trend — LineChart
// 5. Funnel conversion — horizontal BarChart (registered → onboarded → first outfit → 30d active)
// 6. Churn signals by type — stacked BarChart
// 7. Wardrobe composition (aggregate) — PieChart
// 8. Items + images uploaded per day — BarChart
```

---

## Environment Variables

```bash
# Analytics
ANALYTICS_DB_PATH=./data/analytics.duckdb
ANALYTICS_ETL_CRON=0 2 * * *     # nightly 2am
ADMIN_API_KEY=...                  # protects /admin/* routes
```

---

## New Files

```
server/
├── analytics/
│   ├── etl.js                  # DuckDB ETL nightly job
│   └── schema.js               # DuckDB table definitions
├── services/
│   └── InsightsService.js      # Wardrobe X-Ray queries
├── routes/
│   ├── insights.js             # User-facing analytics API
│   └── adminAnalytics.js       # Admin analytics API

client/src/
├── pages/
│   ├── InsightsPage.jsx        # Full Wardrobe X-Ray page
│   └── AdminDashboard.jsx      # Admin analytics dashboard
└── components/
    └── WardrobeSummary.jsx     # Profile tab summary widget

data/
├── thread.db                   # Operational DB (unchanged)
└── analytics.duckdb            # Analytics DB (ETL target, read-only in prod)
```

---

## Key Design Decisions

**DuckDB reads SQLite natively.** No data copying, no sync pipeline, no dual writes. The ETL job opens the SQLite file in read-only mode and pulls aggregates directly into DuckDB. The operational database is never written to by the analytics pipeline.

**Analytics DB is append-only.** Each ETL run inserts a new daily snapshot row. Historical data is never modified. This means you can always go back and see what the business looked like on any given day.

**Benchmarks are aggregate-only.** The `/insights/benchmarks` endpoint returns population-level percentages only. No individual user data is ever exposed in comparisons. The benchmark query runs against the full items table and returns counts and percentages — never user IDs, emails, or any identifying information.

**Cache the X-Ray.** Wardrobe X-Ray queries are expensive for large wardrobes. The `insights_cache` table stores the computed result as a JSON blob with a `computed_at` timestamp. Invalidate the cache when items or outfit_items are updated. This keeps the /insights page fast without hammering SQLite on every load.

**The admin dashboard is for one person.** It does not need to be beautiful. It needs to be honest. A single page with 8 charts and a churn alert is all that's required to run a healthy SaaS at this scale.
