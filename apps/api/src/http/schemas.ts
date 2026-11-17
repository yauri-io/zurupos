import { Type, type TObject, type TProperties, type TSchema } from 'typebox'

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

// Whole rupiah as a JSON integer, kept well inside 2^53 (D-028).
export const MAX_MONEY = 999_999_999_999
export const Money = Type.Integer({ minimum: 0, maximum: MAX_MONEY })
// numeric(14,3) quantity as a decimal string (D-028).
export const Qty = Type.String({ pattern: '^[0-9]{1,11}(\\.[0-9]{1,3})?$' })
export const SignedQty = Type.String({ pattern: '^-?[0-9]{1,11}(\\.[0-9]{1,3})?$' })
// numeric(16,4) unit cost as a decimal string.
export const Cost = Type.String({ pattern: '^[0-9]{1,12}(\\.[0-9]{1,4})?$' })
export const Sort = Type.Integer({ minimum: 0, maximum: 100_000 })
export const Name = (maxLength: number) => Type.String({ minLength: 1, maxLength, pattern: '\\S' })
export const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()])
