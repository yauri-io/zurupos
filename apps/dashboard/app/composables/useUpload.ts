import { ApiFailure, type ApiErrorBody } from './useApi'

// Multipart uploads for the online menu photos (SPEC §12.7). openapi-fetch has
// no body type for these routes (D-086), so this sends FormData with fetch,
// with the same cookie, CSRF header and language as every other API call.
export const useUpload = () => {
  const config = useRuntimeConfig()
  const { locale } = useNuxtApp().$i18n
  return async <T>(method: 'PUT' | 'POST', path: string, file: Blob, filename = 'photo.jpg'): Promise<T> => {
    const form = new FormData()
    form.append('file', file, filename)
    const res = await fetch(`${config.public.apiBase}${path}`, {
      method,
      body: form,
      credentials: 'include',
      headers: { 'X-Requested-With': 'zuru', 'Accept-Language': locale.value },
    })
    const body: unknown = await res.json().catch(() => null)
    if (res.ok) return body as T
    const error = (body as ApiErrorBody | null)?.error
    throw new ApiFailure(
      res.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? res.statusText,
      error?.details,
    )
  }
}
