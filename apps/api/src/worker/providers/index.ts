import type { WorkerConfig } from '../../config/env.js'
import { resendSender } from './resend.js'
import { smtpSender } from './smtp.js'
import type { EmailSender } from './types.js'

export const createSender = (email: WorkerConfig['email']): EmailSender => {
  if (email.provider === 'resend') {
    if (!email.resendApiKey) throw new Error('RESEND_API_KEY missing')
    return resendSender(email.resendApiKey)
  }
  if (!email.smtpUrl) throw new Error('SMTP_URL missing')
  return smtpSender(email.smtpUrl)
}
