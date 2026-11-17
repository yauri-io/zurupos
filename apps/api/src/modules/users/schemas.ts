import { Type } from 'typebox'
import { Body, DateTime, Email, Locale, Pin, Role, Uuid } from '../../http/schemas.js'

// Owners are created only by signup; one active owner per shop.
export const StaffRole = Type.Union([
  Type.Literal('manager'),
  Type.Literal('cashier'),
  Type.Literal('employee'),
])

export const UserResponse = Type.Object({
  id: Uuid,
  name: Type.String(),
  role: Role,
  email: Type.Union([Type.String(), Type.Null()]),
  locale: Locale,
  is_active: Type.Boolean(),
  // false for a manager who hasn't accepted the invite yet.
  has_password: Type.Boolean(),
  last_login_at: Type.Union([DateTime, Type.Null()]),
  created_at: DateTime,
})

export const UserListResponse = Type.Object({ users: Type.Array(UserResponse) })

export const CreateUserBody = Body({
  name: Type.String({ minLength: 1, maxLength: 80 }),
  role: StaffRole,
  pin: Pin,
  email: Type.Optional(Email),
  locale: Type.Optional(Locale),
})

export const UpdateUserBody = Body({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  role: Type.Optional(StaffRole),
  email: Type.Optional(Email),
  locale: Type.Optional(Locale),
})

export const ResetPinBody = Body({ pin: Pin })
