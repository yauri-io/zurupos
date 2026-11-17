import { Type } from 'typebox'
import { Body, DateTime, Email, Password, Pin, Role, Uuid } from '../../http/schemas.js'

const Nullable = <T extends Parameters<typeof Type.Union>[0][number]>(t: T) => Type.Union([t, Type.Null()])

export const PairBody = Body({
  email: Email,
  password: Password,
  device_name: Type.String({ minLength: 1, maxLength: 60 }),
  app_version: Type.Optional(Type.String({ maxLength: 40 })),
})

export const PairResponse = Type.Object({
  device_token: Type.String(),
  device: Type.Object({ id: Uuid, name: Type.String() }),
  shop: Type.Object({ name: Type.String() }),
})

export const DeviceListResponse = Type.Object({
  devices: Type.Array(
    Type.Object({
      id: Uuid,
      name: Type.String(),
      paired_by: Type.Object({ id: Uuid, name: Type.String() }),
      app_version: Nullable(Type.String()),
      last_seen_at: Nullable(DateTime),
      revoked_at: Nullable(DateTime),
      created_at: DateTime,
    }),
  ),
})

export const StaffListResponse = Type.Object({
  staff: Type.Array(Type.Object({ id: Uuid, name: Type.String(), role: Role })),
})

export const PinLoginBody = Body({ user_id: Uuid, pin: Pin })

export const PinLoginResponse = Type.Object({
  staff_token: Type.String(),
  expires_at: DateTime,
  user: Type.Object({ id: Uuid, name: Type.String(), role: Role }),
})

export const HeartbeatBody = Body({ app_version: Type.Optional(Type.String({ maxLength: 40 })) })

export const HeartbeatResponse = Type.Object({ server_time: DateTime })
