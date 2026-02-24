// server/services/LagoService.js — Lago API wrapper (skeleton)
// Docs: https://docs.getlago.com/api

export class LagoService {
  constructor() {
    this.apiUrl = process.env.LAGO_API_URL || 'https://api.getlago.com';
    this.apiKey = process.env.LAGO_API_KEY;
    this.enabled = !!this.apiKey;
  }

  // Get headers with current API key
  getHeaders() {
    if (!this.apiKey) return null;
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  // Check if Lago is configured
  isEnabled() {
    return this.enabled;
  }

  // Create or get existing customer
  async createCustomer({ userId, email, name }) {
    if (!this.enabled) {
      console.log(`[LAGO] [DEV] Would create customer: ${email}`);
      return { lago_customer_id: `dev_${userId}` };
    }

    const response = await fetch(`${this.apiUrl}/v1/customers`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        customer: {
          external_id: String(userId),
          email,
          name,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Lago createCustomer failed: ${response.status} ${err}`);
    }

    const data = await response.json();
    if (!data.customer) {
      throw new Error(`Lago createCustomer: unexpected response shape: ${JSON.stringify(data)}`);
    }
    return { lago_customer_id: data.customer.lago_id };
  }

  // Create a subscription for a customer
  async createSubscription({ lagoCustomerId, planCode }) {
    if (!this.enabled) {
      console.log(`[LAGO] [DEV] Would subscribe ${lagoCustomerId} to ${planCode}`);
      return { lago_subscription_id: `dev_sub_${Date.now()}` };
    }

    const response = await fetch(`${this.apiUrl}/v1/subscriptions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        subscription: {
          customer_id: lagoCustomerId,
          plan_code: planCode,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Lago createSubscription failed: ${response.status} ${err}`);
    }

    const data = await response.json();
    return { lago_subscription_id: data.subscription.lago_id };
  }

  // Cancel a subscription
  async cancelSubscription({ lagoSubscriptionId }) {
    if (!this.enabled) {
      console.log(`[LAGO] [DEV] Would cancel subscription ${lagoSubscriptionId}`);
      return { success: true };
    }

    // Lago uses DELETE to cancel
    const response = await fetch(
      `${this.apiUrl}/v1/subscriptions/${lagoSubscriptionId}`,
      { method: 'DELETE', headers: this.getHeaders() }
    );

    if (!response.ok && response.status !== 404) {
      const err = await response.text();
      throw new Error(`Lago cancelSubscription failed: ${response.status} ${err}`);
    }

    return { success: true };
  }

  // Get checkout URL for a plan
  async createCheckout({ lagoCustomerId, planCode, successUrl, cancelUrl }) {
    if (!this.enabled) {
      // Dev mode: return a dummy URL
      const baseUrl = process.env.BASE_URL || 'http://localhost:5173'
      return { checkout_url: `${baseUrl}/billing/success?plan=${planCode}&dev=true` };
    }

    const response = await fetch(`${this.apiUrl}/v1/checkouts`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        checkout: {
          customer_id: lagoCustomerId,
          plan_code: planCode,
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Lago createCheckout failed: ${response.status} ${err}`);
    }

    const data = await response.json();
    return { checkout_url: data.checkout.url };
  }

  // Get customer portal URL (for self-service billing management)
  async createPortalUrl({ lagoCustomerId, returnUrl }) {
    if (!this.enabled) {
      const baseUrl = process.env.BASE_URL || 'http://localhost:5173'
      return { portal_url: `${baseUrl}/billing?dev=true` };
    }

    const response = await fetch(`${this.apiUrl}/v1/customer_portal_url`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        customer_id: lagoCustomerId,
        return_url: returnUrl,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Lago createPortalUrl failed: ${response.status} ${err}`);
    }

    const data = await response.json();
    return { portal_url: data.portal_url.url };
  }
}

export const lagoService = new LagoService();
