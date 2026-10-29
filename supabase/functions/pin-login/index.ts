// POST { phone, pin } -> { access_token, refresh_token } | error
// Enforces lockout: 5 failed attempts in 15 minutes locks the number for 15 minutes.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cors, emailFor, isValidPin, json, normalizePhone, passwordFor } from '../_shared/pin.ts'

const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000

const url = Deno.env.get('SUPABASE_URL')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  if (!phone || !isValidPin(body.pin)) return json({ error: 'INVALID_CREDENTIALS' }, 400)

  // Count failures since the last success inside the window.
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const { data: recent, error: readErr } = await admin
    .from('login_attempts').select('success, at').eq('phone', phone).gte('at', since)
    .order('at', { ascending: false }).limit(MAX_FAILURES)
  if (readErr) return json({ error: 'SERVER_ERROR' }, 500)
  const failures = []
  for (const a of recent ?? []) { if (a.success) break; failures.push(a) }
  if (failures.length >= MAX_FAILURES) {
    const unlockAt = new Date(new Date(failures[MAX_FAILURES - 1].at).getTime() + WINDOW_MS).toISOString()
    return json({ error: 'LOCKED', unlock_at: unlockAt }, 429)
  }

  const { data, error } = await anon.auth.signInWithPassword({
    email: emailFor(phone),
    password: await passwordFor(phone, body.pin),
  })
  await admin.from('login_attempts').insert({ phone, success: !error })

  if (error || !data.session) {
    // Same response for unknown number, wrong PIN, or deactivated (banned) user.
    return json({ error: 'INVALID_CREDENTIALS', attempts_left: MAX_FAILURES - failures.length - 1 }, 401)
  }
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})
