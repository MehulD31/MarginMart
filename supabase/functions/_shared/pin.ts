// Shared helpers for phone + PIN auth (HLD D8).
// The auth password is HMAC-SHA256(pepper, "phone:pin"). The pepper lives in Supabase Vault
// (secret `pin_pepper`), readable only by the service role through public.get_pin_pepper().
// Knowing a PIN is therefore not enough to call GoTrue directly.
import { createClient } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const normalizePhone = (raw: unknown): string | null => {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(-10)
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

export const isValidPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{6}$/.test(pin)

// Rejects PINs that are trivially guessable.
export const isWeakPin = (pin: string): boolean =>
  /^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)

export const emailFor = (phone: string) => `${phone}@login.marginmart.app`

let hmacKey: Promise<CryptoKey> | null = null

function getKey(): Promise<CryptoKey> {
  hmacKey ??= (async () => {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })
    const { data, error } = await svc.rpc('get_pin_pepper')
    if (error || typeof data !== 'string' || data.length < 32) throw new Error('pin_pepper missing in Vault')
    return crypto.subtle.importKey('raw', new TextEncoder().encode(data), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  })().catch((e) => { hmacKey = null; throw e })
  return hmacKey
}

export async function passwordFor(phone: string, pin: string): Promise<string> {
  const key = await getKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${phone}:${pin}`))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomPin(): string {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
    const pin = n.toString().padStart(6, '0')
    if (!isWeakPin(pin)) return pin
  }
}
