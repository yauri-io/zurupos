// Validated runtime configuration. Every variable is documented in .env.example.

export type EmailProvider = 'smtp' | 'resend'

export type Config = {
  nodeEnv: 'development' | 'test' | 'production'
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
  email: {
    provider: EmailProvider
    from: string
    smtpUrl: string | undefined
    resendApiKey: string | undefined
  }
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

export const loadConfig = (env: Env = process.env): Config => {
  const provider = oneOf(env, 'EMAIL_PROVIDER', ['smtp', 'resend'] as const, 'smtp')
  const config: Config = {
    nodeEnv: oneOf(env, 'NODE_ENV', ['development', 'test', 'production'] as const, 'development'),
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
    email: {
      provider,
      from: required(env, 'EMAIL_FROM'),
      smtpUrl: env['SMTP_URL'] || undefined,
      resendApiKey: env['RESEND_API_KEY'] || undefined,
    },
  }
  if (provider === 'smtp' && !config.email.smtpUrl)
    throw new Error('SMTP_URL is required when EMAIL_PROVIDER=smtp')
  if (provider === 'resend' && !config.email.resendApiKey) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend')
  }
  return config
}
