// The public payload, from the API's OpenAPI contract (SPEC §12.7).
import type { paths } from '@zurupos/api-client'

type PublicResponse = paths['/v1/public/menus/{slug}']['get']['responses'][200]['content']['application/json']

export type PublicMenu = Extract<PublicResponse, { kind: 'menu' }>
export type PublicMoved = Extract<PublicResponse, { kind: 'moved' }>
export type PublicShop = PublicMenu['shop']
export type PublicCategory = PublicMenu['categories'][number]
export type PublicItem = PublicCategory['items'][number]
export type PublicImg = NonNullable<PublicShop['cover']>
export type PublicHours = PublicShop['hours'][number]
