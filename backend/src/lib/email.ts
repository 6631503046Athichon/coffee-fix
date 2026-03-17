// Email service supporting multiple providers (Gmail SMTP, Brevo API, and Resend API)

import nodemailer from 'nodemailer'
import { Resend } from 'resend'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Get Gmail SMTP transporter
 */
function getGmailTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD

  if (!user || !pass) {
    throw new Error('Gmail configuration missing. Please set GMAIL_USER and GMAIL_APP_PASSWORD in .env')
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  })
}

/**
 * Get Brevo SMTP transporter
 */
function getBrevoTransporter() {
  const smtpPassword = process.env.BREVO_SMTP_PASSWORD
  const smtpUser = process.env.BREVO_SMTP_USER

  if (!smtpPassword || !smtpUser) {
    throw new Error('Brevo SMTP not configured. Please set BREVO_SMTP_USER and BREVO_SMTP_PASSWORD in .env')
  }

  return nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  })
}

/**
 * Get Resend client instance
 */
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }
  return new Resend(apiKey)
}

/**
 * Send email using configured service (Gmail or Resend)
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  if (process.env.EMAIL_ENABLED !== 'true') {
    const error = new Error('Email service is disabled. Set EMAIL_ENABLED=true in .env')
    console.error('[ERROR]', error.message)
    throw error
  }

  const emailService = process.env.EMAIL_SERVICE || 'resend'

  try {
    if (emailService === 'gmail') {
      await sendWithGmail(options)
    } else if (emailService === 'mailjet') {
      await sendWithMailjet(options)
    } else if (emailService === 'brevo-api') {
      await sendWithBrevoApi(options)
    } else if (emailService === 'brevo') {
      await sendWithBrevo(options)
    } else {
      await sendWithResend(options)
    }
  } catch (error) {
    console.error('[ERROR] Failed to send email:', error)
    throw error
  }
}

/**
 * Send email using Gmail SMTP
 */
async function sendWithGmail(options: EmailOptions): Promise<void> {
  const transporter = getGmailTransporter()
  const fromName = process.env.EMAIL_FROM_NAME || 'Coffee Lab Platform'
  const fromEmail = process.env.GMAIL_USER

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''),
  })
}

/**
 * Send email using Brevo SMTP
 */
async function sendWithBrevo(options: EmailOptions): Promise<void> {
  const transporter = getBrevoTransporter()
  const fromName = process.env.EMAIL_FROM_NAME || 'Coffee Lab Platform'
  const fromEmail = process.env.BREVO_FROM_EMAIL

  if (!fromEmail) {
    throw new Error('BREVO_FROM_EMAIL not configured')
  }

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''),
  })
}

/**
 * Get Mailjet SMTP transporter
 */
function getMailjetTransporter() {
  const apiKey = process.env.MAILJET_API_KEY
  const secretKey = process.env.MAILJET_SECRET_KEY

  if (!apiKey || !secretKey) {
    throw new Error('Mailjet configuration missing. Please set MAILJET_API_KEY and MAILJET_SECRET_KEY in .env')
  }

  return nodemailer.createTransport({
    host: 'in-v3.mailjet.com',
    port: 587,
    secure: false,
    auth: {
      user: apiKey,
      pass: secretKey,
    },
  })
}

/**
 * Send email using Mailjet SMTP
 */
async function sendWithMailjet(options: EmailOptions): Promise<void> {
  const transporter = getMailjetTransporter()
  const fromName = process.env.EMAIL_FROM_NAME || 'Coffee Lab Platform'
  const fromEmail = process.env.MAILJET_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@coffee-lab.com'

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''),
  })
}

/**
 * Send email using Brevo HTTP API (bypasses SMTP port blocking)
 */
async function sendWithBrevoApi(options: EmailOptions): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    throw new Error('Brevo API key not configured. Please set BREVO_API_KEY in .env')
  }

  const fromName = process.env.EMAIL_FROM_NAME || 'Coffee Lab Platform'
  const fromEmail = process.env.BREVO_FROM_EMAIL
  if (!fromEmail) {
    throw new Error('BREVO_FROM_EMAIL not configured')
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: options.to }],
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text || options.html.replace(/<[^>]*>/g, ''),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Brevo API error (${response.status}): ${errorBody}`)
  }
}

/**
 * Send email using Resend API
 */
async function sendWithResend(options: EmailOptions): Promise<void> {
  const client = getResendClient()

  if (!client) {
    throw new Error('Resend API is not configured. Please set RESEND_API_KEY in .env')
  }

  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM || 'onboarding@resend.dev'

  const result = await client.emails.send({
    from,
    to: [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''),
  })

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message || 'Unknown error'}`)
  }

  if (!result.data || !result.data.id) {
    throw new Error('Email sending failed: No email ID returned from Resend API')
  }
}

/**
 * Send welcome email to new user
 * SECURITY: Never send passwords via email
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const subject = 'Welcome to Coffee Lab Platform'
  const html = `
    <h1>Welcome, ${escapeHtml(name)}!</h1>
    <p>Your account has been created on the Coffee Lab Platform.</p>
    <p>Please contact your administrator for login credentials.</p>
    <p>You will be required to change your password on first login.</p>
  `

  await sendEmail({ to: email, subject, html })
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetToken: string, userName?: string): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  // Use hash router format: /#/reset-password?token=...
  const resetUrl = `${frontendUrl}/#/reset-password?token=${resetToken}`
  const subject = 'Password Reset - Coffee Lab Platform'
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #6366f1; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
        .button { display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello${userName ? ' ' + escapeHtml(userName) : ''},</p>
          <p>We received a request to reset your password for your Coffee Lab Platform account.</p>
          <p>Click the button below to reset your password:</p>
          <p style="text-align: center;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #6366f1; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold;">Reset Password</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #6366f1;">${resetUrl}</p>
          <p><strong>This link will expire in 10 minutes.</strong></p>
          <p>If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          <p>Coffee Lab Platform - Coffee Quality Management System</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendEmail({ to: email, subject, html })
}