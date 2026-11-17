import nodemailer from 'nodemailer'
import type { EmailSender } from './types.js'

// Local development sends to Mailpit (SMTP_URL=smtp://localhost:1025).
export const smtpSender = (url: string): EmailSender => {
  const transport = nodemailer.createTransport(url)
  return async (email) => {
    await transport.sendMail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })
  }
}
