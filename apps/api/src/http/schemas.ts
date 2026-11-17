import { Type, type TObject, type TProperties } from 'typebox'

export const Uuid = Type.String({ format: 'uuid' })
export const DateTime = Type.String({ format: 'date-time' })
export const Email = Type.String({ format: 'email', maxLength: 254 })
export const Pin = Type.String({ pattern: '^[0-9]{4,6}$' })
export const Password = Type.String({ minLength: 1, maxLength: 128 })
export const Locale = Type.Union([Type.Literal('id'), Type.Literal('en')])
export const Role = Type.Union([
  Type.Literal('owner'),
  Type.Literal('manager'),
  Type.Literal('cashier'),
  Type.Literal('employee'),
])

// Request bodies reject unknown properties (SPEC §15).
export const Body = <T extends TProperties>(properties: T): TObject<T> =>
  Type.Object(properties, { additionalProperties: false })

export const IdParams = Body({ id: Uuid })

export const NoContent = Type.Null()
