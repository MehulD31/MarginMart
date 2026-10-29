import type { TFunction } from 'i18next'
import { ApiError } from '../api/functions'

/** Maps an Edge Function / RPC error to a translated, user-facing message. */
export function errorMessage(t: TFunction, err: unknown): string {
  const code = err instanceof ApiError
    ? err.code
    : (err as { message?: string })?.message?.match(/^[A-Z_]+$/)?.[0] ?? 'generic'

  if (code === 'LOCKED' && err instanceof ApiError && typeof err.detail?.unlock_at === 'string') {
    const time = new Date(err.detail.unlock_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return t('errors.LOCKED', { time })
  }
  if (code === 'INVALID_CREDENTIALS' && err instanceof ApiError && typeof err.detail?.attempts_left === 'number') {
    const left = err.detail.attempts_left
    return `${t('errors.INVALID_CREDENTIALS')} ${left > 0 ? t('errors.attemptsLeft', { count: left }) : ''}`.trim()
  }
  const key = `errors.${code}`
  const msg = t(key)
  return msg === key ? t('errors.generic') : msg
}
