// server/routes/webhooks.js — Lago webhook handler
import crypto from 'crypto';
import { lagoService } from '../services/LagoService.js';

// Helper: get user ID by lago customer ID
async function getUserIdByLagoCustomer(db, lagoCustomerId) {
  if (!lagoCustomerId) return null;
  const result = db.exec(
    `SELECT user_id FROM entitlements WHERE lago_customer_id = ?`,
    [lagoCustomerId]
  );
  return result?.[0]?.values?.[0]?.[0] || null;
}

export async function webhookRoutes(fastify) {

  // Lago webhook
  fastify.post('/api/v1/webhooks/lago', {
    config: { rawBody: true }  // need raw body for signature verification
  }, async (request, reply) => {

    // Skip signature verification in dev mode
    if (process.env.WEBHOOK_LAGO_SECRET) {
      const signature = request.headers['x-lago-signature'];
      if (!signature) {
        return reply.status(401).send({ error: 'Missing signature' });
      }

      const expected = crypto
        .createHmac('sha256', process.env.WEBHOOK_LAGO_SECRET)
        .update(request.rawBody)
        .digest('hex');

      // Timing-safe comparison to prevent timing attacks
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');
      if (sigBuffer.length !== expectedBuffer.length || 
          !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }
    } else {
      console.log(`[WEBHOOK] [DEV] Skipping signature verification`);
    }

    const { webhook_type, object } = request.body;

    // Log every event for audit trail
    const userId = await getUserIdByLagoCustomer(fastify.db, object?.customer?.lago_id);
    fastify.db.run(`
      INSERT INTO billing_events (event_type, lago_event_id, user_id, payload)
      VALUES (?, ?, ?, ?)
    `, [webhook_type, object?.lago_id, userId, JSON.stringify(request.body)]);

    try {
      await handleLagoEvent(fastify, webhook_type, object);
    } catch (err) {
      fastify.log.error({ err, webhook_type }, 'Webhook handler error');
      // Return 200 anyway — Lago will retry on 5xx, not on handler logic errors
    }

    return reply.status(200).send({ received: true });
  });
}

async function handleLagoEvent(fastify, type, object) {
  const svc = fastify.entitlementService;

  // Look up user by lago_customer_id
  const userId = await getUserIdByLagoCustomer(fastify.db, object?.customer?.lago_id);

  if (!userId) {
    console.log(`[WEBHOOK] No user found for lago_customer: ${object?.customer?.lago_id}`);
    return;
  }

  switch (type) {

    case 'subscription.started':
      await svc.updateFromWebhook({
        userId,
        plan: object.plan?.code,
        status: 'active',
        lagoCustomerId: object.customer?.lago_id,
        lagoSubscriptionId: object.lago_id,
        currentPeriodEnd: object.next_plan_change_date,
        gracePeriodEnd: null,
      });
      console.log(`[WEBHOOK] Subscription started: user=${userId}, plan=${object.plan?.code}`);
      break;

    case 'subscription.trial_ended':
      // If they had a trial, it either transitions to active (if paid) or stays as-is
      console.log(`[WEBHOOK] Trial ended: user=${userId}`);
      break;

    case 'subscription.upgraded':
      await svc.updateFromWebhook({
        userId,
        plan: object.plan?.code,
        status: 'active',
        currentPeriodEnd: object.next_plan_change_date,
        gracePeriodEnd: null,
      });
      console.log(`[WEBHOOK] Subscription upgraded: user=${userId}, plan=${object.plan?.code}`);
      break;

    case 'subscription.downgraded':
      // Downgrade applies at period end
      await svc.updateFromWebhook({
        userId,
        plan: object.plan?.code,
        status: 'active',
        currentPeriodEnd: object.next_plan_change_date,
      });
      console.log(`[WEBHOOK] Subscription downgraded: user=${userId}, plan=${object.plan?.code}`);
      break;

    case 'subscription.terminated':
      // Canceled — drop to free
      await svc.updateFromWebhook({
        userId,
        plan: 'free',
        status: 'active',  // downgrade to free, not blocked
        lagoCustomerId: object.customer?.lago_id,
        lagoSubscriptionId: null,
        stripeCustomerId: null,
        gracePeriodEnd: null,
        currentPeriodEnd: null,
      });
      console.log(`[WEBHOOK] Subscription terminated: user=${userId}, dropped to free`);
      break;

    case 'invoice.payment_failure':
      // Grant 7-day grace period before cutting access
      const grace = new Date();
      grace.setDate(grace.getDate() + 7);
      await svc.updateFromWebhook({
        userId,
        plan: object.subscription?.plan?.code || 'free',
        status: 'past_due',
        gracePeriodEnd: grace.toISOString(),
      });
      console.log(`[WEBHOOK] Payment failed: user=${userId}, grace until ${grace.toISOString()}`);
      break;

    case 'invoice.payment_success':
      await svc.updateFromWebhook({
        userId,
        plan: object.subscription?.plan?.code || 'free',
        status: 'active',
        gracePeriodEnd: null,
        currentPeriodEnd: object.subscription?.next_plan_change_date,
      });
      console.log(`[WEBHOOK] Payment success: user=${userId}`);
      break;

    case 'customer.payment_provider_created':
      // Store stripe_customer_id when Stripe is connected
      if (object.customer?.stripe_customer_id) {
        fastify.db.run(`
          UPDATE entitlements SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE lago_customer_id = ?
        `, [object.customer.stripe_customer_id, object.customer.lago_id]);
        console.log(`[WEBHOOK] Stripe customer linked: ${object.customer.stripe_customer_id}`);
      }
      break;

    default:
      console.log(`[WEBHOOK] Unhandled event type: ${type}`);
      break;
  }
}
