// Pages are private unless they declare `meta.public`. A page may also require
// a permission (`meta.permission`); the API enforces the same rules regardless.
declare module '#app' {
  interface PageMeta {
    public?: boolean
    permission?: string
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  const { load, can } = useAuth()
  const me = await load()
  if (to.meta.public) return me && to.path === '/login' ? navigateTo('/') : undefined
  if (!me) return navigateTo({ path: '/login', query: { next: to.fullPath } })
  if (!can('dashboard.access')) return navigateTo('/login')
  if (to.meta.permission && !can(to.meta.permission)) return navigateTo('/menu')
})
