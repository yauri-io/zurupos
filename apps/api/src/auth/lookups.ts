// Pre-tenant lookups through the reviewed auth.* SECURITY DEFINER functions
// (SPEC §3.4). This file is the only place that queries without a tenant context.
import { sql } from 'kysely'
import type { Database } from '../db/kysely.js'

export type LoginLookup = {
  user_id: string
  tenant_id: string
  role: string
  password_hash: string | null
  is_active: boolean
}

export type SessionLookup = {
  session_id: string
  user_id: string
  tenant_id: string
  role: string
  kind: 'dashboard' | 'staff'
  device_id: string | null
  expires_at: Date
  revoked_at: Date | null
}

export type DeviceLookup = { device_id: string; tenant_id: string; revoked_at: Date | null }

export type PasswordResetLookup = {
  user_id: string
  tenant_id: string
  expires_at: Date
  used_at: Date | null
}

export const findLoginByEmail = async (db: Database, email: string): Promise<LoginLookup | undefined> =>
  (await sql<LoginLookup>`select * from auth.find_login_by_email(${email})`.execute(db)).rows[0]

export const findSession = async (db: Database, tokenHash: Buffer): Promise<SessionLookup | undefined> =>
  (await sql<SessionLookup>`select * from auth.find_session(${tokenHash})`.execute(db)).rows[0]

export const findDevice = async (db: Database, tokenHash: Buffer): Promise<DeviceLookup | undefined> =>
  (await sql<DeviceLookup>`select * from auth.find_device(${tokenHash})`.execute(db)).rows[0]

export const findPasswordReset = async (
  db: Database,
  tokenHash: Buffer,
): Promise<PasswordResetLookup | undefined> =>
  (await sql<PasswordResetLookup>`select * from auth.find_password_reset(${tokenHash})`.execute(db)).rows[0]

// D-081: the shop behind a public menu slug, only when its menu is published and
// it has an active owner. `current_slug` differs from `slug` for an old slug.
export type PublicMenuLookup = { tenant_id: string; current_slug: string }

export const findPublicMenu = async (db: Database, slug: string): Promise<PublicMenuLookup | undefined> =>
  (await sql<PublicMenuLookup>`select * from auth.find_public_menu(${slug})`.execute(db)).rows[0]
