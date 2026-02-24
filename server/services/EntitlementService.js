// server/services/EntitlementService.js — User entitlements & plan limits

const PLAN_LIMITS = {
  free:      { items_limit: 20,        outfits_per_day: 3,          ai_tier: 'basic' },
  starter:   { items_limit: 100,       outfits_per_day: 10,         ai_tier: 'enhanced' },
  pro:       { items_limit: 500,       outfits_per_day: Infinity,   ai_tier: 'priority' },
  unlimited: { items_limit: Infinity,  outfits_per_day: Infinity,   ai_tier: 'priority_ml' },
};

export class EntitlementService {
  constructor(db) {
    this.db = db;
  }

  // Called at registration — provision free tier immediately
  async provisionFree(userId) {
    const limits = PLAN_LIMITS.free;
    this.db.run(`
      INSERT INTO entitlements (user_id, plan, status, items_limit, outfits_per_day, ai_tier)
      VALUES (?, 'free', 'active', ?, ?, ?)
    `, [userId, limits.items_limit, limits.outfits_per_day, limits.ai_tier]);
  }

  // Called by webhook handler on subscription events
  async updateFromWebhook({ userId, plan, status, lagoCustomerId, lagoSubscriptionId,
                            stripeCustomerId, currentPeriodEnd, gracePeriodEnd }) {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    this.db.run(`
      UPDATE entitlements SET
        plan = ?, status = ?,
        lago_customer_id = ?, lago_subscription_id = ?,
        stripe_customer_id = ?,
        items_limit = ?, outfits_per_day = ?, ai_tier = ?,
        current_period_end = ?, grace_period_end = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [plan, status, lagoCustomerId, lagoSubscriptionId, stripeCustomerId,
        limits.items_limit, limits.outfits_per_day, limits.ai_tier,
        currentPeriodEnd, gracePeriodEnd, userId]);
  }

  // Get entitlements for a user
  async get(userId) {
    const row = this.db.exec(
      `SELECT * FROM entitlements WHERE user_id = ?`, [userId]
    )?.[0]?.values?.[0];
    if (!row) return null;

    // Parse columns based on schema
    const cols = this.db.exec(`PRAGMA table_info(entitlements)`)?.[0]?.values.map(c => c[1]) || [];
    const obj = {};
    cols.forEach((col, i) => obj[col] = row[i]);

    return this._enrich(obj);
  }

  // Check if user has access (includes grace period logic)
  async check(userId) {
    const entitlement = await this.get(userId);
    if (!entitlement) return null;

    const now = new Date();
    const gracePeriodEnd = entitlement.grace_period_end ? new Date(entitlement.grace_period_end) : null;
    const hasAccess = entitlement.status === 'active' ||
                      entitlement.status === 'trialing' ||
                      (entitlement.status === 'past_due' && gracePeriodEnd && now < gracePeriodEnd);

    return { ...entitlement, hasAccess };
  }

  // Get today's outfit count for a user
  async getTodayOutfitCount(userId) {
    const result = this.db.exec(`
      SELECT COUNT(*) as count FROM outfits
      WHERE user_id = ? AND DATE(created_at) = DATE('now')
    `, [userId]);
    return result?.[0]?.values?.[0]?.[0] || 0;
  }

  // Get user's item count
  async getItemCount(userId) {
    const result = this.db.exec(`
      SELECT COUNT(*) as count FROM items WHERE user_id = ?
    `, [userId]);
    return result?.[0]?.values?.[0]?.[0] || 0;
  }

  // Enrich with plan limits
  _enrich(row) {
    const limits = PLAN_LIMITS[row.plan] || PLAN_LIMITS.free;
    return {
      ...row,
      plan_limits: limits,
    };
  }

  // List all available plans
  getPlans() {
    return Object.entries(PLAN_LIMITS).map(([plan, limits]) => ({
      plan,
      ...limits,
    }));
  }
}
