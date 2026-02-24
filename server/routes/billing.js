// server/routes/billing.js — Checkout, portal, and entitlement endpoints
import { lagoService } from '../services/LagoService.js';
import { authenticateApiKey } from '../middleware/auth.js';

export async function billingRoutes(fastify) {
  const { entitlementService } = fastify;

  // GET /billing/plans — List available plans
  fastify.get('/billing/plans', async (request, reply) => {
    const plans = entitlementService.getPlans();
    return { plans };
  });

  // GET /billing/entitlement — Get current user's entitlement
  fastify.get('/billing/entitlement', {
    preHandler: [authenticateApiKey],
  }, async (request, reply) => {
    const userId = request.user.id;
    const entitlement = await entitlementService.check(userId);

    if (!entitlement) {
      return reply.status(404).send({ error: 'No entitlement found' });
    }

    // Add today's usage
    const todayOutfits = await entitlementService.getTodayOutfitCount(userId);
    const itemCount = await entitlementService.getItemCount(userId);

    return {
      ...entitlement,
      usage: {
        items: { current: itemCount, limit: entitlement.items_limit },
        outfits: { current: todayOutfits, limit: entitlement.outfits_per_day },
      },
    };
  });

  // POST /billing/checkout — Create checkout session for a plan
  fastify.post('/billing/checkout', {
    preHandler: [authenticateApiKey],
  }, async (request, reply) => {
    const { plan } = request.body;
    const userId = request.user.id;

    // Validate plan
    const validPlans = ['starter', 'pro', 'unlimited'];
    if (!plan || !validPlans.includes(plan)) {
      return reply.status(400).send({ error: 'Invalid plan', valid_plans: validPlans });
    }

    // Get user's email from DB
    const userRow = fastify.db.exec(`SELECT email, name FROM users WHERE id = ?`, [userId]);
    const email = userRow?.[0]?.values?.[0]?.[0];
    const name = userRow?.[0]?.values?.[0]?.[1];

    if (!email) {
      return reply.status(400).send({ error: 'User has no email' });
    }

    try {
      // Get or create Lago customer
      let { lago_customer_id } = await lagoService.createCustomer({
        userId,
        email,
        name: name || email.split('@')[0],
      });

      // Update user's entitlement with lago_customer_id if not set
      const existing = await entitlementService.get(userId);
      if (existing && !existing.lago_customer_id) {
        fastify.db.run(`
          UPDATE entitlements SET lago_customer_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `, [lago_customer_id, userId]);
      }

      // Get current base URL
      const baseUrl = process.env.BASE_URL || 'http://localhost:5173';

      // Create checkout
      const { checkout_url } = await lagoService.createCheckout({
        lagoCustomerId: lago_customer_id,
        planCode: plan,
        successUrl: `${baseUrl}/billing/success`,
        cancelUrl: `${baseUrl}/billing/cancel`,
      });

      return { checkout_url };
    } catch (err) {
      fastify.log.error({ err }, 'Checkout error');
      return reply.status(500).send({ error: 'Failed to create checkout' });
    }
  });

  // GET /billing/portal — Get customer portal URL
  fastify.get('/billing/portal', {
    preHandler: [authenticateApiKey],
  }, async (request, reply) => {
    const userId = request.user.id;

    const entitlement = await entitlementService.get(userId);
    if (!entitlement?.lago_customer_id) {
      return reply.status(400).send({ error: 'No subscription found' });
    }

    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
      const { portal_url } = await lagoService.createPortalUrl({
        lagoCustomerId: entitlement.lago_customer_id,
        returnUrl: `${baseUrl}/billing`,
      });

      return { portal_url };
    } catch (err) {
      fastify.log.error({ err }, 'Portal error');
      return reply.status(500).send({ error: 'Failed to create portal URL' });
    }
  });
}
