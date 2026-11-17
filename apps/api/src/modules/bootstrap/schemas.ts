import { Type } from 'typebox'
import { Body, Uuid } from '../../http/schemas.js'
import { SettingsResponse } from '../settings/schemas.js'

export const BootstrapQuery = Body({ since: Type.Optional(Type.String({ maxLength: 64 })) })

const Settings = Type.Omit(SettingsResponse, ['alerts'])

// The app's menu cache (SPEC §9, §11.2). Prices are whole rupiah; no costs or recipes.
export const BootstrapResponse = Type.Object({
  menu_version: Type.String(),
  settings: Settings,
  categories: Type.Array(Type.Object({ id: Uuid, name: Type.String() })),
  items: Type.Array(
    Type.Object({
      id: Uuid,
      category_id: Uuid,
      name: Type.String(),
      price: Type.Integer(),
      color: Type.String(),
      is_available: Type.Boolean(),
      // In modifier-sheet order.
      modifier_group_ids: Type.Array(Uuid),
    }),
  ),
  modifier_groups: Type.Array(
    Type.Object({
      id: Uuid,
      name: Type.String(),
      selection: Type.Enum(['single', 'multiple']),
      min_select: Type.Integer(),
      max_select: Type.Integer(),
      options: Type.Array(
        Type.Object({
          id: Uuid,
          name: Type.String(),
          price_delta: Type.Integer(),
          is_default: Type.Boolean(),
        }),
      ),
    }),
  ),
  discounts: Type.Array(
    Type.Object({
      id: Uuid,
      name: Type.String(),
      kind: Type.Enum(['percent', 'fixed']),
      // Basis points for percent, rupiah for fixed.
      value: Type.Integer(),
      scope: Type.Enum(['item', 'order']),
    }),
  ),
})
