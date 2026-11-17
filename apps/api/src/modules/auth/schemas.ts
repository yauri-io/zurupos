import { Type } from 'typebox'
import { Body, Email, Locale, Password, Pin, Role, Uuid } from '../../http/schemas.js'

export const SignupBody = Body({
  shop_name: Type.String({ minLength: 1, maxLength: 120 }),
  name: Type.String({ minLength: 1, maxLength: 80 }),
  email: Email,
  password: Password,
  pin: Pin,
  locale: Type.Optional(Locale),
})

export const LoginBody = Body({ email: Email, password: Password })

export const ForgotBody = Body({ email: Email })

export const TokenPasswordBody = Body({
  token: Type.String({ minLength: 1, maxLength: 100 }),
  password: Password,
})

export const MeResponse = Type.Object({
  user: Type.Object({
    id: Uuid,
    name: Type.String(),
    role: Role,
    email: Type.Union([Type.String(), Type.Null()]),
    locale: Locale,
  }),
  // The dashboard computes "today" as a business date (SPEC §12.1) from these two.
  tenant: Type.Object({
    id: Uuid,
    name: Type.String(),
    timezone: Type.String(),
    business_day_cutoff_hour: Type.Integer(),
  }),
  session: Type.Object({
    kind: Type.Union([Type.Literal('dashboard'), Type.Literal('staff')]),
    device_id: Type.Union([Uuid, Type.Null()]),
  }),
  permissions: Type.Array(Type.String()),
})
