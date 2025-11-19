// Email service supporting multiple providers (Gmail SMTP and Resend API)

import nodemailer from 'nodemailer'
import { Resend } from 'resend'

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
  const user = process.env.BREVO_SMTP_USER
  const pass = process.env.BREVO_SMTP_PASSWORD

  if (!user || !pass) {
    throw new Error('Brevo configuration missing. Please set BREVO_SMTP_USER and BREVO_SMTP_PASSWORD in .env')
  }

  return nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user,
      pass,
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

  console.log('[EMAIL] Sending via Gmail SMTP:', {
    from: fromEmail,
    to: options.to,
    subject: options.subject,
  })

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''),
  })

  console.log('[SUCCESS] Email sent via Gmail:', {
    messageId: info.messageId,
    to: options.to,
    subject: options.subject,
  })
}

/**
 * Send email using Brevo SMTP
 */
async function sendWithBrevo(options: EmailOptions): Promise<void> {
  const transporter = getBrevoTransporter()
  const fromName = process.env.EMAIL_FROM_NAME || 'Coffee Lab Platform'
  const fromEmail = process.env.BREVO_FROM_EMAIL || process.env.BREVO_SMTP_USER

  console.log('[EMAIL] Sending via Brevo SMTP:', {
    from: fromEmail,
    to: options.to,
    subject: options.subject,
  })

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''),
  })

  console.log('[SUCCESS] Email sent via Brevo:', {
    messageId: info.messageId,
    to: options.to,
    subject: options.subject,
  })
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

  console.log('[EMAIL] Sending via Resend API:', {
    from,
    to: options.to,
    subject: options.subject,
  })

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

  console.log('[SUCCESS] Email sent via Resend:', {
    id: result.data.id,
    to: options.to,
    subject: options.subject,
  })
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(email: string, name: string, temporaryPassword?: string): Promise<void> {
  const subject = 'Welcome to Coffee Lab Platform'
  const html = `
    <h1>Welcome, ${name}!</h1>
    <p>Your account has been created on the Coffee Lab Platform.</p>
    ${temporaryPassword ? `<p>Your temporary password is: <strong>${temporaryPassword}</strong></p><p>Please change it after your first login.</p>` : ''}
    <p>You can now log in and start using the platform.</p>
  `

  await sendEmail({ to: email, subject, html })
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetToken: string, userName?: string): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`
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
          <p>Hello${userName ? ' ' + userName : ''},</p>
          <p>We received a request to reset your password for your Coffee Lab Platform account.</p>
          <p>Click the button below to reset your password:</p>
          <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
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