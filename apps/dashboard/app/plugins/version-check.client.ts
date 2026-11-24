// After a deploy, open tabs keep running the old build until reloaded (D-057).
// Check the server's version every 5 minutes and when the tab comes back into
// view; if it changed, offer a reload. Never reloads by itself: a form may be
// half filled in.
const EVERY_MS = 5 * 60_000

export default defineNuxtPlugin((nuxtApp) => {
  const loaded = useRuntimeConfig().public.appVersion
  const toast = useToast()
  const t = nuxtApp.$i18n.t
  let offered = false

  const check = async () => {
    if (offered || document.visibilityState !== 'visible') return
    try {
      const res = await fetch('/_version', { cache: 'no-store' })
      if (!res.ok) return
      const body: { version?: unknown } = await res.json()
      if (!isNewBuild(loaded, body.version)) return
      offered = true
      toast.add({
        id: 'new-version',
        title: t('version.new_title'),
        description: t('version.new_body'),
        icon: 'i-lucide-refresh-cw',
        color: 'info',
        duration: 0,
        actions: [{ label: t('version.reload'), onClick: () => window.location.reload() }],
      })
    } catch {
      // Offline or mid-deploy: try again on the next tick.
    }
  }

  setInterval(() => void check(), EVERY_MS)
  document.addEventListener('visibilitychange', () => void check())
})
