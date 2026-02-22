import crypto from 'crypto'
import fetch from 'node-fetch'
import db from '../db/client.js'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

export class WebhookService {
  constructor() {
    this.queue = []
    this.processing = false
  }

  // Get all active webhooks for a user
  getWebhooks(userId, event) {
    const webhooks = db.prepare(`
      SELECT * FROM webhooks WHERE user_id = ? AND active = 1
    `).all(userId)

    return webhooks.filter(wh => {
      const events = JSON.parse(wh.events || '[]')
      return events.length === 0 || events.includes(event) || events.includes('*')
    })
  }

  // Trigger a webhook
  async trigger(userId, event, payload) {
    const webhooks = this.getWebhooks(userId, event)
    
    for (const webhook of webhooks) {
      this.queueWebhook(webhook, payload)
    }

    // Process queue in background
    this.processQueue()
  }

  queueWebhook(webhook, payload) {
    this.queue.push({
      webhook,
      payload,
      retries: 0
    })
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return
    
    this.processing = true

    while (this.queue.length > 0) {
      const item = this.queue.shift()
      await this.sendWebhook(item.webhook, item.payload)
    }

    this.processing = false
  }

  async sendWebhook(webhook, payload) {
    const body = JSON.stringify({
      event: payload.event,
      timestamp: new Date().toISOString(),
      data: payload.data
    })

    const signature = this.sign(body, webhook.secret)

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Thread-Signature': signature,
            'X-Thread-Event': payload.event
          },
          body
        })

        if (res.ok) {
          console.log(`Webhook delivered: ${webhook.url}`)
          return true
        }

        console.warn(`Webhook failed (${res.status}): ${webhook.url}`)
      } catch (err) {
        console.warn(`Webhook error: ${err.message}`)
      }

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
      }
    }

    console.error(`Webhook failed after ${MAX_RETRIES} retries: ${webhook.url}`)
    return false
  }

  sign(body, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex')
  }
}

// Singleton instance
let webhookService = null

export function getWebhookService() {
  if (!webhookService) {
    webhookService = new WebhookService()
  }
  return webhookService
}

// Convenience function for triggering events
export async function triggerWebhook(userId, event, data) {
  const service = getWebhookService()
  return service.trigger(userId, event, { event, data })
}

export default { WebhookService, getWebhookService, triggerWebhook }
