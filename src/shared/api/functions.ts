import { supabase } from './supabase'

export type Role = 'admin' | 'manager' | 'driver' | 'shop'

export interface Profile {
  user_id: string
  role: Role
  name: string
  phone: string
  shop_id: string | null
  vehicle_id: string | null
  active: boolean
  must_change_pin: boolean
}

/** Error codes returned by the Edge Functions, used as i18n keys under `errors.`. */
export class ApiError extends Error {
  code: string
  detail?: Record<string, unknown>
  constructor(code: string, detail?: Record<string, unknown>) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    // FunctionsHttpError carries the JSON body in error.context (a Response).
    const res = (error as { context?: Response }).context
    const payload = res ? await res.json().catch(() => null) : null
    throw new ApiError(payload?.error ?? 'NETWORK', payload ?? undefined)
  }
  return data as T
}

export const homeFor = (role: Role): string =>
  role === 'shop' ? '/shop' : role === 'driver' ? '/driver' : '/admin'
