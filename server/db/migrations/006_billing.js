// server/db/migrations/006_billing.js — Entitlements + billing events

export async function migrate(db) {
  // Entitlements: source of truth for what a user can access
  db.run(`
    CREATE TABLE IF NOT EXISTS entitlements (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL UNIQUE,
      plan            TEXT NOT NULL DEFAULT 'free',
      status          TEXT NOT NULL DEFAULT 'active',
      -- status: active | past_due | canceled | paused | trialing
      lago_customer_id      TEXT,
      lago_subscription_id  TEXT,
      stripe_customer_id    TEXT,
      items_limit     INTEGER NOT NULL DEFAULT 20,
      outfits_per_day INTEGER NOT NULL DEFAULT 3,
      ai_tier         TEXT NOT NULL DEFAULT 'basic',
      -- ai_tier: basic | enhanced | priority | priority_ml
      current_period_end    DATETIME,
      grace_period_end      DATETIME,
      -- grace_period_end: access continues during dunning window
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Index for fast lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_entitlements_lago ON entitlements(lago_customer_id)`);

  // Billing events log: audit trail of all webhook events
  db.run(`
    CREATE TABLE IF NOT EXISTS billing_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type      TEXT NOT NULL,
      lago_event_id   TEXT UNIQUE,
      user_id         INTEGER,
      payload         TEXT,   -- JSON blob
      processed_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_billing_events_user ON billing_events(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type)`);

  console.log('[Migration 006] Billing tables created');
}
