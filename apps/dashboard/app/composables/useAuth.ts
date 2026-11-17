import type { paths } from '@zurupos/api-client'
import { ApiFailure, unwrap, useApi } from './useApi'

type Me = paths['/v1/auth/me']['get']['responses'][200]['content']['application/json']

export const useAuth = () => {
  const me = useState<Me | null>('auth.me', () => null)
  const loaded = useState('auth.loaded', () => false)
  const api = useApi()

  const load = async (force = false) => {
    if (loaded.value && !force) return me.value
    try {
      me.value = await unwrap(api.GET('/v1/auth/me'))
    } catch (err) {
      if (!(err instanceof ApiFailure) || err.status !== 401) throw err
      me.value = null
    }
    loaded.value = true
    return me.value
  }

  const login = async (email: string, password: string) => {
    await unwrap(api.POST('/v1/auth/login', { body: { email, password } }))
    return load(true)
  }

  const logout = async () => {
    await unwrap(api.POST('/v1/auth/logout'))
    me.value = null
    await navigateTo('/login')
  }

  const can = (permission: string) => me.value?.permissions.includes(permission) ?? false

  return { me, load, login, logout, can }
}
