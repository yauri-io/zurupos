export type OutgoingEmail = { from: string; to: string[]; subject: string; html: string; text: string }

// One function per provider: send or throw. Retries are the worker's job.
export type EmailSender = (email: OutgoingEmail) => Promise<void>
