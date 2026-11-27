// Validated runtime configuration. Every variable is documented in .env.example.

export type EmailProvider = 'smtp' | 'resend'

// Error reporting (D-053). No DSN means Sentry stays off (local dev, tests).
export type SentryConfig = {
  dsn: string | undefined
  environment: string
  release: string | undefined
}

// Online menu images (SPEC §12.7, D-079). `local` writes into a folder the API
// serves under /media; `s3` puts objects into an S3-API bucket (Cloudflare R2).
export type MediaConfig = {
  driver: 'local' | 's3'
  localDir: string | undefined
  // Where the variants are publicly reachable, without a trailing slash.
  publicBaseUrl: string
  s3:
    | {
        endpoint: string
        bucket: string
        accessKeyId: string
        secretAccessKey: string
      }
    | undefined
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
  media: MediaConfig
  // Base of the public menu address, `<base>/<slug>` (SPEC §12.7), no trailing slash.
  menuPublicBaseUrl: string
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

const baseUrl = (env: Env, key: string): string => {
  const value = required(env, key).replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Env var ${key} must be an absolute http(s) URL`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Env var ${key} must be an absolute http(s) URL`)
  }
  return value
}

export const loadMedia = (env: Env): MediaConfig => {
  const driver = oneOf(env, 'MEDIA_DRIVER', ['local', 's3'] as const, 'local')
  const publicBaseUrl = baseUrl(env, 'MEDIA_PUBLIC_BASE_URL')
  if (driver === 'local') {
    return { driver, localDir: required(env, 'MEDIA_LOCAL_DIR'), publicBaseUrl, s3: undefined }
  }
  return {
    driver,
    localDir: undefined,
    publicBaseUrl,
    s3: {
      endpoint: baseUrl(env, 'MEDIA_S3_ENDPOINT'),
      bucket: required(env, 'MEDIA_S3_BUCKET'),
      accessKeyId: required(env, 'MEDIA_S3_ACCESS_KEY_ID'),
      secretAccessKey: required(env, 'MEDIA_S3_SECRET_ACCESS_KEY'),
    },
  }
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

// The report scheduler (SPEC §12.6) connects as zuru_app, like the API: it reads
// tenant data inside withTenant and writes to the outbox.
export type SchedulerConfig = {
  logLevel: string
  databaseUrl: string
  dashboardUrl: string
  pollIntervalMs: number
  sentry: SentryConfig
}

export const loadSchedulerConfig = (env: Env = process.env): SchedulerConfig => ({
  logLevel: optional(env, 'LOG_LEVEL', 'info'),
  databaseUrl: required(env, 'DATABASE_URL'),
  dashboardUrl: required(env, 'DASHBOARD_URL'),
  pollIntervalMs: int(env, 'SCHEDULER_POLL_MS', 300_000),
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
    media: loadMedia(env),
    menuPublicBaseUrl: baseUrl(env, 'MENU_PUBLIC_BASE_URL'),
  }
  return config
}
