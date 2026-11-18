import { ApiFailure } from './useApi'

// Toasts for saves and failures. API errors already carry a localised message.
export const useNotify = () => {
  const toast = useToast()
  const { t } = useI18n()
  return {
    saved: (title = t('common.saved')) => toast.add({ title, color: 'success', icon: 'i-lucide-check' }),
    // `text` replaces the API's message when the page knows better what a failure means.
    failed: (err: unknown, text?: string) => {
      const description = text ?? (err instanceof ApiFailure ? err.message : t('common.unexpected_error'))
      const { problem, field } = err instanceof ApiFailure ? err.details : {}
      // A field-specific text first (`pin_weak`), then the generic problem text.
      const keys =
        typeof problem === 'string'
          ? [...(typeof field === 'string' ? [`problems.${field}_${problem}`] : []), `problems.${problem}`]
          : []
      const key = text === undefined ? keys.find((k) => t(k) !== k) : undefined
      toast.add({
        title: t('common.failed'),
        description: key ? t(key) : description,
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
