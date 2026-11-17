import { ApiFailure } from './useApi'

// Toasts for saves and failures. API errors already carry a localised message.
export const useNotify = () => {
  const toast = useToast()
  const { t } = useI18n()
  return {
    saved: (title = t('common.saved')) => toast.add({ title, color: 'success', icon: 'i-lucide-check' }),
    failed: (err: unknown) => {
      const description = err instanceof ApiFailure ? err.message : t('common.unexpected_error')
      const problem = err instanceof ApiFailure ? err.details.problem : undefined
      const key = typeof problem === 'string' ? `problems.${problem}` : ''
      toast.add({
        title: t('common.failed'),
        description: key && t(key) !== key ? t(key) : description,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      })
    },
  }
}

// Runs an action, toasting success or failure; returns whether it succeeded.
export const useAction = () => {
  const notify = useNotify()
  return async (fn: () => Promise<unknown>, opts: { success?: string | false } = {}): Promise<boolean> => {
    try {
      await fn()
      if (opts.success !== false) notify.saved(opts.success)
      return true
    } catch (err) {
      notify.failed(err)
      return false
    }
  }
}
