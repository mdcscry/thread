// server/services/StripeService.js — Stripe API wrapper (skeleton)
// Docs: https://stripe.com/docs/api

import Stripe from 'stripe';

export class StripeService {
  constructor() {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
    this.enabled = !!this.stripe;
  }

  isEnabled() {
    return this.enabled;
  }

  // Create a Stripe customer (called by Lago, not directly)
  async createCustomer({ email, name, metadata }) {
    if (!this.enabled) {
      console.log(`[STRIPE] [DEV] Would create customer: ${email}`);
      return { id: `cus_dev_${Date.now()}` };
    }

    const customer = await this.stripe.customers.create({
      email,
      name,
      metadata,
    });

    return { id: customer.id };
  }

  // Create a payment intent (for one-off payments if needed)
  async createPaymentIntent({ amount, currency, customerId, metadata }) {
    if (!this.enabled) {
      console.log(`[STRIPE] [DEV] Would create payment intent: $${amount / 100}`);
      return { id: `pi_dev_${Date.now()}`, client_secret: `pi_dev_${Date.now()}_secret` };
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: currency || 'usd',
      customer: customerId,
      metadata,
    });

    return {
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
    };
  }

  // Get a customer's payment methods
  async getPaymentMethods(customerId) {
    if (!this.enabled) {
      return { data: [] };
    }

    const paymentMethods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    return paymentMethods;
  }

  // Create a checkout session (alternative to Lago checkout)
  async createCheckoutSession({ customerId, lineItems, successUrl, cancelUrl }) {
    if (!this.enabled) {
      console.log(`[STRIPE] [DEV] Would create checkout session`);
      return { url: `http://localhost:5173/billing/success?dev=true` };
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return { url: session.url };
  }

  // Create billing portal session
  async createPortalSession({ customerId, returnUrl }) {
    if (!this.enabled) {
      console.log(`[STRIPE] [DEV] Would create portal session`);
      return { url: `http://localhost:5173/billing?dev=true` };
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    if (!this.enabled || !process.env.STRIPE_WEBHOOK_SECRET) {
      return null;
    }

    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error(`[STRIPE] Webhook signature verification failed: ${err.message}`);
      return null;
    }
  }
}

export const stripeService = new StripeService();
