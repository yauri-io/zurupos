// API helpers for building menus in tests. All calls go through the real routes.
import type { App } from '../../src/http/types.js'
import { expectStatus, headersFor, type Creds } from './app.js'

export type Json = Record<string, unknown>

export const api = async (
  app: App,
  creds: Creds,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: headersFor(creds),
    ...(payload === undefined ? {} : { payload: payload as Json }),
  })

const create = async <T = { id: string }>(app: App, creds: Creds, url: string, payload: Json): Promise<T> =>
  expectStatus(await api(app, creds, 'POST', url, payload), 201).json<T>()

export const createCategory = (app: App, creds: Creds, name = 'Kopi', extra: Json = {}) =>
  create(app, creds, '/v1/categories', { name, ...extra })

export const createItem = (
  app: App,
  creds: Creds,
  categoryId: string,
  name = 'Kopi Susu',
  price = 25000,
  extra: Json = {},
) =>
  create<{ id: string; price: number }>(app, creds, '/v1/items', {
    category_id: categoryId,
    name,
    price,
    ...extra,
  })

export const createGroup = (app: App, creds: Creds, name = 'Susu', extra: Json = {}) =>
  create(app, creds, '/v1/modifier-groups', { name, selection: 'single', ...extra })

export const createOption = (app: App, creds: Creds, groupId: string, name = 'Oat', extra: Json = {}) =>
  create(app, creds, '/v1/modifier-options', { group_id: groupId, name, ...extra })

export const createIngredient = (app: App, creds: Creds, name: string, baseUnit = 'ml', extra: Json = {}) =>
  create(app, creds, '/v1/ingredients', { name, base_unit: baseUnit, ...extra })

export const createDiscount = (app: App, creds: Creds, name = 'Promo 10%', extra: Json = {}) =>
  create(app, creds, '/v1/discounts', { name, kind: 'percent', value: 1000, scope: 'order', ...extra })

export const putRecipe = async (
  app: App,
  creds: Creds,
  itemId: string,
  lines: { ingredient_id: string; qty: string }[],
) => expectStatus(await api(app, creds, 'PUT', `/v1/items/${itemId}/recipe`, { lines }), 200).json<Json>()

export const putEffects = async (app: App, creds: Creds, optionId: string, effects: Json[]) =>
  expectStatus(
    await api(app, creds, 'PUT', `/v1/modifier-options/${optionId}/effects`, { effects }),
    200,
  ).json<Json>()

export const attachGroups = async (app: App, creds: Creds, itemId: string, groupIds: string[]) =>
  expectStatus(
    await api(app, creds, 'PUT', `/v1/items/${itemId}/modifier-groups`, { group_ids: groupIds }),
    200,
  )
