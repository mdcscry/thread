import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.EMAIL_FROM || 'THREAD <noreply@outerfit.net>'
const HELLO_EMAIL = process.env.EMAIL_HELLO || 'THREAD <hello@outerfit.net>'
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'hello@outerfit.net'

// Email templates
function welcomeTemplate({ name }) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #1a1a1a;">Welcome to THREAD 👕</h1>
      <p style="color: #4a4a4a; font-size: 16px;">Hi ${name},</p>
      <p style="color: #4a4a4a; font-size: 16px;">Thanks for joining THREAD — your personal AI wardrobe stylist.</p>
      <p style="color: #4a4a4a; font-size: 16px;">Start by uploading some photos of your clothes, and THREAD will help you build the perfect outfit.</p>
      <p style="color: #4a4a4a; font-size: 16px;">— The THREAD Team</p>
    </div>
  `
}

function passwordResetTemplate({ resetUrl }) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #1a1a1a;">Reset Your Password</h1>
      <p style="color: #4a4a4a; font-size: 16px;">You requested a password reset for your THREAD account.</p>
      <p style="color: #4a4a4a; font-size: 16px;">
        <a href="${resetUrl}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Reset Password
        </a>
      </p>
      <p style="color: #888; font-size: 14px;">This link expires in 1 hour.</p>
      <p style="color: #888; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `
}

export const EmailService = {
  async sendWelcome({ to, name }) {
    if (!resend) {
      console.log(`📧 [DEV] Welcome email to ${to}`)
      return { id: 'dev-mode' }
    }
    return resend.emails.send({
      from: HELLO_EMAIL,
      reply_to: REPLY_TO,
      to,
      subject: 'Welcome to THREAD 👕',
      html: welcomeTemplate({ name }),
    })
  },

  async sendPasswordReset({ to, resetUrl }) {
    if (!resend) {
      console.log(`📧 [DEV] Password reset to ${to}: ${resetUrl}`)
      return { id: 'dev-mode' }
    }
    return resend.emails.send({
      from: FROM_EMAIL,
      reply_to: REPLY_TO,
      to,
      subject: 'Reset your THREAD password',
      html: passwordResetTemplate({ resetUrl }),
    })
  },

  async sendPaymentFailed({ to, name, billingPortalUrl }) {
    if (!resend) {
      console.log(`📧 [DEV] Payment failed to ${to}`)
      return { id: 'dev-mode' }
    }
    return resend.emails.send({
      from: 'THREAD <billing@outerfit.net>',
      reply_to: REPLY_TO,
      to,
      subject: 'Action needed — payment issue with your THREAD account',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Payment Issue</h1>
          <p>Hi ${name},</p>
          <p>We couldn't process your payment. Please update your billing information.</p>
          <p><a href="${billingPortalUrl}" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Update Payment</a></p>
        </div>
      `,
    })
  },
}
