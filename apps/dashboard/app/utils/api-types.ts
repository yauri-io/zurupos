import type { paths } from '@zurupos/api-client'

type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: infer R }
  ? R extends { 200: infer X }
    ? Json<X>
    : R extends { 201: infer Y }
      ? Json<Y>
      : never
  : never

export type Category = Ok<'/v1/categories', 'get'>['categories'][number]
export type Item = Ok<'/v1/items', 'get'>['items'][number]
export type ModifierGroup = Ok<'/v1/modifier-groups', 'get'>['groups'][number]
export type ModifierOption = ModifierGroup['options'][number]
export type Ingredient = Ok<'/v1/ingredients', 'get'>['ingredients'][number]
export type Discount = Ok<'/v1/discounts', 'get'>['discounts'][number]
export type Settings = Ok<'/v1/settings', 'get'>
export type Recipe = Ok<'/v1/items/{id}/recipe', 'get'>
export type Effects = Ok<'/v1/modifier-options/{id}/effects', 'get'>
export type Preview = Ok<'/v1/recipes/preview', 'post'>

export const ITEM_COLORS = [
  'neutral',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'teal',
  'sky',
  'blue',
  'indigo',
  'violet',
  'pink',
  'brown',
] as const
export type ItemColor = (typeof ITEM_COLORS)[number]

// Tile colours as swatches; the app uses the same tokens.
export const COLOR_SWATCH: Record<ItemColor, string> = {
  neutral: '#a3a3a3',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  teal: '#14b8a6',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  pink: '#ec4899',
  brown: '#92400e',
}
