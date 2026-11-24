// Validated runtime configuration. Every variable is documented in .env.example.

export type EmailProvider = 'smtp' | 'resend'

// Error reporting (D-053). No DSN means Sentry stays off (local dev, tests).
export type SentryConfig = {
  dsn: string | undefined
  environment: string
  release: string | undefined
}

export type Config = {
  nodeEnv: 'development' | 'test' | 'production'
  // Build version (D-057), baked into the image by deploy/prod.sh; 'dev' elsewhere.
  version: string
  host: string
  port: number
  logLevel: string
  trustProxy: boolean
  databaseUrl: string
  databasePoolMax: number
  dashboardOrigin: string
  dashboardUrl: string
  cookieSecure: boolean
  signupEnabled: boolean
  // Cloudflare Turnstile on dashboard login (D-064). Unset means no check.
  turnstileSecretKey: string | undefined
  email: {
    provider: EmailProvider
    from: string
    smtpUrl: string | undefined
    resendApiKey: string | undefined
  }
  sentry: SentryConfig
}

type Env = Record<string, string | undefined>

const required = (env: Env, key: string): string => {
  const value = env[key]
  if (value === undefined || value === '') throw new Error(`Missing required env var ${key}`)
  return value
}

const optional = (env: Env, key: string, fallback: string): string => {
  const value = env[key]
  return value === undefined || value === '' ? fallback : value
}

const bool = (env: Env, key: string, fallback: boolean): boolean => {
  const value = env[key]
  if (value === undefined || value === '') return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`Env var ${key} must be "true" or "false"`)
}

const int = (env: Env, key: string, fallback: number): number => {
  const raw = optional(env, key, String(fallback))
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`Env var ${key} must be a non-negative integer`)
  return value
}

const oneOf = <T extends string>(env: Env, key: string, allowed: readonly T[], fallback: T): T => {
  const value = optional(env, key, fallback)
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Env var ${key} must be one of ${allowed.join(', ')}`)
  }
  return value as T
}

const loadEmail = (env: Env): Config['email'] => {
  const provider = oneOf(env, 'EMAIL_PROVIDER', ['smtp', 'resend'] as const, 'smtp')
  const email = {
    provider,
    from: required(env, 'EMAIL_FROM'),
    smtpUrl: env['SMTP_URL'] || undefined,
    resendApiKey: env['RESEND_API_KEY'] || undefined,
  }
  if (provider === 'smtp' && !email.smtpUrl) throw new Error('SMTP_URL is required when EMAIL_PROVIDER=smtp')
  if (provider === 'resend' && !email.resendApiKey) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend')
  }
  return email
}

export const loadSentry = (env: Env, fallbackEnvironment: string): SentryConfig => ({
  dsn: env['SENTRY_DSN'] || undefined,
  environment: optional(env, 'SENTRY_ENVIRONMENT', fallbackEnvironment),
  // An explicit SENTRY_RELEASE wins; otherwise the build version (D-057), if any.
  release: env['SENTRY_RELEASE'] || env['ZURU_VERSION'] || undefined,
})

// The outbox worker (SPEC §10) connects as zuru_worker and only needs email settings.
export type WorkerConfig = {
  logLevel: string
  databaseUrl: string
  pollIntervalMs: number
  email: Config['email']
  sentry: SentryConfig
}

export const loadWorkerConfig = (env: Env = process.env): WorkerConfig => ({
  logLevel: optional(env, 'LOG_LEVEL', 'info'),
  databaseUrl: required(env, 'WORKER_DATABASE_URL'),
  pollIntervalMs: int(env, 'WORKER_POLL_MS', 5000),
  email: loadEmail(env),
  sentry: loadSentry(env, optional(env, 'NODE_ENV', 'development')),
})

export const loadConfig = (env: Env = process.env): Config => {
  const nodeEnv = oneOf(env, 'NODE_ENV', ['development', 'test', 'production'] as const, 'development')
  const config: Config = {
    nodeEnv,
    version: optional(env, 'ZURU_VERSION', 'dev'),
    host: optional(env, 'API_HOST', '0.0.0.0'),
    port: int(env, 'API_PORT', 4000),
    logLevel: optional(env, 'LOG_LEVEL', 'info'),
    trustProxy: bool(env, 'TRUST_PROXY', false),
    databaseUrl: required(env, 'DATABASE_URL'),
    databasePoolMax: int(env, 'DATABASE_POOL_MAX', 10),
    dashboardOrigin: required(env, 'DASHBOARD_ORIGIN'),
    dashboardUrl: required(env, 'DASHBOARD_URL'),
    cookieSecure: bool(env, 'COOKIE_SECURE', true),
    signupEnabled: bool(env, 'SIGNUP_ENABLED', false),
    turnstileSecretKey: env['TURNSTILE_SECRET_KEY'] || undefined,
    email: loadEmail(env),
    sentry: loadSentry(env, nodeEnv),
  }
  return config
}
