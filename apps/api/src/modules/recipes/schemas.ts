import { Type } from 'typebox'
import { Body, Nullable, Qty, Uuid } from '../../http/schemas.js'
import { BaseUnit } from '../ingredients/schemas.js'

const IngredientRef = {
  ingredient_id: Uuid,
  ingredient_name: Type.String(),
  base_unit: BaseUnit,
  // The ingredient was archived after it was added; it still deducts (SPEC §7.2).
  ingredient_archived: Type.Boolean(),
}

export const RecipeResponse = Type.Object({
  item_id: Uuid,
  lines: Type.Array(Type.Object({ ...IngredientRef, qty: Qty })),
})

export const PutRecipeBody = Body({
  lines: Type.Array(Body({ ingredient_id: Uuid, qty: Qty }), { maxItems: 50 }),
})

const EffectKind = Type.Enum(['add', 'remove', 'replace'])

export const EffectsResponse = Type.Object({
  option_id: Uuid,
  effects: Type.Array(
    Type.Object({
      effect: EffectKind,
      ...IngredientRef,
      target_ingredient_id: Nullable(Uuid),
      target_ingredient_name: Nullable(Type.String()),
      qty: Nullable(Qty),
    }),
  ),
})

// add: ingredient + qty. remove: ingredient only. replace: target → ingredient, qty optional
// (null keeps the original quantity). See SPEC §4.1 / §7.1.
export const PutEffectsBody = Body({
  effects: Type.Array(
    Body({
      effect: EffectKind,
      ingredient_id: Uuid,
      target_ingredient_id: Type.Optional(Nullable(Uuid)),
      qty: Type.Optional(Nullable(Qty)),
    }),
    { maxItems: 20 },
  ),
})

export const PreviewBody = Body({
  item_id: Uuid,
  option_ids: Type.Array(Uuid, { maxItems: 50, uniqueItems: true }),
  qty: Type.Optional(Type.Integer({ minimum: 1, maximum: 999 })),
})

export const PreviewResponse = Type.Object({
  item_id: Uuid,
  qty: Type.Integer(),
  ingredients: Type.Array(
    Type.Object({ ingredient_id: Uuid, ingredient_name: Type.String(), base_unit: BaseUnit, qty: Qty }),
  ),
})
