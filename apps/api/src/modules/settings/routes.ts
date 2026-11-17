import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import { SettingsResponse, UpdateSettingsBody } from './schemas.js'
import * as service from './service.js'

export const settingsRoutes = async (app: App) => {
  app.get(
    '/settings',
    {
      config: { auth: 'user', permission: 'settings.view' },
      schema: { tags: ['settings'], response: { 200: SettingsResponse } },
    },
    async (request) => request.tenantTx((trx) => service.getSettings(trx, requireAuth(request.auth))),
  )

  app.patch(
    '/settings',
    {
      config: { auth: 'user', permission: 'settings.manage' },
      schema: { tags: ['settings'], body: UpdateSettingsBody, response: { 200: SettingsResponse } },
    },
    async (request) => {
      const { name, tax_name, ...rest } = request.body
      return request.tenantTx((trx) =>
        service.updateSettings(trx, requireAuth(request.auth), {
          ...rest,
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(tax_name !== undefined ? { tax_name: tax_name.trim() } : {}),
        }),
      )
    },
  )
}
