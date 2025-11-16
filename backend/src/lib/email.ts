// Email service - placeholder for future email functionality
// Can be integrated with services like SendGrid, AWS SES, etc.

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Send email (placeholder - implement with actual email service)
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  // TODO: Implement email sending
  // Example with SendGrid, AWS SES, or Nodemailer
  console.log('Email would be sent:', options)
  
  // For development, just log
  if (process.env.NODE_ENV === 'development') {
    console.log('Email (dev mode):', {
      to: options.to,
      subject: options.subject,
      preview: options.html.substring(0, 100) + '...',
    })
  }
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
export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`
  const subject = 'Password Reset Request'
  const html = `
    <h1>Password Reset</h1>
    <p>You requested to reset your password.</p>
    <p>Click the link below to reset your password:</p>
    <a href="${resetUrl}">${resetUrl}</a>
    <p>This link will expire in 1 hour.</p>
  `
  
  await sendEmail({ to: email, subject, html })
}

